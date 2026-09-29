import { ema, wilderSmooth } from "./moving-averages";

/**
 * Relative Strength Index, Wilder's original formulation.
 *
 * Gains and losses are smoothed with Wilder's method, not a standard EMA —
 * substituting one for the other shifts every reading and is the most common
 * way RSI implementations quietly disagree with each other.
 *
 * Connors' mean-reversion strategy uses period 2, which is why this needs to
 * behave correctly at very short periods as well as the conventional 14.
 */
export function rsi(closes: readonly number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gains.push(Math.max(change, 0));
    losses.push(Math.max(-change, 0));
  }

  const avgGain = wilderSmooth(gains, period);
  const avgLoss = wilderSmooth(losses, period);

  for (let i = 0; i < gains.length; i++) {
    const g = avgGain[i];
    const l = avgLoss[i];
    if (g === null || l === null) continue;
    // No losses in the window means no downside to weigh against: RSI is
    // pinned at 100 rather than dividing by zero.
    out[i + 1] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

/** Rate of change over `period` bars, as a proportion. */
export function roc(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = period; i < values.length; i++) {
    const base = values[i - period];
    if (base !== 0) out[i] = values[i] / base - 1;
  }
  return out;
}

export interface MacdSeries {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
}

/** MACD — fast EMA minus slow EMA, with its own EMA as the signal line. */
export function macd(
  closes: readonly number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MacdSeries {
  const fast = ema(closes, fastPeriod);
  const slow = ema(closes, slowPeriod);

  const macdLine: (number | null)[] = closes.map((_, i) =>
    fast[i] !== null && slow[i] !== null ? fast[i]! - slow[i]! : null,
  );

  // The signal EMA is defined on the MACD line itself, so it can only start
  // once that line exists. Compute it on the dense tail, then re-align.
  const firstDefined = macdLine.findIndex((v) => v !== null);
  const signal: (number | null)[] = new Array(closes.length).fill(null);

  if (firstDefined !== -1) {
    const dense = macdLine.slice(firstDefined) as number[];
    const denseSignal = ema(dense, signalPeriod);
    for (let i = 0; i < denseSignal.length; i++) {
      signal[firstDefined + i] = denseSignal[i];
    }
  }

  const histogram = macdLine.map((v, i) =>
    v !== null && signal[i] !== null ? v - signal[i]! : null,
  );

  return { macd: macdLine, signal, histogram };
}
