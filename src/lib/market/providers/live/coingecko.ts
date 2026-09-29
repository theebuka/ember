import type { Candle, Quote } from "@/lib/api/types";
import type { OnChainMetrics } from "../types";
import { cached } from "./cache";
import { fetchJson } from "./http";
import { COINGECKO_IDS, SYMBOL_BY_COINGECKO_ID } from "./mapping";

/**
 * Crypto, from a source that is actually licensed for this.
 *
 * CoinGecko's demo key covers everything ember needs for the twenty-four
 * coins in the universe: prices, daily history, intraday, market cap and
 * circulating supply. Two limits shape the code here.
 *
 * **Thirty calls a minute.** So quotes are one request for all twenty-four
 * coins (`/coins/markets` takes an id list) rather than twenty-four requests,
 * and history is per-coin but cached for the day.
 *
 * **Three hundred and sixty-five days of history, and no more.** That is the
 * demo plan's ceiling and it cannot be worked around. It matters: the engine
 * needs two hundred bars before it will speak, so a backtest over a coin has
 * about a hundred and sixty usable days against an equity's twelve hundred.
 * The track record page counts what it actually walked, so this shows up as a
 * smaller crypto sample rather than as a wrong number — but it is a real
 * asymmetry and it is in CLAUDE.md §8.
 */

const BASE = "https://api.coingecko.com/api/v3";

function key(): string | undefined {
  return process.env.COINGECKO_API_KEY;
}

function headers(): Record<string, string> {
  const k = key();
  return k ? { "x-cg-demo-api-key": k } : {};
}

/* ── Quotes ────────────────────────────────────────────────────────────── */

interface MarketRow {
  id: string;
  current_price: number;
  high_24h: number | null;
  low_24h: number | null;
  price_change_24h: number | null;
  price_change_percentage_24h: number | null;
  market_cap: number | null;
  circulating_supply: number | null;
  last_updated: string;
}

/**
 * Every coin in the universe, in one request.
 *
 * Cached briefly and shared by `getQuote`, `getQuotes` and `getOnChain` — a
 * portfolio screen asking for eight coins and the on-chain panel asking for
 * one are the same upstream call.
 */
function markets(): Promise<MarketRow[]> {
  const ids = Object.values(COINGECKO_IDS).join(",");
  return cached("coingecko-markets", "all", { ttl: 45, maxAge: 900 }, () =>
    fetchJson<MarketRow[]>(
      `${BASE}/coins/markets?vs_currency=usd&ids=${ids}&per_page=250&price_change_percentage=24h`,
      { headers: headers() },
    ),
  );
}

export async function quotes(symbols: readonly string[], at: number): Promise<Quote[]> {
  const rows = await markets();
  const bySymbol = new Map(
    rows.map((row) => [SYMBOL_BY_COINGECKO_ID.get(row.id) ?? row.id, row]),
  );

  const out: Quote[] = [];
  for (const symbol of symbols) {
    const row = bySymbol.get(symbol);
    if (!row) continue;

    const change = row.price_change_24h ?? 0;
    const previousClose = row.current_price - change;

    out.push({
      symbol,
      price: row.current_price,
      change,
      /**
       * Derived, never taken from `price_change_percentage_24h`.
       *
       * CoinGecko computes the absolute and the percentage change from
       * separate snapshots, and they disagree — measured on BTC, `+66.65` came
       * back beside `−0.50%`. Rendered faithfully that is a green figure and a
       * red one on the same row, which reads as a bug in ember. One of the two
       * has to be authoritative, and it has to be the one the price is
       * consistent with.
       */
      changePct: previousClose === 0 ? 0 : change / previousClose,
      previousClose,
      dayHigh: row.high_24h ?? row.current_price,
      dayLow: row.low_24h ?? row.current_price,
      at: Date.parse(row.last_updated) || at,
    });
  }
  return out;
}

/* ── History ───────────────────────────────────────────────────────────── */

interface MarketChart {
  prices: Array<[number, number]>;
  total_volumes: Array<[number, number]>;
}

/** `[timestamp, open, high, low, close]`, four-hourly over a 30-day window. */
type OhlcRow = [number, number, number, number, number];

const DAY = 86_400_000;

function utcDay(ms: number): number {
  return Math.floor(ms / DAY) * DAY;
}

/**
 * A year of daily bars, with real ranges where they exist.
 *
 * CoinGecko's OHLC endpoint changes granularity with the window: four-hourly
 * up to thirty days, four-*daily* beyond it. So a 365-day OHLC request returns
 * ninety bars four days apart, which is not a daily series and would quietly
 * mis-scale every indicator that counts periods.
 *
 * Two calls instead, and they answer different questions. `market_chart` gives
 * a year of daily closes and volumes — the long history the engine needs.
 * `ohlc?days=30` gives four-hourly bars for the recent window, which aggregate
 * into thirty daily bars with **real** highs and lows.
 *
 * That matters more than it looks: ATR reads the last fifteen bars, and every
 * stop and every position size in the app is measured in ATR. Those fifteen
 * bars are real ranges. Older bars carry `o = h = l = c`, where true range
 * degenerates to the absolute close-to-close move — a legitimate and
 * well-understood measure, just a narrower one. Inventing a plausible-looking
 * high and low to fill the gap would be fabricating market data, which is the
 * one thing this codebase will not do.
 */
export function dailyCandles(symbol: string): Promise<Candle[]> {
  const id = COINGECKO_IDS[symbol];
  if (!id) return Promise.resolve([]);

  return cached("coingecko-daily", symbol, { ttl: 900, maxAge: 3 * 86_400 }, async () => {
    const [chart, ohlc] = await Promise.all([
      fetchJson<MarketChart>(
        `${BASE}/coins/${id}/market_chart?vs_currency=usd&days=365&interval=daily`,
        { headers: headers() },
      ),
      // Best effort. A missing recent window costs range detail, not the
      // series, so it must not take the history down with it.
      fetchJson<OhlcRow[]>(`${BASE}/coins/${id}/ohlc?vs_currency=usd&days=30`, {
        headers: headers(),
      }).catch(() => [] as OhlcRow[]),
    ]);

    const volumeByDay = new Map(chart.total_volumes.map(([t, v]) => [utcDay(t), v]));

    // Four-hourly bars folded into one bar per UTC day: first open, highest
    // high, lowest low, last close.
    const ranges = new Map<number, { o: number; h: number; l: number; c: number }>();
    for (const [t, o, h, l, c] of ohlc) {
      const day = utcDay(t);
      const existing = ranges.get(day);
      if (!existing) ranges.set(day, { o, h, l, c });
      else {
        existing.h = Math.max(existing.h, h);
        existing.l = Math.min(existing.l, l);
        existing.c = c;
      }
    }

    const candles: Candle[] = [];
    for (const [t, close] of chart.prices) {
      const day = utcDay(t);
      const range = ranges.get(day);
      candles.push({
        t: day,
        o: range?.o ?? close,
        h: range?.h ?? close,
        l: range?.l ?? close,
        // The close stays `market_chart`'s, even where a range exists: the two
        // endpoints round differently, and a series whose last bar disagrees
        // with the one before it by a rounding step reads as a real move.
        c: close,
        v: volumeByDay.get(day) ?? 0,
      });
    }

    // `market_chart` can return today twice — the last daily point and the
    // live one — which would put two bars on one date.
    return candles.filter((candle, i) => i === 0 || candle.t !== candles[i - 1].t);
  });
}

/** Today's five-minute bars, from the 1-day chart's automatic granularity. */
export function intradayCandles(symbol: string): Promise<Candle[]> {
  const id = COINGECKO_IDS[symbol];
  if (!id) return Promise.resolve([]);

  return cached("coingecko-intraday", symbol, { ttl: 90, maxAge: 3_600 }, async () => {
    const chart = await fetchJson<MarketChart>(
      `${BASE}/coins/${id}/market_chart?vs_currency=usd&days=1`,
      { headers: headers() },
    );
    const volumeAt = new Map(chart.total_volumes);
    // Point data, not bars — CoinGecko has no intraday OHLC at this
    // resolution. A price line is what the 1D chart draws anyway.
    return chart.prices.map(([t, p]) => ({ t, o: p, h: p, l: p, c: p, v: volumeAt.get(t) ?? 0 }));
  });
}

/* ── On-chain ──────────────────────────────────────────────────────────── */

/**
 * Market cap is real now; realised cap is still an approximation.
 *
 * Realised capitalisation — every coin priced when it last moved — needs
 * chain-level UTXO or transfer data that no free API serves. The 200-bar EMA
 * of market cap stands in for it, exactly as it did on generated prices, and
 * the asset screen still says the figure is derived. What changed is that it
 * is now derived from a real price path and a real supply.
 */
export async function onChain(symbol: string, candles: readonly Candle[]): Promise<OnChainMetrics | null> {
  const rows = await markets();
  const id = COINGECKO_IDS[symbol];
  const row = rows.find((r) => r.id === id);
  if (!row || !row.market_cap || !row.circulating_supply) return null;

  const supply = row.circulating_supply;
  const caps = candles.map((c) => c.c * supply);
  if (caps.length === 0) return null;

  const span = Math.min(200, caps.length);
  const k = 2 / (span + 1);
  let ema = caps[Math.max(0, caps.length - span)];
  for (let i = caps.length - span + 1; i < caps.length; i += 1) {
    if (i < 0) continue;
    ema = caps[i] * k + ema * (1 - k);
  }

  const ratios = caps.slice(-365).map((cap) => cap / ema);
  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const variance = ratios.reduce((a, b) => a + (b - mean) ** 2, 0) / ratios.length;
  const sd = Math.sqrt(variance);

  return {
    marketCap: row.market_cap,
    realizedCap: ema,
    mvrvZ: sd === 0 ? 0 : (row.market_cap / ema - mean) / sd,
  };
}
