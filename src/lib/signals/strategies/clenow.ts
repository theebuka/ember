import type { Strategy } from "../types";
import { withMomentumRisk } from "./momentum-risk";
import { clamp, latest } from "../indicators/stats";
import { sma } from "../indicators/moving-averages";
import { momentumRank } from "../indicators/regression";
import {
  closesOf,
  crossSectionalScore,
  ordinal,
  pct,
  peerConfidence,
  rankOf,
} from "./shared";

const WINDOW = 90;
const TREND_FILTER = 100;
/** Clenow excludes names that have gapped hard inside the ranking window. */
const MAX_GAP = 0.15;

/**
 * Clenow's momentum ranking: annualised exponential regression slope × R².
 *
 * The R² term is the entire idea. Two names can post identical 90-day returns
 * while one climbed steadily and the other spiked once and then chopped
 * sideways. The steady one is tradeable; the spiky one is a coin flip already
 * resolved. Multiplying by goodness of fit is what tells them apart, and it's
 * why this earns a place next to the plain-return momentum measures.
 *
 * Two published filters apply on top: the price must be above its 100-day
 * average, and any single-day gap beyond 15% inside the window disqualifies
 * the name — a jump that large is usually news, not trend.
 */
export const clenow: Strategy = withMomentumRisk({
  id: "clenow",
  name: "Clenow momentum ranking",
  family: "momentum",
  appliesTo: ["equity", "crypto"],
  minBars: TREND_FILTER + 1,

  citation: {
    authors: "Andreas Clenow",
    year: 2015,
    title: "Stocks on the Move: Beating the Market with Hedge Fund Momentum Strategies",
    where: "Equilateral Publishing",
    claim:
      "Ranking by annualised exponential regression slope multiplied by R² selects instruments trending both strongly and consistently, outperforming raw-return ranking.",
  },

  evaluate(ctx) {
    const closes = closesOf(ctx.candles);
    // Sliced to the exact window each indicator reads — see `annualisedVol`.
    const own = latest(momentumRank(closes.slice(-WINDOW), WINDOW, ctx.periodsPerYear));
    if (own === null) return null;

    // Trend filter — the strategy is long-only above the 100-day average.
    const trendLine = latest(sma(closes.slice(-TREND_FILTER), TREND_FILTER));
    if (trendLine === null) return null;
    const price = closes[closes.length - 1];
    const aboveTrend = price > trendLine;

    // Gap filter.
    const window = ctx.candles.slice(-WINDOW);
    let largestGap = 0;
    for (let i = 1; i < window.length; i++) {
      const move = Math.abs(window[i].c / window[i - 1].c - 1);
      if (move > largestGap) largestGap = move;
    }
    if (largestGap > MAX_GAP) {
      return {
        strategyId: "clenow",
        score: 0,
        quiet: true,
        confidence: 0.5,
        rationale: `Disqualified: a ${pct(largestGap)} single-day move inside the ranking window. A jump that size is news, not trend.`,
        horizonDays: 90,
        halfLifeDays: 40,
      };
    }

    /**
     * The peer ranking comes from the shared cross-section, not from a loop here.
     *
     * This used to sweep all 176 peers per assessment, computing each one's
     * ninety-bar regression — and it was, by a wide margin, the most expensive
     * thing in the engine. Profiled over 1,760 contexts it cost **1,726ms against
     * 257ms for every other rule put together**, which was essentially the entire
     * cost of the walk-forward backtest. Two compounding mistakes: it mapped all
     * 420 bars of every peer to produce ninety numbers (the exact error
     * `annualisedVol`'s comment in `shared.ts` warns about), and it recomputed a
     * *market-wide* quantity once per subject when the answer is the same for all
     * of them.
     *
     * A peer's ninety-day momentum on a given date is a fact about the market on
     * that date, so it belongs in `cross-section.ts` — where the sweep runs 579
     * times over a backtest instead of 20,416. **The numbers are unchanged**: the
     * same regression over the same bars, keyed by date rather than by subject.
     */
    const column = ctx.crossSection?.distributions.clenowScore;

    // Fall back to the raw score when there aren't enough names to rank against;
    // the measure still means something on its own. The column includes the
    // subject, so three is the old "two peers plus me".
    const relative =
      column && column.length >= 3
        ? crossSectionalScore(own.score, column)
        : Math.tanh(own.score);
    if (relative === null) return null;

    // Below the 100-day average the strategy has no long case, whatever the
    // slope says. Cap rather than invert — it is not a short signal.
    const score = aboveTrend ? relative : Math.min(relative, 0) - 0.2;

    const universe = column?.length ?? 1;
    const rank = rankOf(own.score, column ?? [own.score]);

    const trendNote = aboveTrend
      ? `holding above its 100-day average`
      : `but trading below its 100-day average, which rules out a long`;

    return {
      strategyId: "clenow",
      score: clamp(score, -1, 1),
      // R² is literally a measure of how well the trend explains the price,
      // so it is the honest confidence for this strategy.
      confidence: clamp(own.r2 * 0.9 + peerConfidence(universe) * 0.1, 0.15, 0.95),
      rationale: `Trending at ${pct(own.annualisedSlope)} annualised with an R² of ${own.r2.toFixed(2)}, ${ordinal(rank)} of ${universe}, ${trendNote}.`,
      horizonDays: 90,
      halfLifeDays: 40,
    };
  },
}, { crash: true });
