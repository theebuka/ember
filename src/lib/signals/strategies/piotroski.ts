import type { Fundamentals, Strategy } from "../types";
import { clamp } from "../indicators/stats";

interface Test {
  label: string;
  passed: boolean;
}

/**
 * The nine binary tests, in Piotroski's three groups.
 *
 * Exported so the methodology page can show which individual tests a company
 * passed rather than only the total — the breakdown is the interesting part,
 * and a bare score out of nine is exactly the kind of opaque number this
 * product is trying not to ship.
 */
export function fScoreTests(f: Fundamentals): Test[] {
  const roa = f.netIncome / f.totalAssets;
  const roaPrior = f.netIncomePrior / f.totalAssetsPrior;

  const leverage = f.longTermDebt / f.totalAssets;
  const leveragePrior = f.longTermDebtPrior / f.totalAssetsPrior;

  const currentRatio = f.currentAssets / f.currentLiabilities;
  const currentRatioPrior = f.currentAssetsPrior / f.currentLiabilitiesPrior;

  const margin = f.grossProfit / f.revenue;
  const marginPrior = f.grossProfitPrior / f.revenuePrior;

  const turnover = f.revenue / f.totalAssets;
  const turnoverPrior = f.revenuePrior / f.totalAssetsPrior;

  return [
    // Profitability
    { label: "Positive return on assets", passed: roa > 0 },
    { label: "Positive operating cash flow", passed: f.operatingCashFlow > 0 },
    { label: "Return on assets improving", passed: roa > roaPrior },
    {
      // Cash flow exceeding reported profit means earnings are backed by cash
      // rather than accruals. This is the test that catches flattering books.
      label: "Cash flow exceeds net income",
      passed: f.operatingCashFlow > f.netIncome,
    },
    // Leverage, liquidity and source of funds
    { label: "Long-term debt falling", passed: leverage <= leveragePrior },
    { label: "Current ratio improving", passed: currentRatio > currentRatioPrior },
    {
      label: "No new shares issued",
      passed: f.sharesOutstanding <= f.sharesOutstandingPrior,
    },
    // Operating efficiency
    { label: "Gross margin improving", passed: margin > marginPrior },
    { label: "Asset turnover improving", passed: turnover > turnoverPrior },
  ];
}

/**
 * Piotroski's F-Score — nine accounting tests, one point each.
 *
 * The original finding is narrower than it's usually quoted as: among *cheap*
 * stocks, the financially strengthening ones substantially outperform the
 * deteriorating ones. It is a quality filter on value, not a standalone buy
 * signal, which is why the ensemble weights it as a slow-moving confirmation
 * rather than a trigger.
 *
 * It is also the slowest signal here by a wide margin. Fundamentals update
 * quarterly at best, so a change in this score is news roughly four times a
 * year — reflected in a long horizon and a long half-life.
 */
export const piotroski: Strategy = {
  id: "piotroski",
  name: "Piotroski F-Score",
  family: "quality",
  appliesTo: ["equity"],
  minBars: 1,

  citation: {
    authors: "Joseph D. Piotroski",
    year: 2000,
    title:
      "Value Investing: The Use of Historical Financial Statement Information to Separate Winners from Losers",
    where: "Journal of Accounting Research 38",
    claim:
      "Within high book-to-market stocks, a nine-point financial-strength score separated subsequent winners from losers, raising mean returns by around 7.5% annually over 1976–1996.",
  },

  evaluate(ctx) {
    if (!ctx.fundamentals) return null;

    const tests = fScoreTests(ctx.fundamentals);
    const score = tests.filter((t) => t.passed).length;

    // 0–9 mapped to −1…+1, centred on the midpoint.
    const normalised = clamp((score - 4.5) / 4.5, -1, 1);
    const failed = tests.filter((t) => !t.passed);

    const detail =
      failed.length === 0
        ? "a clean sweep"
        : failed.length <= 3
          ? `missing on ${failed.map((t) => t.label.toLowerCase()).join(", ")}`
          : `failing ${failed.length} of the nine, including ${failed[0].label.toLowerCase()}`;

    return {
      strategyId: "piotroski",
      score: normalised,
      // Piotroski is decisive at the extremes and close to noise in the
      // middle, so confidence tracks distance from the midpoint.
      confidence: clamp(Math.abs(score - 4.5) / 4.5, 0.15, 0.85),
      rationale: `F-Score of ${score} out of 9: ${detail}.`,
      horizonDays: 250,
      halfLifeDays: 120,
    };
  },
};
