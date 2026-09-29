import type { Candle, Currency, Instrument } from "@/lib/api/types";
import type { MarketEvent } from "@/lib/market/calendar";
import type { MarketDataProvider, OnChainMetrics } from "@/lib/market/providers";
import {
  fxLegs,
  INSTRUMENT_BY_SYMBOL,
  periodsPerYearFor,
  RISK_FREE_RATE,
  toInstrument,
} from "@/lib/market/universe";
import { crossSectionOf, indexAsOf, utcDay } from "./cross-section";
import type { Fundamentals, PeerSeries, StrategyContext } from "./types";

/**
 * How much history a single evaluation sees.
 *
 * Bounded rather than unlimited, and used identically in live evaluation and
 * in the backtest — otherwise the two would run on different amounts of data
 * and the track record would be measuring something the live engine doesn't
 * do. 420 bars clears the longest lookback in the engine (252 for momentum)
 * plus the 252-sample window the regime filter needs for its volatility
 * percentile.
 */
export const CONTEXT_BARS = 420;

/**
 * Everything the engine needs about the universe at one moment.
 *
 * Loaded once and shared across every assessment. Cross-sectional strategies
 * need each instrument's peers, so fetching per symbol would refetch the same
 * series a dozen times.
 */
export interface Universe {
  at: number;
  instruments: Instrument[];
  candles: Map<string, Candle[]>;
  fundamentals: Map<string, Fundamentals>;
  onchain: Map<string, OnChainMetrics>;
  policyRates: Record<Currency, number>;
  events: MarketEvent[];
  /**
   * Instruments whose history had not arrived when the deadline passed.
   *
   * **Not the same as an instrument with no data.** A crypto row with no
   * provider mapping returns an empty series and is permanently absent; these
   * are on their way. The distinction matters because the feed reports this
   * count as "still loading", and a screen that says that forever about
   * something which is never coming is worse than one that says nothing.
   */
  pending: string[];
}

/**
 * How long a cold load may block a request.
 *
 * The free tiers are the wall, not the code: a genuinely cold universe is 72
 * Yahoo calls plus 24 CoinGecko coins at 30 requests a minute, which is over a
 * minute of upstream time no amount of concurrency shortens. Waiting for all of
 * it means the first visitor after a deploy stares at a skeleton.
 *
 * So the load takes what has arrived and reports the rest. **Nothing is
 * wasted:** every fetch still resolves into `providers/live/cache.ts` behind the
 * response, so the work this deadline abandons is the work the next request
 * finds already done. Eight seconds is roughly the point where an equity-heavy
 * universe has landed and the slower crypto lane has not.
 */
export const LOAD_DEADLINE_MS = 8_000;

/**
 * Resolve to `null` if the promise has not settled in time.
 *
 * `null` rather than a fallback value, so the caller can tell "not yet" from
 * "the provider has nothing" — see `Universe.pending`.
 */
function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    // `unref` so an abandoned timer cannot hold a Node process open, which
    // would make `next build`'s prerender pass hang at the end.
    const timer = setTimeout(() => resolve(null), ms);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

export async function loadUniverse(
  provider: MarketDataProvider,
  at: number = Date.now(),
  { deadlineMs = LOAD_DEADLINE_MS }: { deadlineMs?: number } = {},
): Promise<Universe> {
  const instruments = provider.listInstruments();

  const [candleEntries, fundamentalEntries, onchainEntries, policyRates, events] =
    await Promise.all([
      Promise.all(
        instruments.map(
          async (i) =>
            [i.symbol, await withDeadline(provider.getCandles(i.symbol), deadlineMs)] as const,
        ),
      ),
      Promise.all(
        instruments
          .filter((i) => i.market === "equity")
          .map(
            async (i) =>
              [
                i.symbol,
                await withDeadline(provider.getFundamentals(i.symbol), deadlineMs),
              ] as const,
          ),
      ),
      Promise.all(
        instruments
          .filter((i) => i.market === "crypto")
          .map(
            async (i) =>
              [i.symbol, await withDeadline(provider.getOnChain(i.symbol), deadlineMs)] as const,
          ),
      ),
      // These two are one call each and cheap, so they keep their own deadline
      // rather than being allowed to fail — an empty rate table would silently
      // value every foreign holding at its face number.
      provider.getPolicyRates(),
      provider.getEvents(at),
    ]);

  const pending = candleEntries.filter(([, candles]) => candles === null).map(([symbol]) => symbol);

  return {
    at,
    instruments,
    candles: new Map(
      candleEntries.map(([symbol, candles]) => [symbol, candles ?? []] as const),
    ),
    fundamentals: new Map(
      fundamentalEntries.filter((e): e is [string, Fundamentals] => e[1] !== null),
    ),
    onchain: new Map(
      onchainEntries.filter((e): e is [string, OnChainMetrics] => e[1] !== null),
    ),
    policyRates,
    events,
    pending,
  };
}

/**
 * A strategy context for one instrument.
 *
 * `endIndex` truncates history to simulate a past moment — the mechanism the
 * walk-forward backtest runs on.
 *
 * Nothing downstream of this point can see a bar after `endIndex`. That is
 * the single invariant preventing lookahead bias, which is the failure mode
 * that makes a bad strategy look extraordinary.
 *
 * **Peers are truncated by date, not by index.** They used to be cut at the
 * same array index as the subject, and the comment here said that was sound
 * "because instruments in one market share a trading-day grid". That was true
 * while all 72 equities were American and it stopped being true in phase 23:
 * Yahoo returns 1,214 daily bars for one international listing and 1,280 for
 * another, so index 1,254 is today for the long series and three months ago for
 * the short one. Every cross-sectional rule was ranking a name's
 * return-to-February against another's return-to-today, and nothing failed —
 * the same shape of defect as the dropped `exchange` field one phase earlier.
 */
export function buildContext(
  universe: Universe,
  symbol: string,
  endIndex?: number,
): StrategyContext | null {
  const spec = INSTRUMENT_BY_SYMBOL.get(symbol);
  const full = universe.candles.get(symbol);
  if (!spec || !full || full.length === 0) return null;

  const last = endIndex ?? full.length - 1;
  if (last < 0 || last >= full.length) return null;

  const candles = full.slice(Math.max(0, last - CONTEXT_BARS + 1), last + 1);
  if (candles.length === 0) return null;

  const asOfDay = utcDay(full[last].t);

  const peers: PeerSeries[] = [];
  for (const instrument of universe.instruments) {
    if (instrument.market !== spec.market) continue;
    const peerCandles = universe.candles.get(instrument.symbol);
    if (!peerCandles || peerCandles.length === 0) continue;

    // The peer's own last bar on or before the subject's evaluation day. Its
    // array index is unrelated to the subject's.
    const peerEnd =
      instrument.symbol === symbol ? last : indexAsOf(peerCandles, asOfDay);
    if (peerEnd < 0) continue;

    const peerLegs = instrument.market === "fx" ? fxLegs(instrument.symbol) : null;

    const from = Math.max(0, peerEnd - CONTEXT_BARS + 1);
    const to = peerEnd + 1;
    let sliced: Candle[] | undefined;

    peers.push({
      symbol: instrument.symbol,
      market: instrument.market,
      /**
       * Sliced on first read, not on construction.
       *
       * Copying 420 bars for each of 176 peers is 74,000 element writes, and it
       * happened on **every** context built — roughly 20,000 times per backtest
       * profile, which made `buildContext` as expensive as every strategy in the
       * engine put together. Since phase 24 moved the cross-sectional measures
       * into a per-date snapshot, no equity rule reads a peer's bars at all, so
       * that copy was pure waste on the hot path.
       *
       * A getter rather than a signature change: `PeerSeries.candles` stays a
       * plain `Candle[]` to everything above, the FX rules that genuinely need
       * fourteen peer series still get them, and the memo means a strategy that
       * reads it twice pays once.
       */
      get candles() {
        return (sliced ??= peerCandles.slice(from, to));
      },
      fundamentals: universe.fundamentals.get(instrument.symbol),
      sector: instrument.sector,
      carry: peerLegs
        ? universe.policyRates[peerLegs.base] - universe.policyRates[peerLegs.quote]
        : undefined,
    });
  }

  const legs = spec.market === "fx" ? fxLegs(symbol) : null;

  return {
    /**
     * The whole spec, minus the generation parameters — never a hand-picked
     * subset.
     *
     * This was a six-field literal, and it is the **third** place the same
     * mistake was made: adding `exchange` to `Instrument` left this one behind,
     * so `assess()` never saw a venue and every equity on earth had its
     * execution window computed against New York hours. Measured on a live
     * server: Toyota, Shell and Naspers all returned 14:15–20:00 UTC, which is
     * the NYSE session to the minute.
     *
     * Nothing failed. There is no error for this; the feature simply does not
     * happen, on the one screen the product is built around. `toInstrument`
     * is exhaustive over `Instrument` and checked at compile time, so a future
     * field cannot be dropped here again.
     */
    instrument: toInstrument(spec),
    candles,
    peers,
    crossSection: crossSectionOf(universe, spec.market, asOfDay),
    fundamentals: universe.fundamentals.get(symbol),
    fx: legs
      ? {
          baseRate: universe.policyRates[legs.base],
          quoteRate: universe.policyRates[legs.quote],
        }
      : undefined,
    // On-chain metrics are a point-in-time snapshot from the provider, so
    // they're only valid for a present-day evaluation. Withheld from
    // backtests rather than applied anachronistically to a past bar.
    onchain: endIndex === undefined ? universe.onchain.get(symbol) : undefined,
    riskFreeRate: RISK_FREE_RATE,
    periodsPerYear: periodsPerYearFor(spec.market),
    // Live evaluation uses the actual clock, because the execution window is
    // measured forward from the present moment. Backtests use the bar's own
    // timestamp — bars are stamped at UTC midnight, so a live evaluation
    // reading it would open every window several hours in the past.
    now: endIndex === undefined ? universe.at : candles[candles.length - 1].t,
  };
}
