import type { Strategy } from "../types";
import { withMomentumRisk } from "./momentum-risk";
import { clamp } from "../indicators/stats";
import { annualisedVol, pct, peerConfidence, returnOver, squash } from "./shared";

const LOOKBACK = 252;

/**
 * Dual momentum — absolute first, then relative.
 *
 * Two gates in order. Absolute momentum asks whether the asset has beaten
 * cash over the past year; if it hasn't, nothing else matters and the answer
 * is cash. Only what clears that gate gets ranked against its peers.
 *
 * The ordering is the point, and it is what makes this the ensemble's
 * defensive voice. Pure relative momentum will always name a best-performing
 * asset, including in a market where everything is falling and the honest
 * answer is to hold none of it.
 *
 * Long-or-cash by construction: a negative score here means "step aside", not
 * "go short".
 *
 * ── The magnitude comes from the relative leg, and that is a correction ──────
 *
 * This rule used to score `min(absoluteStrength, relative)`, where
 * `absoluteStrength` was `squash((own − cash) / vol, 1.2)` — **the same
 * expression, to the character, as `ts-momentum`'s entire score.** Since a
 * random-walk universe has twelve-month returns clustered near zero, the `min`
 * almost always picked the absolute term, and the two strategies produced
 * identical numbers: `collinearity.test.ts` measured their correlation at 1.00
 * across 176 equities the first time it ran.
 *
 * That is not a cosmetic overlap. `assess()` weights each rule by its own
 * confidence and *raises* blended confidence when rules agree, so a duplicated
 * opinion does not cancel out or announce itself — it silently doubles one
 * rule's weight and manufactures the unanimity this codebase calls the tell of a
 * gimmick. Two of ten voices on every equity were one voice.
 *
 * The fix is also the more faithful reading. Antonacci's rule is a *switch*:
 * fail absolute momentum and you hold cash, clear it and you hold the best
 * relative performer. Magnitude was never meant to come from the absolute leg —
 * that leg decides the sign, and the peer ranking decides how strongly. So the
 * ranking is now computed on both paths and carries the score, and "trailed cash
 * and everything else" is properly distinguished from "trailed cash while still
 * leading its peers".
 *
 * **The gate is a genuine discontinuity and that is intended.** A name a hair
 * above cash reads a weak positive; the same name a hair below it reads a firm
 * negative. The old scoring crossed zero smoothly, which read better and was the
 * wrong shape — going to cash the moment twelve-month momentum turns is precisely
 * how this strategy avoids bear markets, and smoothing that away would leave a
 * rule with Antonacci's name on it and none of his behaviour. Confidence does
 * move continuously (`decisiveness`), so a marginal crossing carries the lowest
 * weight this rule can have rather than shouting.
 */
export const dualMomentum: Strategy = withMomentumRisk({
  id: "dual-momentum",
  name: "Dual momentum",
  family: "trend",
  appliesTo: ["equity", "crypto", "fx"],
  minBars: LOOKBACK + 1,

  citation: {
    authors: "Gary Antonacci",
    year: 2014,
    title: "Dual Momentum Investing: An Innovative Strategy for Higher Returns with Lower Risk",
    where: "McGraw-Hill",
    claim:
      "Combining absolute momentum (beat cash) with relative momentum (beat peers) captures trend returns while sidestepping the worst of bear-market drawdowns.",
  },

  evaluate(ctx) {
    const own = returnOver(ctx.candles, LOOKBACK);
    if (own === null) return null;

    const vol = annualisedVol(ctx.candles, ctx.periodsPerYear);
    if (vol === null || vol === 0) return null;

    const excess = own - ctx.riskFreeRate;

    /**
     * The relative leg, read for both outcomes.
     *
     * It is the score on either side of the gate, which is what keeps this rule
     * from restating `ts-momentum` — see the note above the strategy. The column
     * is `momentum12` from the shared cross-section: the same twelve-month total
     * return this used to compute peer by peer, computed once per date instead.
     * It includes the subject, which changes nothing — a name is not below itself.
     */
    const column = ctx.crossSection?.distributions.momentum12 ?? [own];

    const universe = column.length;
    const beaten = column.filter((r) => r < own).length;
    // Long-only, so the relative leg maps to [0, 1] rather than [−1, 1].
    const relative = universe > 1 ? beaten / (universe - 1) : 0.5;

    /** How decisively the absolute gate was cleared or missed. Confidence only. */
    const decisiveness = Math.min(Math.abs(squash(excess / vol, 1.2)), 1);

    // Gate one. Failing absolute momentum means cash, whatever the ranking says
    // — but a name that trailed cash *and* its peers is more clearly out than
    // one that trailed cash while leading them.
    if (excess <= 0) {
      return {
        strategyId: "dual-momentum",
        score: clamp(-(0.3 + 0.7 * (1 - relative)), -1, -0.05),
        confidence: clamp(peerConfidence(universe) * 0.4 + decisiveness * 0.5, 0.3, 0.9),
        rationale: `Trailed cash over twelve months, ${pct(own)} against ${pct(ctx.riskFreeRate)}. Absolute momentum says hold none of it, and it beat ${beaten} of ${universe - 1} peers.`,
        horizonDays: 30,
        halfLifeDays: 21,
      };
    }

    // Gate two. Both gates clear, so strength is where it stands among peers.
    return {
      strategyId: "dual-momentum",
      score: clamp(0.1 + 0.9 * relative, 0.05, 1),
      confidence: clamp(peerConfidence(universe) * 0.5 + decisiveness * 0.5, 0.2, 0.9),
      rationale: `Beat cash by ${pct(excess)} over twelve months and outran ${beaten} of ${universe - 1} peers. Both momentum gates clear.`,
      horizonDays: 30,
      halfLifeDays: 21,
    };
  },
}, { continuity: true, crash: true });
