import type { Strategy } from "../types";
import { withMomentumRisk } from "./momentum-risk";
import { clamp } from "../indicators/stats";
import {
  crossSectionalScore,
  ordinal,
  pctAbs,
  peerConfidence,
  rankOf,
  returnOver,
} from "./shared";

const LOOKBACK = 231; // 12 months less the skipped month
const SKIP = 21; // ~1 month

/**
 * Cross-sectional momentum, the classic 12-1 construction.
 *
 * Where time-series momentum asks "is this beating cash", this asks "is this
 * beating its peers". The two disagree usefully: in a broad rally everything
 * beats cash, and only the relative measure says which names are actually
 * leading.
 *
 * The skipped month is not an implementation detail. Short-horizon returns
 * reverse, so including the most recent month systematically dilutes the
 * effect — dropping it is part of the published rule.
 */
export const xsMomentum: Strategy = withMomentumRisk({
  id: "xs-momentum",
  name: "Cross-sectional momentum",
  family: "momentum",
  appliesTo: ["equity", "crypto"],
  minBars: LOOKBACK + SKIP + 1,

  citation: {
    authors: "Jegadeesh & Titman",
    year: 1993,
    title:
      "Returns to Buying Winners and Selling Losers: Implications for Stock Market Efficiency",
    where: "Journal of Finance 48(1)",
    claim:
      "Buying past 3–12 month winners and selling past losers earned significant abnormal returns over 1965–1989, with the most recent month skipped to avoid short-term reversal.",
  },

  evaluate(ctx) {
    const own = returnOver(ctx.candles, LOOKBACK, SKIP);
    if (own === null) return null;

    /**
     * The column comes from the shared cross-section rather than a peer loop.
     *
     * `momentum12_1` there is this exact measure — 231 bars ending 21 bars ago —
     * computed once per market per date instead of once per assessment. Same
     * arithmetic over the same bars; see `cross-section.ts` for why that matters
     * over a walk-forward backtest.
     */
    const column = ctx.crossSection?.distributions.momentum12_1;
    // A rank against nobody is not a rank. The column includes the subject, so
    // three is the old "two peers plus me".
    if (!column || column.length < 3) return null;

    const score = crossSectionalScore(own, column);
    if (score === null) return null;

    const universe = column.length;
    const rank = rankOf(own, column);

    return {
      strategyId: "xs-momentum",
      score,
      confidence: clamp(peerConfidence(universe) * (0.4 + Math.abs(score) * 0.6), 0.15, 0.9),
      // "Up −17.3%" is not a sentence. The verb has to follow the sign.
      rationale: `${own >= 0 ? "Up" : "Down"} ${pctAbs(own)} over the twelve months to a month ago, ${ordinal(rank)} of ${universe} in its market.`,
      horizonDays: 90,
      halfLifeDays: 60,
    };
  },
}, { continuity: true, crash: true });
