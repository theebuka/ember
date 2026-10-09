import type { Candle } from "@/lib/api/types";
import type { Strategy } from "../types";
import { utcDay } from "../cross-section";
import { clamp } from "../indicators/stats";
import { squash } from "./shared";

/** A trading week, the formation period. */
const WEEK = 5;
/** Ten weeks before it, the reference period. Fifty days, as in the paper. */
const REFERENCE_WEEKS = 10;
/**
 * The ceiling on this strategy's confidence.
 *
 * The premium is measured in 41 countries and survives controls for risk and
 * liquidity, but it is a small return spread over one to two months, and what
 * causes it (attention or liquidity) is still argued over. A tilt, not a call.
 */
const MAX_CONFIDENCE = 0.35;

/**
 * The bars the formation and reference periods are read from.
 *
 * A bar from the evaluation day is dropped, because on a live server it is still
 * filling: at 11am a stock has traded perhaps a third of its day's volume, and
 * reading that as a quiet week would make every morning look like the low-volume
 * signal. A backtest evaluation is always stamped on its own bar's day, so it
 * drops that bar too and both read the same completed sessions.
 */
function completedBars(candles: readonly Candle[], now: number): readonly Candle[] {
  const last = candles[candles.length - 1];
  return last && utcDay(last.t) === utcDay(now) ? candles.slice(0, -1) : candles;
}

function meanVolume(bars: readonly Candle[]): number {
  return bars.reduce((sum, bar) => sum + bar.v, 0) / bars.length;
}

/**
 * The high-volume return premium.
 *
 * Gervais, Kaniel and Mingelgrin find that a stock trading unusually heavily
 * over a day or a week tends to rise over the following month, and one trading
 * unusually lightly tends to fall, whichever way its price moved. Their
 * explanation is visibility: a burst of trading puts a stock in front of
 * investors who were not looking at it, and new demand follows. Kaniel, Ozoguz
 * and Starks found the same premium in 41 countries, developed and emerging.
 *
 * "Unusual" is measured against the stock's own history, never its peers: a
 * week is high volume when it is the heaviest of the last eleven, and low volume
 * when it is the lightest. That is the paper's top and bottom tenth of a 50-day
 * interval. **Every other week is quiet**, which is the paper's own answer: its
 * middle portfolio is the control group, not a signal.
 *
 * Equities only. FX has no volume at all, and crypto's volume is a different
 * thing (much of it on venues that report it generously) and has not been tested
 * for this premium.
 */
export const highVolume: Strategy = {
  id: "high-volume",
  name: "High-volume return premium",
  family: "attention",
  appliesTo: ["equity"],
  minBars: WEEK * (REFERENCE_WEEKS + 1) + 1,

  citation: {
    authors: "Gervais, Kaniel & Mingelgrin",
    year: 2001,
    title: "The High-Volume Return Premium",
    where: "Journal of Finance 56(3); international evidence in Kaniel, Ozoguz & Starks, Journal of Financial Economics 103(2), 2012",
    claim:
      "Stocks with unusually high trading volume over a day or a week tended to rise over the following month, and those with unusually low volume to fall; the premium appears in 41 countries and is not explained by risk or liquidity.",
  },

  evaluate(ctx) {
    const bars = completedBars(ctx.candles, ctx.now);
    const needed = WEEK * (REFERENCE_WEEKS + 1);
    if (bars.length < needed) return null;

    const window = bars.slice(-needed);
    // A venue that reports no volume for a session, or a provider gap, would
    // read as the quietest week on record. No volume is no evidence.
    if (window.some((bar) => !(bar.v > 0))) return null;

    const formation = meanVolume(window.slice(-WEEK));
    const reference: number[] = [];
    for (let w = 0; w < REFERENCE_WEEKS; w++) {
      reference.push(meanVolume(window.slice(w * WEEK, (w + 1) * WEEK)));
    }

    const sorted = [...reference].sort((a, b) => a - b);
    const median = (sorted[4] + sorted[5]) / 2;
    if (median <= 0) return null;
    const ratio = formation / median;

    const heaviest = sorted[sorted.length - 1];
    const lightest = sorted[0];
    if (formation <= heaviest && formation >= lightest) {
      return {
        strategyId: "high-volume",
        score: 0,
        quiet: true,
        confidence: 0,
        rationale: `Traded ${Math.round(ratio * 100)}% of its usual volume last week, within its range of the past ten weeks. Only an unusual week says anything.`,
        horizonDays: 50,
        halfLifeDays: 25,
      };
    }

    // Doubling the usual volume scores about 0.8; halving it, about −0.8.
    const score = squash(Math.log(ratio), 1 / 1.5);
    const high = score > 0;

    const times = ratio >= 1 ? `${ratio.toFixed(1)}×` : `${Math.round(ratio * 100)}% of`;

    return {
      strategyId: "high-volume",
      score,
      confidence: clamp(0.15 + Math.abs(score) * 0.25, 0.1, MAX_CONFIDENCE),
      rationale: high
        ? `Traded ${times} its usual volume last week, the most in eleven weeks. Stocks that suddenly draw attention have tended to rise over the following month or two.`
        : `Traded ${times} its usual volume last week, the least in eleven weeks. Stocks that drop out of view have tended to lag over the following month or two.`,
      // The paper tracks returns over 20, 50 and 100 days after formation; most
      // of the premium arrives in the first 50.
      horizonDays: 50,
      halfLifeDays: 25,
    };
  },
};
