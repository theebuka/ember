import type { Strategy } from "../types";
import { clamp } from "../indicators/stats";
import { annualisedVol, pct, squash } from "./shared";

/**
 * FX carry — the interest-rate differential between the two legs of a pair.
 *
 * Uncovered interest parity says a high-rate currency should depreciate by
 * exactly its rate advantage, leaving nothing on the table. Empirically it
 * doesn't: the forward premium puzzle is one of the most durable anomalies in
 * international finance, and holding high-rate currencies against low-rate
 * ones has earned a positive average return for decades.
 *
 * The catch is the shape of that return. Carry earns steadily and then loses
 * a great deal very quickly when risk appetite turns — Brunnermeier's
 * "going up by the stairs and coming down in the elevator". Dividing by
 * realised volatility is a partial defence, since carry crashes are preceded
 * by rising volatility, but it is a mitigation and not a fix. The regime
 * filter in the ensemble does the rest of the work, and the caveat is stated
 * plainly on the methodology page.
 */
export const fxCarry: Strategy = {
  id: "fx-carry",
  name: "FX carry",
  family: "carry",
  appliesTo: ["fx"],
  minBars: 70,

  citation: {
    authors: "Lustig, Roussanov & Verdelhan",
    year: 2011,
    title: "Common Risk Factors in Currency Markets",
    where: "Review of Financial Studies 24(11)",
    claim:
      "Sorting currencies on interest-rate differentials produces a persistent excess return that compensates for exposure to global risk, not a free lunch.",
  },

  evaluate(ctx) {
    if (!ctx.fx) return null;

    // Long the pair means holding the base and funding in the quote, so the
    // carry earned is the base rate less the quote rate.
    const differential = ctx.fx.baseRate - ctx.fx.quoteRate;

    const vol = annualisedVol(ctx.candles, ctx.periodsPerYear);
    if (vol === null || vol === 0) return null;

    // Carry per unit of risk. Currency vol runs 6–12% annualised, so a 2%
    // differential is a meaningful signal here where it would be noise in
    // equities — the ratio is what makes it comparable.
    const riskAdjusted = differential / vol;
    const score = squash(riskAdjusted, 0.6);

    const [base, quote] = [
      ctx.instrument.symbol.slice(0, 3),
      ctx.instrument.symbol.slice(3, 6),
    ];
    const direction =
      differential >= 0
        ? `holding ${base} against ${quote} earns`
        : `holding ${base} against ${quote} costs`;

    return {
      strategyId: "fx-carry",
      score,
      confidence: clamp(Math.abs(riskAdjusted) / 0.8, 0.15, 0.75),
      rationale: `${base} pays ${pct(ctx.fx.baseRate)} against ${quote}'s ${pct(ctx.fx.quoteRate)}, so ${direction} ${pct(Math.abs(differential))} a year, ${(Math.abs(riskAdjusted)).toFixed(2)}× the pair's ${pct(vol)} volatility.`,
      horizonDays: 90,
      halfLifeDays: 60,
    };
  },
};
