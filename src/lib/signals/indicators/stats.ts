/**
 * Small statistical helpers shared by the indicators.
 *
 * Every function here is pure and total: given a shorter input than it needs,
 * it returns null rather than NaN, so a warm-up period is a visible absence
 * instead of a number that poisons everything downstream.
 */

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

/** Sample standard deviation (n − 1). Null below two observations. */
export function stdev(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values);
  let acc = 0;
  for (const v of values) acc += (v - m) ** 2;
  return Math.sqrt(acc / (values.length - 1));
}

/** How many standard deviations `value` sits from the mean of `values`. */
export function zScore(value: number, values: readonly number[]): number | null {
  const sd = stdev(values);
  if (sd === null || sd === 0) return null;
  return (value - mean(values)) / sd;
}

/** Simple period-over-period returns. Length is `values.length - 1`. */
export function returns(values: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] / values[i - 1] - 1);
  }
  return out;
}

/**
 * Log returns. Preferred for volatility because they're additive across time,
 * so scaling by √t is actually valid.
 */
export function logReturns(values: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    out.push(Math.log(values[i] / values[i - 1]));
  }
  return out;
}

/**
 * The share of `values` at or below `value`, in [0, 1].
 *
 * Used to express "how unusual is today" — a volatility reading only means
 * something relative to that instrument's own history.
 */
export function percentileRank(
  value: number,
  values: readonly number[],
): number | null {
  if (values.length === 0) return null;
  let atOrBelow = 0;
  for (const v of values) if (v <= value) atOrBelow++;
  return atOrBelow / values.length;
}

/** Constrain to a range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The last non-null entry of an indicator series, or null if there is none. */
export function latest<T>(series: readonly (T | null)[]): T | null {
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i];
    if (v !== null) return v;
  }
  return null;
}
