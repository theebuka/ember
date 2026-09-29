import type { Candle, Currency, Quote } from "@/lib/api/types";
import { fxLegs } from "@/lib/market/universe";
import { cached } from "./cache";
import { fetchJson } from "./http";
import { CONVERSION_CURRENCIES, FX_CURRENCIES } from "./mapping";

/**
 * Foreign exchange, from the European Central Bank.
 *
 * Frankfurter republishes the ECB's daily reference rates: free, no key, no
 * quota, and — unlike everything else in this directory — an official source
 * rather than a vendor's copy of one. Finnhub's forex endpoints are 403 on the
 * free tier, so this is not a fallback, it is the better answer.
 *
 * **One request covers the whole FX universe.** The ECB publishes every
 * currency against a common base on the same day, so all fourteen crosses —
 * and the conversion rates the portfolio needs — come from a single call over
 * a date range, not fourteen.
 *
 * Two honest limits, both stated on the screens that show them:
 *
 * **Closes only.** A reference rate is one number a day. There is no open,
 * high or low, so every bar carries `o = h = l = c`, and true range degenerates
 * to the absolute close-to-close move. That is a real volatility measure, and
 * it is narrower than an intraday range — ATR-derived stops on FX are
 * measuring something slightly different from ATR-derived stops on an equity.
 * The alternative was to invent a daily range, which is fabricating market
 * data.
 *
 * **Business days only, and no intraday.** The ECB does not publish at
 * weekends, which is correct for FX rather than a gap. `getIntraday` returns
 * nothing and `getSeries` already falls back to a week of daily closes for the
 * 1D range, so the chart draws a line either way.
 */

const BASE = "https://api.frankfurter.dev/v1";

interface TimeSeries {
  base: string;
  rates: Record<string, Record<string, number>>;
}

interface Latest {
  base: string;
  rates: Record<string, number>;
}

/** As far back as the engine can use. The ECB's own series goes to 1999. */
const HISTORY_YEARS = 5;

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Every rate against the dollar, by day, for the whole history.
 *
 * Cached hard: a published reference rate is final, and the only thing that
 * changes during a day is whether today's has appeared yet.
 */
function history(): Promise<TimeSeries> {
  const from = isoDay(Date.now() - HISTORY_YEARS * 365 * 86_400_000);
  return cached("frankfurter-history", "usd", { ttl: 3_600, maxAge: 7 * 86_400 }, () =>
    fetchJson<TimeSeries>(
      `${BASE}/${from}..?base=USD&symbols=${FX_CURRENCIES.join(",")}`,
    ),
  );
}

/**
 * A cross, built from two dollar rates.
 *
 * `rates[X]` is units of X per dollar. So USD/JPY is `rates.JPY` directly,
 * EUR/USD is `1 / rates.EUR`, and a cross like EUR/GBP is `rates.GBP /
 * rates.EUR`. Deriving all three from one table is why a single request covers
 * fourteen pairs.
 */
function cross(rates: Record<string, number>, base: Currency, quote: Currency): number | null {
  const perUsd = (currency: Currency): number | null =>
    currency === "USD" ? 1 : (rates[currency] ?? null);

  const b = perUsd(base);
  const q = perUsd(quote);
  if (b === null || q === null || b === 0) return null;
  return q / b;
}

export async function dailyCandles(symbol: string): Promise<Candle[]> {
  const legs = fxLegs(symbol);
  if (!legs) return [];

  const series = await history();
  const days = Object.keys(series.rates).sort();

  const candles: Candle[] = [];
  for (const day of days) {
    const rate = cross(series.rates[day], legs.base, legs.quote);
    if (rate === null) continue;
    // `o = h = l = c`: a reference rate is a single daily fixing, and the
    // header explains what that costs.
    candles.push({ t: Date.parse(`${day}T00:00:00Z`), o: rate, h: rate, l: rate, c: rate, v: 0 });
  }
  return candles;
}

export async function quote(symbol: string, at: number): Promise<Quote | null> {
  const candles = await dailyCandles(symbol);
  if (candles.length < 2) return null;

  const last = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  const change = last.c - previous.c;

  return {
    symbol,
    price: last.c,
    change,
    changePct: previous.c === 0 ? 0 : change / previous.c,
    previousClose: previous.c,
    // No intraday range to report. The last fixing is the whole of today's
    // information, and claiming a high and a low would be inventing two.
    dayHigh: last.c,
    dayLow: last.c,
    at: last.t || at,
  };
}

/**
 * USD per one unit of each currency — what the portfolio converts with.
 *
 * The published table is the other way round (units per dollar), so each is
 * inverted here. `USD` is 1 by definition and the ECB does not publish it.
 */
export async function conversionRates(): Promise<Record<string, number>> {
  const latest = await cached("frankfurter-latest", "usd", { ttl: 3_600, maxAge: 86_400 }, () =>
    fetchJson<Latest>(`${BASE}/latest?base=USD&symbols=${CONVERSION_CURRENCIES.join(",")}`),
  );

  const out: Record<string, number> = { USD: 1 };
  for (const [currency, perUsd] of Object.entries(latest.rates)) {
    if (perUsd > 0) out[currency] = 1 / perUsd;
  }
  return out;
}
