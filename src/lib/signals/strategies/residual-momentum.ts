import type { Strategy } from "../types";
import { withMomentumRisk } from "./momentum-risk";
import { clamp } from "../indicators/stats";
import { crossSectionalScore, ordinal, peerConfidence, rankOf } from "./shared";

const MIN_MEMBERS = 8;

/**
 * Residual momentum — the same twelve-month signal, with the market taken out.
 *
 * Raw cross-sectional momentum is partly a disguised factor bet. A name that
 * outran its peers over the past year may have done so on its own merits, or it
 * may simply be the highest-beta thing in a market that went up — and those two
 * are the same number in a return ranking. The consequence is not that momentum
 * doesn't work; it is that it works with enormous swings, because a portfolio of
 * past winners is quietly loaded on whatever factor last ran and gets destroyed
 * when that factor turns. Blitz, Huij and Martens strip the factor exposure out
 * and rank on what is left, roughly doubling the Sharpe ratio of the same
 * underlying effect.
 *
 * So this and `xs-momentum` are not two versions of one rule. They disagree
 * exactly where the disagreement is informative — a high-beta name in a rising
 * market ranks well on one and poorly on the other — and the ensemble surfaces
 * that split rather than averaging it away.
 *
 * The construction, the two departures ember's data forces, and why the measure
 * is a t-statistic rather than a return are all in `residualMomentumOf`.
 */
export const residualMomentum: Strategy = withMomentumRisk({
  id: "residual-momentum",
  name: "Residual momentum",
  family: "momentum",
  appliesTo: ["equity"],
  minBars: 300,

  citation: {
    authors: "Blitz, Huij & Martens",
    year: 2011,
    title: "Residual Momentum",
    where: "Journal of Empirical Finance 18(3)",
    claim:
      "Ranking stocks on twelve-month momentum measured in Fama–French residuals, scaled by residual volatility, earns the same return as conventional momentum at roughly half the volatility, because conventional momentum carries unintended factor exposure.",
  },

  evaluate(ctx) {
    const section = ctx.crossSection;
    if (!section) return null;

    const row = section.rows.get(ctx.instrument.symbol);
    if (!row || row.residualT === null) return null;

    const column = section.distributions.residualT;
    if (column.length < MIN_MEMBERS) return null;

    const score = crossSectionalScore(row.residualT, column);
    if (score === null) return null;

    const rank = rankOf(row.residualT, column);
    const members = column.length;

    const direction = row.residualT >= 0 ? "ahead of" : "behind";

    return {
      strategyId: "residual-momentum",
      score,
      /**
       * Two independent things have to be true for this read to be worth much:
       * the residual drift has to be large relative to its own noise, and there
       * have to be enough names to rank against. A t of 0.2 is a name that did
       * what its market did.
       */
      confidence: clamp(
        Math.min(Math.abs(row.residualT) / 1.5, 1) * 0.7 * peerConfidence(members) +
          Math.abs(score) * 0.2,
        0.15,
        0.8,
      ),
      rationale: `Ran ${direction} what its market beta implies over the twelve months to a month ago, by ${Math.abs(row.residualT).toFixed(1)} standard errors, ${ordinal(rank)} of ${members} once factor exposure is stripped out.`,
      horizonDays: 90,
      halfLifeDays: 55,
    };
  },
}, { continuity: true, crash: true });
