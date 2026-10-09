import type { Fundamentals, Strategy } from "../types";
import { clamp } from "../indicators/stats";
import { ordinal, pctAbs, peerConfidence } from "./shared";

/** EBIT / enterprise value — what the business earns per unit of buying it. */
function earningsYield(f: Fundamentals): number | null {
  if (f.enterpriseValue <= 0) return null;
  return f.ebit / f.enterpriseValue;
}

/**
 * EBIT / (net working capital + net fixed assets) — what the business earns
 * per unit of capital it actually needs to operate.
 *
 * Greenblatt uses tangible operating capital rather than total assets
 * specifically to exclude goodwill and cash, which flatter the ratio without
 * being productive.
 */
function returnOnCapital(f: Fundamentals): number | null {
  const capital = f.netWorkingCapital + f.netFixedAssets;
  if (capital <= 0) return null;
  return f.ebit / capital;
}

/**
 * Greenblatt's Magic Formula.
 *
 * Rank the universe twice — once on earnings yield, once on return on capital
 * — and add the two ranks. Cheap alone is a value trap; profitable alone is
 * usually expensive. The combined rank looks for both at once, which is the
 * entire idea and the reason it can't be evaluated on a single instrument in
 * isolation: this strategy is relative by construction, and returns null
 * without peers to rank against.
 */
export const magicFormula: Strategy = {
  id: "magic-formula",
  name: "Magic Formula",
  family: "value",
  appliesTo: ["equity"],
  minBars: 1,

  citation: {
    authors: "Joel Greenblatt",
    year: 2005,
    title: "The Little Book That Beats the Market",
    where: "John Wiley & Sons",
    claim:
      "Ranking stocks jointly on earnings yield and return on capital, and holding the top of the combined ranking, returned roughly 30% annually over 1988–2004 in the author's backtest.",
  },

  evaluate(ctx) {
    if (!ctx.fundamentals) return null;

    const ownYield = earningsYield(ctx.fundamentals);
    const ownRoc = returnOnCapital(ctx.fundamentals);
    if (ownYield === null || ownRoc === null) return null;

    const universe: { symbol: string; yield: number; roc: number }[] = [];
    for (const peer of ctx.peers) {
      if (!peer.fundamentals) continue;
      const y = earningsYield(peer.fundamentals);
      const r = returnOnCapital(peer.fundamentals);
      if (y === null || r === null) continue;
      universe.push({ symbol: peer.symbol, yield: y, roc: r });
    }

    // The formula is a ranking. Below a handful of names the ranking carries
    // no information, so the honest answer is no view at all.
    if (universe.length < 4) return null;

    const byYield = [...universe].sort((a, b) => b.yield - a.yield);
    const byRoc = [...universe].sort((a, b) => b.roc - a.roc);

    const yieldRank = byYield.findIndex((u) => u.symbol === ctx.instrument.symbol) + 1;
    const rocRank = byRoc.findIndex((u) => u.symbol === ctx.instrument.symbol) + 1;
    if (yieldRank === 0 || rocRank === 0) return null;

    const combined = yieldRank + rocRank;
    const best = 2;
    const worst = universe.length * 2;

    // Low combined rank is good, so invert before mapping to the score range.
    const normalised = 1 - (combined - best) / (worst - best);
    const score = clamp(normalised * 2 - 1, -1, 1);

    return {
      strategyId: "magic-formula",
      score,
      confidence: clamp(peerConfidence(universe.length) * 0.7, 0.15, 0.7),
      rationale: `Earns ${pctAbs(ownYield)} on its enterprise value and ${pctAbs(ownRoc)} on operating capital, ${ordinal(yieldRank)} and ${ordinal(rocRank)} of ${universe.length} on the two rankings.`,
      horizonDays: 250,
      halfLifeDays: 120,
    };
  },
};
