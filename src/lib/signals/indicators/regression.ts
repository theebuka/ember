import { mean } from "./stats";

export interface Regression {
  /** Slope in log space, per bar. */
  slope: number;
  intercept: number;
  /** Goodness of fit, 0…1. */
  r2: number;
}

/** Ordinary least squares of `y` against its own index. */
export function linearRegression(y: readonly number[]): Regression | null {
  const n = y.length;
  if (n < 3) return null;

  const xBar = (n - 1) / 2;
  const yBar = mean(y);

  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (i - xBar) * (y[i] - yBar);
    sxx += (i - xBar) ** 2;
  }
  if (sxx === 0) return null;

  const slope = sxy / sxx;
  const intercept = yBar - slope * xBar;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const fitted = intercept + slope * i;
    ssRes += (y[i] - fitted) ** 2;
    ssTot += (y[i] - yBar) ** 2;
  }
  // A flat series has no variance to explain; treat the fit as perfect
  // rather than dividing by zero.
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { slope, intercept, r2 };
}

export interface MomentumRank {
  /** Annualised exponential growth rate implied by the fit. */
  annualisedSlope: number;
  r2: number;
  /** annualisedSlope × R² — Clenow's ranking value. */
  score: number;
}

/**
 * Clenow's momentum ranking (*Stocks on the Move*, 2015).
 *
 * Regress log price on time, annualise the slope, then multiply by R². The R²
 * term is the whole idea: two instruments can have identical 90-day returns
 * while one climbed steadily and the other spiked once and chopped. The
 * steady one is tradeable and the spiky one isn't, and multiplying by fit
 * quality is what separates them.
 *
 * `periodsPerYear` is 252 for instruments that trade on exchange days and 365
 * for crypto.
 */
export function momentumRank(
  closes: readonly number[],
  period = 90,
  periodsPerYear = 252,
): (MomentumRank | null)[] {
  const out: (MomentumRank | null)[] = new Array(closes.length).fill(null);

  for (let i = period - 1; i < closes.length; i++) {
    const window = closes.slice(i - period + 1, i + 1);
    if (window.some((v) => v <= 0)) continue;

    const fit = linearRegression(window.map(Math.log));
    if (fit === null) continue;

    const annualisedSlope = Math.exp(fit.slope * periodsPerYear) - 1;
    // Negative fits are kept, but a poor fit shrinks conviction either way.
    out[i] = {
      annualisedSlope,
      r2: fit.r2,
      score: annualisedSlope * fit.r2,
    };
  }
  return out;
}
