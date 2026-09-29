/**
 * Moving averages.
 *
 * Every function returns a series the same length as its input, with `null`
 * through the warm-up period. Keeping indices aligned with the candle array
 * removes a whole class of off-by-one bugs in the backtester, which is the
 * one place a silent misalignment would look like alpha.
 */

/** Simple moving average. */
export function sma(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;

  let window = 0;
  for (let i = 0; i < values.length; i++) {
    window += values[i];
    if (i >= period) window -= values[i - period];
    if (i >= period - 1) out[i] = window / period;
  }
  return out;
}

/**
 * Exponential moving average, seeded with the SMA of the first `period`
 * values — the conventional seeding, and the one that makes an EMA
 * reproducible across implementations.
 */
export function ema(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;

  const alpha = 2 / (period + 1);

  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;

  for (let i = period; i < values.length; i++) {
    prev = values[i] * alpha + prev * (1 - alpha);
    out[i] = prev;
  }
  return out;
}

/**
 * Wilder's smoothing — an EMA with alpha = 1/period.
 *
 * Distinct from `ema` and not interchangeable with it: RSI and ATR are
 * defined in terms of this, and substituting a standard EMA produces values
 * that look plausible and are wrong.
 */
export function wilderSmooth(
  values: readonly number[],
  period: number,
): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;

  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;

  for (let i = period; i < values.length; i++) {
    prev = prev + (values[i] - prev) / period;
    out[i] = prev;
  }
  return out;
}
