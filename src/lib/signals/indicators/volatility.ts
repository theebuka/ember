import type { Candle } from "@/lib/api/types";
import { wilderSmooth } from "./moving-averages";
import { logReturns, stdev } from "./stats";

/**
 * True range — the widest of today's range, today's high against yesterday's
 * close, and today's low against yesterday's close.
 *
 * The gap terms are the point: a stock that opens 5% below yesterday and then
 * trades quietly has been volatile, and a naive high-minus-low would miss it
 * entirely.
 */
export function trueRange(candles: readonly Candle[]): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = 1; i < candles.length; i++) {
    const { h, l } = candles[i];
    const prevClose = candles[i - 1].c;
    out[i] = Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose));
  }
  return out;
}

/**
 * Average True Range, Wilder smoothed.
 *
 * ATR is the unit of risk everywhere in this engine: stops are placed in ATR
 * multiples and position sizes are set so that a stop costs a fixed fraction
 * of your portfolio, which is what makes a signal on BTC and a signal on EURUSD
 * comparable at all.
 */
export function atr(candles: readonly Candle[], period = 14): (number | null)[] {
  const tr = trueRange(candles);
  const dense = tr.slice(1) as number[];
  const smoothed = wilderSmooth(dense, period);

  const out: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = 0; i < smoothed.length; i++) out[i + 1] = smoothed[i];
  return out;
}

/** ATR as a share of price, so it can be compared across instruments. */
export function atrPercent(
  candles: readonly Candle[],
  period = 14,
): (number | null)[] {
  const series = atr(candles, period);
  return series.map((v, i) =>
    v === null || candles[i].c === 0 ? null : v / candles[i].c,
  );
}

/**
 * Annualised realised volatility from log returns.
 *
 * `periodsPerYear` defaults to 252 trading days. Crypto trades every day, so
 * crypto callers pass 365 — using 252 there understates volatility by about
 * 20%, which would quietly oversize every crypto position.
 */
export function realizedVolatility(
  closes: readonly number[],
  lookback = 20,
  periodsPerYear = 252,
): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < lookback + 1) return out;

  for (let i = lookback; i < closes.length; i++) {
    const window = closes.slice(i - lookback, i + 1);
    const sd = stdev(logReturns(window));
    if (sd !== null) out[i] = sd * Math.sqrt(periodsPerYear);
  }
  return out;
}

/** Largest peak-to-trough decline in a series, as a positive proportion. */
export function maxDrawdown(values: readonly number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    if (peak > 0) worst = Math.max(worst, (peak - v) / peak);
  }
  return worst;
}
