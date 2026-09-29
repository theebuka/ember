import type { Strategy } from "../types";
import { clamp } from "../indicators/stats";
import { crossSectionalScore, ordinal, pctAbs, peerConfidence, rankOf } from "./shared";

/** A beta rank against seven names is not a rank. */
const MIN_MEMBERS = 8;
/**
 * The ceiling on this strategy's own confidence.
 *
 * The low-beta premium is measured over decades and is one of the best-evidenced
 * results in the literature — and it says nothing whatsoever about this week. A
 * risk premium that pays over years must not be able to produce the same
 * conviction as a breakout that resolves in ten days, or the execution window
 * this product is built around stops meaning anything. The cap is the honest
 * expression of "this is a tilt, not a trigger".
 */
const MAX_CONFIDENCE = 0.5;

/**
 * Betting against beta — the low-risk anomaly.
 *
 * The cleanest violation of the CAPM there is. Theory says expected return rises
 * with beta; measured, the line is far flatter than that and often slopes the
 * wrong way, so low-beta assets earn more per unit of risk than high-beta ones.
 * Frazzini and Pedersen's explanation is the part that makes it credible rather
 * than a curiosity: investors who want more return than the market but cannot
 * or will not borrow have one lever left, which is to buy high-beta assets, and
 * that crowding bids their prices up. The effect appears in US equities, in
 * nineteen other equity markets, in Treasuries, in credit and in futures — the
 * breadth is what rules out a single-market fluke.
 *
 * **This is the first strategy in the engine that is not a bet on price.** Every
 * other rule reads the tape or the accounts; this one reads the *relationship*
 * between an instrument and its market, which is why it is its own family and
 * why the regime filter treats it as the one thing that gets more useful when
 * the market falls.
 *
 * Beta is estimated the paper's own way — see `betaOf` in `cross-section.ts`,
 * where the two-window construction and the shrinkage are explained along with
 * the one place ember's data forces a departure.
 */
export const bab: Strategy = {
  id: "bab",
  name: "Betting against beta",
  family: "defensive",
  appliesTo: ["equity"],
  minBars: 253,

  citation: {
    authors: "Frazzini & Pedersen",
    year: 2014,
    title: "Betting Against Beta",
    where: "Journal of Financial Economics 111(1)",
    claim:
      "A portfolio long low-beta assets and short high-beta ones, each scaled to beta one, earned significant risk-adjusted returns in US equities, 19 other equity markets, Treasuries, credit and futures — consistent with leverage-constrained investors bidding up high-beta assets.",
  },

  evaluate(ctx) {
    const section = ctx.crossSection;
    if (!section) return null;

    const row = section.rows.get(ctx.instrument.symbol);
    if (!row || row.beta === null || row.betaCorrelation === null) return null;

    const column = section.distributions.beta;
    if (column.length < MIN_MEMBERS) return null;

    const percentile = crossSectionalScore(row.beta, column);
    if (percentile === null) return null;

    // Inverted: the low end of the beta distribution is the buy. This is the
    // entire content of the strategy and it is one minus sign, so it is worth
    // saying out loud.
    const score = -percentile;

    // Ranked from the bottom, because "12th-lowest" is the claim being made.
    const lowest = rankOf(-row.beta, column.map((b) => -b));
    const members = column.length;

    /**
     * How much of the instrument the market explains, which is exactly how much
     * the beta estimate is worth. A name whose correlation with its market is
     * 0.1 has a beta that is mostly noise, and ranking on noise is how a
     * cross-sectional strategy manufactures conviction out of nothing.
     */
    const explained = row.betaCorrelation ** 2;

    return {
      strategyId: "bab",
      score,
      confidence: clamp(
        Math.abs(row.betaCorrelation) *
          peerConfidence(members) *
          (0.55 + Math.abs(score) * 0.45),
        0.12,
        MAX_CONFIDENCE,
      ),
      rationale: `Beta of ${row.beta.toFixed(2)} — ${ordinal(lowest)}-lowest of ${members}, with the market explaining ${pctAbs(explained, 0)} of its moves. The defensive end of a market has historically paid more per unit of risk.`,
      // A premium that takes a year to show up, stated as a year. The window
      // this produces is deliberately wide: there is no moment to catch.
      horizonDays: 250,
      halfLifeDays: 180,
    };
  },
};
