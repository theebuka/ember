import type { Candle } from "@/lib/api/types";
import { clamp, latest, percentileRank } from "../indicators/stats";
import { realizedVolatility } from "../indicators/volatility";

/** Closing prices, oldest first. */
export function closesOf(candles: readonly Candle[]): number[] {
  return candles.map((c) => c.c);
}

/**
 * Total return over `lookback` bars, optionally ending `skip` bars before the
 * present.
 *
 * The skip exists for Jegadeesh–Titman's 12-1 construction: the most recent
 * month is dropped because short-horizon returns reverse, and including them
 * dilutes the momentum effect the strategy is trying to capture.
 */
export function returnOver(
  candles: readonly Candle[],
  lookback: number,
  skip = 0,
): number | null {
  const end = candles.length - 1 - skip;
  const start = end - lookback;
  if (start < 0 || end < 0) return null;

  const from = candles[start].c;
  if (from <= 0) return null;
  return candles[end].c / from - 1;
}

/**
 * Annualised realised volatility over the trailing window.
 *
 * Sliced to exactly the bars the calculation reads. `realizedVolatility`
 * returns a full aligned series, which is right for charting and for the
 * regime filter but is O(n × lookback) — and strategies only ever want the
 * last value. Over a walk-forward backtest that difference is the gap between
 * seconds and minutes.
 */
export function annualisedVol(
  candles: readonly Candle[],
  periodsPerYear: number,
  lookback = 60,
): number | null {
  const closes = closesOf(candles.slice(-(lookback + 1)));
  return latest(realizedVolatility(closes, lookback, periodsPerYear));
}

/**
 * Squash an unbounded risk-adjusted measure into the [−1, 1] score range.
 *
 * `tanh` rather than a hard clamp: conviction should keep rising with the
 * evidence but with diminishing returns, so an extreme reading doesn't
 * dominate the ensemble outright.
 */
export function squash(value: number, scale = 1): number {
  return Math.tanh(value / scale);
}

/** Where `value` sits among peers, remapped from [0,1] to [−1,1]. */
export function crossSectionalScore(
  value: number,
  peerValues: readonly number[],
): number | null {
  const pct = percentileRank(value, peerValues);
  if (pct === null) return null;
  return pct * 2 - 1;
}

/**
 * Confidence from sample size.
 *
 * A cross-sectional rank against three peers means much less than the same
 * rank against thirty, and the ensemble should weight it accordingly.
 */
export function peerConfidence(peerCount: number): number {
  return clamp(Math.sqrt(peerCount / 12), 0.2, 1);
}

/** Format a proportion as a signed percentage for a rationale sentence. */
export function pct(value: number, decimals = 1): string {
  return `${value >= 0 ? "" : "−"}${Math.abs(value * 100).toFixed(decimals)}%`;
}

/** Format a proportion as an unsigned percentage. */
export function pctAbs(value: number, decimals = 1): string {
  return `${(Math.abs(value) * 100).toFixed(decimals)}%`;
}

/**
 * Where `value` sits in a column ordered highest first. 1 is the top.
 *
 * Ties take the better rank, which is the convention `xs-momentum` and `clenow`
 * already use — with 164 continuous measures a tie is a rounding artefact, and
 * the alternative (average ranks) produces "8.5th of 164" in a sentence.
 */
export function rankOf(value: number, values: readonly number[]): number {
  let above = 0;
  for (const v of values) if (v > value) above++;
  return above + 1;
}

/** Ordinal suffix for rank phrasing — "3rd of 12". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
