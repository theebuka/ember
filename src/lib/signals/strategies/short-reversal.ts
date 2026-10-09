import type { Strategy } from "../types";
import { clamp } from "../indicators/stats";
import { crossSectionalScore, ordinal, pct, peerConfidence, rankOf } from "./shared";

const MIN_MEMBERS = 8;
/**
 * The ceiling on this strategy's confidence, and it is deliberately low.
 *
 * Jegadeesh's effect is real, replicated and *mostly eaten by costs*. The
 * one-month reversal portfolio turns over its whole book every month, and the
 * spread on the names it likes — the ones that just fell hardest — is at its
 * widest exactly when it wants to buy them. Later work attributes a good part of
 * the measured return to bid-ask bounce rather than to anything tradeable.
 *
 * ember models no spread and no commission (it is the third caveat on the track
 * record), so a strategy whose edge lives inside the spread must not be allowed
 * to speak as loudly as one whose edge does not. This cap is that, made
 * arithmetic rather than left as a footnote.
 */
const MAX_CONFIDENCE = 0.45;

/**
 * Short-term reversal — last month's losers, cross-sectionally.
 *
 * The oldest published anomaly in this engine and the only one pointing squarely
 * against the rest of it. Jegadeesh sorts on the past month's return and finds
 * the losers outperform over the next one; Lehmann finds the same thing weekly.
 * The mechanism is uncontroversial and is not a forecast about fundamentals —
 * short-horizon moves overshoot on liquidity demand, and the overshoot unwinds.
 *
 * **Its job here is to disagree.** Five of the engine's rules are trend or
 * momentum, and the payoff shape the track record reports — many small losses,
 * a few large wins, a hit rate near four in ten — is what a book of correlated
 * trend rules produces. A rule that says *sell the thing that just ran* is the
 * genuine diversifier, and the cases where it fights `xs-momentum` are the cases
 * where the user most needs to see the split rather than a confident midpoint.
 *
 * It is not the same signal as `connors-rsi2`, which is the engine's other
 * contrarian voice: that one reads a two-day RSI, is gated on the 200-day
 * average, and is long-only. This is a twenty-one-day cross-sectional rank with
 * no trend gate, and it will happily produce a sell. `collinearity.test.ts`
 * measures the overlap rather than trusting this paragraph.
 */
export const shortReversal: Strategy = {
  id: "short-reversal",
  name: "Short-term reversal",
  family: "mean-reversion",
  appliesTo: ["equity", "crypto"],
  minBars: 30,

  citation: {
    authors: "Jegadeesh, and Lehmann",
    year: 1990,
    title: "Evidence of Predictable Behavior of Security Returns; Fads, Martingales, and Market Efficiency",
    where: "Journal of Finance 45(3); Quarterly Journal of Economics 105(1)",
    claim:
      "Returns over the prior one month (Jegadeesh) and prior week (Lehmann) reverse cross-sectionally: buying recent losers and selling recent winners earned significant returns before costs.",
  },

  evaluate(ctx) {
    const section = ctx.crossSection;
    if (!section) return null;

    const row = section.rows.get(ctx.instrument.symbol);
    if (!row || row.reversal21 === null) return null;

    const column = section.distributions.reversal21;
    if (column.length < MIN_MEMBERS) return null;

    const percentile = crossSectionalScore(row.reversal21, column);
    if (percentile === null) return null;

    // The whole strategy, and the reason it is worth having: inverted.
    const score = -percentile;

    const rank = rankOf(row.reversal21, column);
    const members = column.length;

    const reading =
      score > 0
        ? `Recent weakness of that size has historically unwound rather than continued.`
        : `Short-horizon strength of that size has historically given some back.`;

    return {
      strategyId: "short-reversal",
      score,
      confidence: clamp(
        peerConfidence(members) * (0.25 + Math.abs(score) * 0.5),
        0.12,
        MAX_CONFIDENCE,
      ),
      rationale: `Returned ${pct(row.reversal21)} over the past month, ${ordinal(rank)} of ${members} in its market. ${reading}`,
      // A one-month effect, and the tightest window in the app after
      // `connors-rsi2`. It has to be: the edge is gone inside a month.
      horizonDays: 21,
      halfLifeDays: 8,
    };
  },
};
