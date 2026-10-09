import type { Strategy } from "../types";
import { clamp } from "../indicators/stats";
import { crossSectionalScore, ordinal, pct, peerConfidence, rankOf } from "./shared";

const MIN_MEMBERS = 8;
/**
 * The ceiling on this strategy's confidence.
 *
 * The published spread is over 1% a month, but it is strongest where retail
 * investors trade and weakest in large, institutionally held names, which is
 * most of ember's universe. Replications are mixed outside the US (weak in parts
 * of Europe, absent in Japan after institutional ownership rose), and on
 * value-weighted portfolios some find it does not survive. So it speaks, and
 * never loudly.
 */
const MAX_CONFIDENCE = 0.4;

/**
 * The MAX effect — stocks that just had a lottery-like day.
 *
 * Bali, Cakici and Whitelaw sort stocks on their largest single-day return over
 * the past month and find the highest decile underperforms the lowest by more
 * than 1% a month, after controlling for size, value, momentum, short-term
 * reversal, liquidity and skewness. Their reading is that some investors pay up
 * for a small chance of a large payoff, and a stock that has just shown it can
 * jump looks like one. It also accounts for the idiosyncratic-volatility puzzle,
 * which is why ember carries this rather than a separate volatility rule.
 *
 * **Equities only, on purpose.** In crypto the sign reverses: coins with the
 * biggest up-days have kept rising (Li, Urquhart, Wang & Zhang, "MAX momentum"),
 * so applying this there would be applying the opposite of the evidence.
 *
 * It reads the same month as `short-reversal`, and a month with a 15% day in it
 * is usually a strong month. The two are separated by what they rank — the
 * single largest day against the whole month's return — and
 * `collinearity.test.ts` measures how far apart that leaves them.
 */
export const maxEffect: Strategy = {
  id: "max-effect",
  name: "Lottery stocks (MAX)",
  family: "lottery",
  appliesTo: ["equity"],
  minBars: 30,

  citation: {
    authors: "Bali, Cakici & Whitelaw",
    year: 2011,
    title: "Maxing Out: Stocks as Lotteries and the Cross-Section of Expected Returns",
    where: "Journal of Financial Economics 99(2)",
    claim:
      "Stocks with the highest maximum daily return over the past month underperformed those with the lowest by more than 1% a month, robust to controls for size, value, momentum, short-term reversal, liquidity and skewness.",
  },

  evaluate(ctx) {
    const section = ctx.crossSection;
    if (!section) return null;

    const row = section.rows.get(ctx.instrument.symbol);
    if (!row || row.maxDaily21 === null) return null;

    const column = section.distributions.maxDaily21;
    if (column.length < MIN_MEMBERS) return null;

    const percentile = crossSectionalScore(row.maxDaily21, column);
    if (percentile === null) return null;

    // The largest up-days are the sell, so the rank is inverted.
    const score = -percentile;
    const rank = rankOf(row.maxDaily21, column);
    const members = column.length;

    const reading =
      score > 0
        ? "Stocks without a lottery-like spike have tended to do better over the following month."
        : "Stocks that have just had a day like that have tended to lag over the following month.";

    return {
      strategyId: "max-effect",
      score,
      confidence: clamp(
        peerConfidence(members) * (0.2 + Math.abs(score) * 0.4),
        0.1,
        MAX_CONFIDENCE,
      ),
      rationale: `Its best day in the past month was ${pct(row.maxDaily21)}, ${ordinal(rank)} of ${members} in its market. ${reading}`,
      // Measured over the following month, and the paper finds it persists for a
      // few more before fading.
      horizonDays: 42,
      halfLifeDays: 30,
    };
  },
};
