import type { Strategy, StrategyContext, StrategySignal } from "../types";
import { percentileRank } from "../indicators/stats";

/**
 * Two published refinements to momentum, applied to the rules they fit.
 *
 * Neither is a rule of its own. Both say *how much to trust* a momentum read,
 * so they adjust its confidence and say why in its rationale, and leave its
 * direction alone. Equities only: both were measured on stocks, and the
 * cross-sections they need exist only there.
 *
 * **Continuity** — Da, Gurun & Warachka, "Frog in the Pan: Continuous
 * Information and Momentum", *Review of Financial Studies* 27(7), 2014. Momentum
 * built from many small moves persists; momentum built from a few large days
 * does not, and in their sample reversed. Goyal, Jegadeesh & Subrahmanyam found
 * it the best explanation of momentum outside the US. Measured as the subject's
 * information discreteness ranked against its market: the more discrete half is
 * discounted, down to 0.6 for the most discrete, and the continuous half is left
 * as it is.
 *
 * **Momentum's own risk** — Barroso & Santa-Clara, "Momentum Has Its Moments",
 * *Journal of Financial Economics* 116(1), 2015; Daniel & Moskowitz, "Momentum
 * Crashes", *Journal of Financial Economics* 122(2), 2016. Momentum's crashes
 * arrive when its own recent volatility is high. Read from the market's
 * winners-minus-losers portfolio (`momentumRiskOf` in `cross-section.ts`), down
 * to half when that portfolio is twice as volatile as usual.
 *
 * Both only ever discount. A steady trend in a calm market is not stronger
 * evidence than the rule already claimed; it is the absence of the conditions in
 * which momentum has failed worst.
 */

/** The most a discrete move can cost a read. */
const CONTINUITY_FLOOR = 0.6;
/** Below this the adjustment is mentioned in the rationale; above, it is noise. */
const WORTH_SAYING = 0.9;

export interface MomentumRisk {
  /** Discount momentum built on a few large days (Da, Gurun & Warachka). */
  continuity?: boolean;
  /** Discount when momentum itself has been volatile (Barroso & Santa-Clara). */
  crash?: boolean;
}

/** 1 for steady momentum, down to `CONTINUITY_FLOOR` for the most discrete in its market. */
export function continuityFactor(ctx: StrategyContext): number {
  const section = ctx.crossSection;
  if (!section || section.market !== "equity") return 1;
  const own = section.rows.get(ctx.instrument.symbol)?.discreteness;
  if (own === null || own === undefined) return 1;
  const p = percentileRank(own, section.distributions.discreteness);
  if (p === null || p <= 0.5) return 1;
  return 1 - (1 - CONTINUITY_FLOOR) * ((p - 0.5) / 0.5);
}

export function crashFactor(ctx: StrategyContext): number {
  const section = ctx.crossSection;
  if (!section || section.market !== "equity") return 1;
  return section.momentumScale ?? 1;
}

/** Wraps a momentum rule so every read it gives carries the adjustments it is due. */
export function withMomentumRisk(strategy: Strategy, risk: MomentumRisk): Strategy {
  return {
    ...strategy,
    evaluate(ctx) {
      const signal = strategy.evaluate(ctx);
      if (!signal || signal.quiet) return signal;
      return adjust(signal, ctx, risk);
    },
  };
}

function adjust(signal: StrategySignal, ctx: StrategyContext, risk: MomentumRisk): StrategySignal {
  const continuity = risk.continuity ? continuityFactor(ctx) : 1;
  const crash = risk.crash ? crashFactor(ctx) : 1;
  if (continuity === 1 && crash === 1) return signal;

  const notes: string[] = [];
  if (continuity < WORTH_SAYING) {
    notes.push("Most of the move came on a few large days, and momentum built that way has tended not to last.");
  }
  if (crash < WORTH_SAYING) {
    notes.push("Momentum has been unusually volatile in this market lately, which is when it has crashed.");
  }

  return {
    ...signal,
    confidence: signal.confidence * continuity * crash,
    rationale: notes.length > 0 ? `${signal.rationale} ${notes.join(" ")}` : signal.rationale,
  };
}
