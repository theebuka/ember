import type { Fundamentals, Strategy } from "../types";
import { clamp } from "../indicators/stats";
import { crossSectionalScore, ordinal, pct, peerConfidence, rankOf } from "./shared";

/** A growth rank against seven companies is not a rank. */
const MIN_MEMBERS = 8;
/**
 * The ceiling on this strategy's confidence.
 *
 * One of the better-replicated results in the literature, in 40 markets and in
 * large companies as well as small, and a premium measured over the year after a
 * balance sheet is filed. Like `bab`, it says nothing about this week, so it may
 * tilt a call but never lead one on its own.
 */
const MAX_CONFIDENCE = 0.5;

/** Year-over-year growth in total assets. */
function growthOf(f: Fundamentals): number | null {
  if (!(f.totalAssetsPrior > 0) || !(f.totalAssets > 0)) return null;
  return f.totalAssets / f.totalAssetsPrior - 1;
}

/**
 * Asset growth — the companies growing their balance sheets fastest.
 *
 * Cooper, Gulen and Schill rank stocks on the year-over-year change in total
 * assets and find the slowest growers beat the fastest by a wide margin, in
 * large companies as well as small; Watanabe, Xu, Yao and Yu found the same in
 * 40 markets, strongest where prices are most efficient. The usual explanation
 * is that a company invests heavily when its cost of capital is low, which is
 * also when its expected return is low. Acquisitions and big capital programmes
 * have tended to disappoint the shareholders paying for them.
 *
 * Ranked against every peer with filed accounts, which today means US listings
 * only (ember's fundamentals come from SEC filings), so it abstains for every
 * international name, like Piotroski and the Magic Formula.
 */
export const assetGrowth: Strategy = {
  id: "asset-growth",
  name: "Asset growth",
  family: "investment",
  appliesTo: ["equity"],
  minBars: 1,

  citation: {
    authors: "Cooper, Gulen & Schill",
    year: 2008,
    title: "Asset Growth and the Cross-Section of Stock Returns",
    where: "Journal of Finance 63(4); international evidence in Watanabe, Xu, Yao & Yu, Journal of Financial Economics 108(2), 2013",
    claim:
      "Firms with the lowest year-over-year growth in total assets earned significantly more over the following year than those with the highest, in large and small firms alike and across 40 international markets.",
  },

  evaluate(ctx) {
    if (!ctx.fundamentals) return null;
    const own = growthOf(ctx.fundamentals);
    if (own === null) return null;

    const column: number[] = [];
    for (const peer of ctx.peers) {
      if (!peer.fundamentals) continue;
      const growth = growthOf(peer.fundamentals);
      if (growth !== null && Number.isFinite(growth)) column.push(growth);
    }
    if (column.length < MIN_MEMBERS) return null;

    const percentile = crossSectionalScore(own, column);
    if (percentile === null) return null;

    // The fastest growers are the sell.
    const score = -percentile;
    const rank = rankOf(own, column);
    const members = column.length;

    const reading =
      score > 0
        ? "Companies growing their assets slowly have tended to earn more over the following year."
        : "Companies growing their assets this fast have tended to earn less over the following year.";

    return {
      strategyId: "asset-growth",
      score,
      confidence: clamp(
        peerConfidence(members) * (0.3 + Math.abs(score) * 0.35),
        0.12,
        MAX_CONFIDENCE,
      ),
      rationale: `Total assets ${own >= 0 ? "grew" : "shrank"} ${pct(Math.abs(own))} in its last financial year, ${ordinal(rank)} of ${members} for growth. ${reading}`,
      // Rebalanced yearly in the paper, and the premium is spread across that
      // year. The window is wide on purpose: there is no moment to catch.
      horizonDays: 250,
      halfLifeDays: 180,
    };
  },
};
