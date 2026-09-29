import type { Strategy } from "../types";
import { clamp } from "../indicators/stats";
import { annualisedVol, pct, returnOver, squash } from "./shared";

const LOOKBACK = 252; // ~12 months of trading days

/**
 * Time-series momentum.
 *
 * Asks one question: has this instrument beaten cash over the past year? The
 * finding is that the sign of the trailing 12-month excess return predicts
 * the next month's, and that it holds across equities, currencies, bonds and
 * commodities — which is why this is the one strategy applied to all three of
 * our markets.
 *
 * Direction comes from the sign, exactly as published. Conviction is scaled
 * by volatility, following the paper's own volatility-targeted sizing: a 20%
 * gain from something that swings 15% a year is a much stronger statement
 * than the same gain from something that swings 80%.
 */
export const tsMomentum: Strategy = {
  id: "ts-momentum",
  name: "Time-series momentum",
  family: "trend",
  appliesTo: ["equity", "crypto", "fx"],
  minBars: LOOKBACK + 1,

  citation: {
    authors: "Moskowitz, Ooi & Pedersen",
    year: 2012,
    title: "Time Series Momentum",
    where: "Journal of Financial Economics 104(2)",
    claim:
      "The sign of an asset's excess return over the past twelve months predicts its return over the next month, consistently across 58 instruments and four asset classes.",
  },

  evaluate(ctx) {
    const total = returnOver(ctx.candles, LOOKBACK);
    if (total === null) return null;

    const vol = annualisedVol(ctx.candles, ctx.periodsPerYear);
    if (vol === null || vol === 0) return null;

    const excess = total - ctx.riskFreeRate;
    // Excess return per unit of risk — the paper's own scaling.
    const riskAdjusted = excess / vol;
    const score = squash(riskAdjusted, 1.2);

    const direction = excess >= 0 ? "above" : "below";

    return {
      strategyId: "ts-momentum",
      score,
      // A near-zero excess return is a genuine shrug, not a hold conviction.
      confidence: clamp(Math.abs(riskAdjusted) / 1.5, 0.15, 0.95),
      rationale: `Returned ${pct(total)} over twelve months, ${direction} the ${pct(ctx.riskFreeRate)} cash rate, against ${pct(vol)} annualised volatility.`,
      horizonDays: 60,
      halfLifeDays: 45,
    };
  },
};
