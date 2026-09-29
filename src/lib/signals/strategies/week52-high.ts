import type { Strategy } from "../types";
import { clamp } from "../indicators/stats";
import { crossSectionalScore, ordinal, pctAbs, peerConfidence, rankOf } from "./shared";

const MIN_MEMBERS = 8;

/**
 * Nearness to the 52-week high.
 *
 * George and Hwang's finding is that this single ratio predicts returns *better*
 * than twelve-month momentum does, and that when both are in the same regression
 * the price-to-high measure survives and past return largely does not. Their
 * reading is anchoring: the 52-week high is the number every holder knows, and
 * good news about a stock trading near it is discounted slowly because the
 * anchor makes the price feel expensive. A stock a long way below its high has
 * the opposite problem — the anchor makes it feel cheap, and bad news is
 * absorbed too slowly.
 *
 * The reason it earns a place beside the momentum rules rather than duplicating
 * them is that the two come apart in a specific, common case: a name that ran
 * hard and then gave a third of it back still ranks well on twelve-month return
 * and badly here. That is a real distinction and the ensemble should see both
 * halves of it.
 *
 * Measured against the highest *high*, not the highest close. The anchor people
 * actually remember is the print, and it is what a chart draws.
 */
export const week52High: Strategy = {
  id: "week52-high",
  name: "52-week high proximity",
  family: "momentum",
  appliesTo: ["equity", "crypto"],
  minBars: 253,

  citation: {
    authors: "George & Hwang",
    year: 2004,
    title: "The 52-Week High and Momentum Investing",
    where: "Journal of Finance 59(5)",
    claim:
      "A stock's price relative to its 52-week high predicts future returns more strongly than past twelve-month return does, and dominates it when both are included — consistent with investors anchoring on the high.",
  },

  evaluate(ctx) {
    const section = ctx.crossSection;
    if (!section) return null;

    const row = section.rows.get(ctx.instrument.symbol);
    if (!row || row.highProximity === null) return null;

    const column = section.distributions.highProximity;
    if (column.length < MIN_MEMBERS) return null;

    const score = crossSectionalScore(row.highProximity, column);
    if (score === null) return null;

    const rank = rankOf(row.highProximity, column);
    const members = column.length;
    const below = 1 - row.highProximity;

    const where =
      below < 0.01
        ? `At its 52-week high`
        : `${pctAbs(below)} below its 52-week high`;

    return {
      strategyId: "week52-high",
      score,
      /**
       * The measure is bounded in (0, 1] and most of a market clusters in the
       * top quarter of it, so the rank carries more information than the level.
       * Confidence therefore leans on the rank's extremity and on how many names
       * produced it, not on the ratio itself.
       */
      confidence: clamp(
        peerConfidence(members) * (0.3 + Math.abs(score) * 0.55),
        0.15,
        0.75,
      ),
      rationale: `${where} — ${ordinal(rank)}-closest of ${members} in its market. The high is the anchor good news has to argue past.`,
      // George and Hwang hold six months. The window is wide because an
      // anchoring effect has no moment.
      horizonDays: 120,
      halfLifeDays: 60,
    };
  },
};
