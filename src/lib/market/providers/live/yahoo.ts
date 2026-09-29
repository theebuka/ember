import type { Candle, Quote } from "@/lib/api/types";
import { exchangeOf } from "@/lib/market/exchanges";
import { INSTRUMENT_BY_SYMBOL } from "@/lib/market/universe";
import { cached } from "./cache";
import { fetchJson } from "./http";
import { yahooTicker } from "./mapping";

/**
 * Daily and intraday bars for equities.
 *
 * **This is the one unlicensed dependency in ember, and it is here because
 * there is no licensed free alternative.** Finnhub's key covers quotes,
 * fundamentals, news, search and the earnings calendar; every candle endpoint
 * — `/stock/candle`, `/crypto/candle`, `/forex/candle` — answers 403 on the
 * free tier. The signal engine needs two hundred bars of history before it
 * will say anything at all, so without a price history equities cannot go
 * live, and equities are seventy-two of a hundred and ten instruments.
 *
 * Yahoo's chart endpoint is undocumented and its terms do not licence
 * programmatic use. That is fine for a personal build and **not fine for a
 * paid product**, so it sits in CLAUDE.md §7 next to the two other things that
 * have to change before ember charges anybody: Stripe's lack of Nigerian
 * payouts, and Vercel Hobby forbidding commercial use. The replacement is a
 * paid or properly-licensed feed — Finnhub's own paid tier, Polygon, Tiingo —
 * and it is this file and nothing else.
 *
 * It is isolated deliberately. Nothing above `MarketDataProvider` knows this
 * exists, so removing it is a one-file change rather than an excavation.
 *
 * The quote comes out of the same response as the history, which is the reason
 * this file also serves quotes: one request per equity per refresh instead of
 * two, on the provider with no published quota to reason about.
 */

const BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

interface ChartMeta {
  currency?: string;
  regularMarketPrice?: number;
  regularMarketTime?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  chartPreviousClose?: number;
}

interface ChartResponse {
  chart: {
    result?: Array<{
      meta: ChartMeta;
      timestamp?: number[];
      indicators: {
        quote: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: { code: string; description: string } | null;
  };
}

export interface YahooSeries {
  candles: Candle[];
  meta: ChartMeta;
}

/**
 * What to divide an upstream quote by to reach the major unit.
 *
 * **London quotes in pence and Johannesburg in cents**, and Yahoo reports them
 * that way — Shell at 3313.65 with a currency of `GBp`, Naspers at 79083 with
 * `ZAc`. Applied here, at the single point candles are built, so that nothing
 * above the provider ever sees a minor unit. Every alternative — dividing in
 * the chart, in the formatter, in `derive.ts` — is a place it can be forgotten,
 * and forgetting it misstates a holding by a factor of a hundred.
 *
 * Read from the exchange rather than sniffed from Yahoo's `currency` field: the
 * field is the *evidence* for the divisor, not a thing to branch on, and a
 * venue that starts reporting major units would silently halve nothing while a
 * venue that starts reporting minor ones would be caught by the test.
 */
function divisorFor(symbol: string): number {
  const spec = INSTRUMENT_BY_SYMBOL.get(symbol);
  return exchangeOf(spec?.exchange)?.quoteDivisor ?? 1;
}

async function chart(
  ticker: string,
  range: string,
  interval: string,
  divisor = 1,
): Promise<YahooSeries> {
  const url = `${BASE}/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}`;
  const body = await fetchJson<ChartResponse>(url);

  const result = body.chart.result?.[0];
  if (!result || !result.timestamp) return { candles: [], meta: result?.meta ?? {} };

  const q = result.indicators.quote[0] ?? {};
  const candles: Candle[] = [];

  for (let i = 0; i < result.timestamp.length; i += 1) {
    const c = q.close?.[i];
    // Yahoo returns nulls for halted sessions and for the bar of a holiday it
    // included in the range anyway. A bar with no close is not a bar — every
    // indicator downstream would read the gap as a real price of zero.
    if (c === null || c === undefined) continue;

    candles.push({
      t: result.timestamp[i] * 1000,
      o: (q.open?.[i] ?? c) / divisor,
      h: (q.high?.[i] ?? c) / divisor,
      l: (q.low?.[i] ?? c) / divisor,
      c: c / divisor,
      // Volume is a share count, not a price. Dividing it would be the mirror
      // image of the bug this divisor exists to prevent.
      v: q.volume?.[i] ?? 0,
    });
  }

  const meta = { ...result.meta };
  if (divisor !== 1) {
    for (const key of ["regularMarketPrice", "regularMarketDayHigh", "regularMarketDayLow", "chartPreviousClose"] as const) {
      const value = meta[key];
      if (typeof value === "number") meta[key] = value / divisor;
    }
  }

  return { candles, meta };
}

/**
 * Five years of daily bars, cached until well after the next close.
 *
 * The engine wants a long history — the backtest walks forward over all of it
 * and every strategy needs two hundred bars of warm-up before it will speak —
 * and a daily bar cannot change once the session has closed. Ten minutes of
 * TTL is about the live bar, which does move.
 */
export function dailySeries(symbol: string): Promise<YahooSeries> {
  const spec = INSTRUMENT_BY_SYMBOL.get(symbol);
  const exchange = exchangeOf(spec?.exchange);
  return cached(
    "yahoo-daily",
    symbol,
    { ttl: 600, maxAge: 3 * 86_400 },
    () => chart(yahooTicker(symbol, exchange), "5y", "1d", divisorFor(symbol)),
  );
}

/** Today's five-minute bars. Short TTL — this is the one that ticks. */
export function intradaySeries(symbol: string): Promise<Candle[]> {
  const spec = INSTRUMENT_BY_SYMBOL.get(symbol);
  const exchange = exchangeOf(spec?.exchange);
  return cached(
    "yahoo-intraday",
    symbol,
    { ttl: 60, maxAge: 3_600 },
    async () =>
      (await chart(yahooTicker(symbol, exchange), "1d", "5m", divisorFor(symbol))).candles,
  );
}

/**
 * A quote built from the daily response's metadata.
 *
 * `chartPreviousClose` is the close before the range began, not before today,
 * so the previous close is taken from the penultimate bar and the metadata is
 * used only for what it alone knows: the live price and today's range.
 */
export async function quote(symbol: string, at: number): Promise<Quote | null> {
  const { candles, meta } = await dailySeries(symbol);
  if (candles.length < 2) return null;

  const last = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  const live = isCurrent(meta, last);

  const price = live ? meta.regularMarketPrice! : last.c;
  const previousClose = previous.c;
  const change = price - previousClose;

  return {
    symbol,
    price,
    change,
    changePct: previousClose === 0 ? 0 : change / previousClose,
    previousClose,
    dayHigh: live ? (meta.regularMarketDayHigh ?? last.h) : last.h,
    dayLow: live ? (meta.regularMarketDayLow ?? last.l) : last.l,
    at: live ? meta.regularMarketTime! * 1000 : last.t || at,
  };
}

/**
 * Whether the metadata's live fields describe the present, or something older
 * than the bars beside them.
 *
 * **Yahoo freezes them for some venues.** Measured 2026-09-29: every Cairo
 * listing returned current daily closes and a `regularMarketPrice` stamped
 * 2024-07-23 — Elsewedy at 47.69 beside a last close of 113.45 — so the quote
 * compared a two-year-old price with last week's close and Home led "Biggest
 * moves" with five Egyptian names down 31–60% in a day. A live field older than
 * the last completed bar is not live; the bar's close is the honest price.
 */
function isCurrent(meta: ChartMeta, last: Candle): boolean {
  return (
    typeof meta.regularMarketPrice === "number" &&
    typeof meta.regularMarketTime === "number" &&
    meta.regularMarketTime * 1000 >= last.t
  );
}

/* ── Exchange rates the ECB does not publish ───────────────────────────── */

/**
 * USD per one unit, for the three currencies Frankfurter has no rate for.
 *
 * Measured against `/v1/currencies`: the ECB's daily reference set covers
 * thirty currencies and **TWD, EGP and NGN are not among them**. Without these
 * a Taiwanese or Egyptian holding would be valued at its face number, and the
 * naira would keep carrying the compiled figure CLAUDE.md §8 has been flagging
 * as the author's own currency.
 *
 * `USDXXX=X` is quoted as units of XXX per dollar, so each is inverted. One
 * request per currency, cached for an hour — these are the least volatile thing
 * in the app and there are three of them.
 *
 * This is the unlicensed dependency reaching one place further than prices,
 * which is why it is recorded in §7 rather than quietly added. The licensed
 * alternative for these three is a paid feed; there is no free one that
 * publishes the naira.
 */
export function fxRate(currency: string): Promise<number | null> {
  return cached("yahoo-fx", currency, { ttl: 3_600, maxAge: 7 * 86_400 }, async () => {
    const { candles, meta } = await chart(`USD${currency}=X`, "5d", "1d");
    const last = candles[candles.length - 1];
    if (!last) return null;
    const perUsd = isCurrent(meta, last) ? meta.regularMarketPrice! : last.c;
    return perUsd && perUsd > 0 ? 1 / perUsd : null;
  });
}
