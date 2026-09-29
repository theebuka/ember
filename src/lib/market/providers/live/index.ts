import type { Candle, Currency, Instrument, NewsItem, Quote } from "@/lib/api/types";
import type { MarketEvent } from "@/lib/market/calendar";
import {
  INSTRUMENTS,
  INSTRUMENT_BY_SYMBOL,
  POLICY_RATES,
  searchInstruments,
  toInstrument,
  USD_PER_UNIT,
} from "@/lib/market/universe";
import type { Fundamentals } from "@/lib/signals/types";
import type { MarketDataProvider, OnChainMetrics } from "../types";
import { generateEvents } from "../mock/events";
import * as coingecko from "./coingecko";
import * as finnhub from "./finnhub";
import * as frankfurter from "./frankfurter";
import { YAHOO_FX_CURRENCIES } from "./mapping";
import * as ngx from "./ngx";
import * as yahoo from "./yahoo";

/**
 * Live market data — one provider composed from four upstreams.
 *
 * No single free source covers equities, crypto and foreign exchange, so this
 * is a router rather than a client: each market goes to whoever actually
 * serves it, and the seam above (`MarketDataProvider`) cannot tell. No screen,
 * no route and no engine module changes to turn this on, which was the whole
 * point of building the interface in phase 1 against generated data.
 *
 * | | prices | history | fundamentals | news |
 * |---|---|---|---|---|
 * | equity | Yahoo | Yahoo, 5y | Finnhub, filed 10-K | Finnhub |
 * | crypto | CoinGecko | CoinGecko, 365d | — | Finnhub |
 * | fx | ECB / Frankfurter | ECB, 5y | — | Finnhub |
 *
 * **An instrument is live as a whole or it is nothing.** There is no mixing at
 * the instrument level and no falling back to generated data when an upstream
 * fails — a real quote drawn over a modelled price path is the single most
 * dishonest thing this app could render, because it looks exactly like the
 * honest version. A failed instrument returns no candles, `buildContext` drops
 * it, and it is simply absent from the feed until the source recovers.
 *
 * `synthetic` is false here, so every "Generated prices" chip in the app turns
 * itself off without being told to.
 */
export class LiveProvider implements MarketDataProvider {
  readonly id = "live";
  readonly synthetic = false;

  listInstruments(): Instrument[] {
    return INSTRUMENTS.map(toInstrument);
  }

  /**
   * Real search, over every US listing rather than a hundred and ten rows.
   *
   * Falls back to the compiled-in universe when Finnhub is unreachable,
   * because that degrades a *search box* rather than a price — the worst case
   * is finding fewer instruments, not finding a wrong one.
   */
  async searchInstruments(query: string, limit = 20): Promise<Instrument[]> {
    const local = searchInstruments(query, limit).map(toInstrument);

    if (local.length >= limit) return local;

    try {
      const remote = await finnhub.search(query, limit);
      const seen = new Set(local.map((i) => i.symbol));
      return [...local, ...remote.filter((i) => !seen.has(i.symbol))].slice(0, limit);
    } catch {
      return local;
    }
  }

  async getCandles(symbol: string, options?: { limit?: number }): Promise<Candle[]> {
    const spec = INSTRUMENT_BY_SYMBOL.get(symbol);
    if (!spec) return [];

    const candles = await this.dailyFor(spec.market, symbol, spec.exchange);
    return options?.limit ? candles.slice(-options.limit) : candles;
  }

  private async dailyFor(
    market: Instrument["market"],
    symbol: string,
    exchange: string | undefined,
  ): Promise<Candle[]> {
    try {
      if (market === "crypto") return await coingecko.dailyCandles(symbol);
      if (market === "fx") return await frankfurter.dailyCandles(symbol);
      // Lagos has no upstream history at all — ember reads back what it has
      // stored itself, and gets nothing until there is enough to be useful.
      if (exchange === "XNSA") return await ngx.dailyCandles(symbol);
      return (await yahoo.dailySeries(symbol)).candles;
    } catch {
      // Logged nowhere on purpose: one instrument failing is an ordinary
      // condition on free tiers, it recovers on the next refresh, and a
      // per-symbol warning at a hundred and ten symbols is a log nobody reads.
      return [];
    }
  }

  async getIntraday(symbol: string): Promise<Candle[]> {
    const spec = INSTRUMENT_BY_SYMBOL.get(symbol);
    if (!spec) return [];

    try {
      if (spec.market === "crypto") return await coingecko.intradayCandles(symbol);
      // The NGX board is one row a day. There is no intraday series to serve,
      // and `getSeries` answers an empty 1D range with a week of daily closes.
      if (spec.exchange === "XNSA") return [];
      // The ECB publishes one rate a day, so FX has no intraday series at all.
      // `getSeries` already answers an empty 1D range with a week of daily
      // closes, so the chart draws a line rather than a dead end.
      if (spec.market === "fx") return [];
      return await yahoo.intradaySeries(symbol);
    } catch {
      return [];
    }
  }

  async getQuote(symbol: string, at = Date.now()): Promise<Quote | null> {
    const spec = INSTRUMENT_BY_SYMBOL.get(symbol);
    if (!spec) return null;

    try {
      if (spec.market === "crypto") return (await coingecko.quotes([symbol], at))[0] ?? null;
      if (spec.market === "fx") return await frankfurter.quote(symbol, at);
      // Priced from the exchange's own board even though it has no history.
      if (spec.exchange === "XNSA") return await ngx.quote(symbol, at);
      return await yahoo.quote(symbol, at);
    } catch {
      return null;
    }
  }

  /**
   * Quotes in bulk, grouped by who serves them.
   *
   * A portfolio of twenty instruments used to be twenty calls; crypto now
   * answers all of its share in one request, and equities reuse the daily
   * series each of them has already loaded for the engine.
   */
  async getQuotes(symbols: readonly string[], at = Date.now()): Promise<Quote[]> {
    const crypto: string[] = [];
    const rest: string[] = [];

    for (const symbol of symbols) {
      const spec = INSTRUMENT_BY_SYMBOL.get(symbol);
      if (!spec) continue;
      (spec.market === "crypto" ? crypto : rest).push(symbol);
    }

    const [cryptoQuotes, others] = await Promise.all([
      crypto.length > 0 ? coingecko.quotes(crypto, at).catch(() => []) : Promise.resolve([]),
      Promise.all(rest.map((symbol) => this.getQuote(symbol, at))),
    ]);

    return [...cryptoQuotes, ...others.filter((q): q is Quote => q !== null)];
  }

  /**
   * Filed fundamentals, and **only for US listings**.
   *
   * Enterprise value needs a price, and it has to be the one every other number
   * on the screen came from — so it is read from the same cached daily series
   * the chart draws, not fetched again.
   *
   * Measured rather than assumed: `/stock/financials-reported` returns an empty
   * array for ASML and 403 for `SAP.DE`, and non-US quotes are 403 too — the
   * endpoint is EDGAR-derived, so it knows about companies that file with the
   * SEC and nobody else. Sampled across twelve international listings: zero.
   *
   * So Piotroski and the Magic Formula abstain for every one of the ninety-two
   * international rows, which costs coverage rather than confidence (decision
   * 011) and is why phase 24's additions have to be price-only. Returning early
   * on the venue rather than letting Finnhub answer 403 ninety-two times also
   * keeps a cold load off the quota for a question with a known answer.
   */
  async getFundamentals(symbol: string): Promise<Fundamentals | null> {
    const spec = INSTRUMENT_BY_SYMBOL.get(symbol);
    if (!spec || spec.market !== "equity") return null;
    if (spec.exchange !== undefined && spec.exchange !== "XNYS") return null;

    try {
      const { candles, meta } = await yahoo.dailySeries(symbol);
      const price = meta.regularMarketPrice ?? candles[candles.length - 1]?.c;
      if (!price) return null;
      return await finnhub.fundamentals(symbol, price);
    } catch {
      return null;
    }
  }

  async getOnChain(symbol: string): Promise<OnChainMetrics | null> {
    const spec = INSTRUMENT_BY_SYMBOL.get(symbol);
    if (!spec || spec.market !== "crypto") return null;

    try {
      return await coingecko.onChain(symbol, await coingecko.dailyCandles(symbol));
    } catch {
      return null;
    }
  }

  /**
   * Policy rates stay compiled in, and that is not a shortcut.
   *
   * A central bank's target rate is a published number that changes eight
   * times a year at a scheduled meeting, and no free API serves the set.
   * Finnhub's `/calendar/economic` — which would at least give the meeting
   * dates — is 403 on this key. So the table in `universe.ts` is maintained by
   * hand, which is honest for a figure that moves quarterly, and it is in
   * CLAUDE.md §8 as a thing to check rather than a thing to trust.
   */
  async getPolicyRates(): Promise<Record<Currency, number>> {
    return POLICY_RATES;
  }

  async getConversionRates(): Promise<Record<Currency, number>> {
    try {
      /**
       * Two sources, because one is not enough.
       *
       * The ECB publishes seven of the FX legs and five of the international
       * quote currencies — thirty in all — and not TWD, EGP or NGN. Those three
       * come from Yahoo, in parallel and best-effort: a currency that fails
       * keeps its compiled value rather than defaulting to 1, because a rate of
       * 1 would value a Taiwanese holding at its face number and look like a
       * plausible figure.
       */
      const [ecb, extra] = await Promise.all([
        frankfurter.conversionRates(),
        Promise.all(
          YAHOO_FX_CURRENCIES.map(async (currency) => {
            try {
              return [currency, await yahoo.fxRate(currency)] as const;
            } catch {
              return [currency, null] as const;
            }
          }),
        ),
      ]);

      const rates: Record<string, number> = { ...ecb };
      for (const [currency, rate] of extra) {
        if (rate !== null && rate > 0) rates[currency] = rate;
      }
      // Layered over the compiled table rather than replacing it, so a
      // currency neither source answered for keeps a plausible figure instead
      // of vanishing. **All sixteen are live now**, including the naira, which
      // §8 carried as a compiled value for two phases precisely because it is
      // the author's own currency and a stale rate there misstates everything.
      return { ...USD_PER_UNIT, ...rates } as Record<Currency, number>;
    } catch {
      return USD_PER_UNIT;
    }
  }

  /**
   * Real earnings dates, modelled macro releases.
   *
   * Finnhub's earnings calendar is free and its economic calendar is not, so
   * this is exactly half live. Both halves are labelled in CLAUDE.md §8 — a
   * calendar that is part filed and part modelled, presented as one, is the
   * kind of quiet blend this product exists to avoid. The generated set is
   * filtered to macro so a real earnings date is never shadowed by an invented
   * one for the same company.
   */
  async getEvents(at = Date.now()): Promise<MarketEvent[]> {
    const macro = generateEvents(at).filter((event) => event.kind !== "earnings");
    try {
      return [...(await finnhub.earnings(at)), ...macro].sort((a, b) => a.at - b.at);
    } catch {
      return macro;
    }
  }

  async getNews(): Promise<NewsItem[]> {
    try {
      return await finnhub.news();
    } catch {
      // An empty feed, never a generated one. The news screen's own empty
      // state is honest; a screen of invented headlines under a chip that says
      // "Live" would not be.
      return [];
    }
  }
}

export const liveProvider = new LiveProvider();
