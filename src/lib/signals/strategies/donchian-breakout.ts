import type { Strategy } from "../types";
import { clamp, latest } from "../indicators/stats";
import { donchian } from "../indicators/channels";
import { atr } from "../indicators/volatility";
import { pctAbs } from "./shared";

const ENTRY = 20;
const LONG_ENTRY = 55;

/**
 * Donchian channel breakout — the Turtle entry rule.
 *
 * Buy when price takes out the highest high of the previous twenty days; sell
 * when it breaks the twenty-day low. The fifty-five-day channel is the slower
 * confirmation: a break of both at once is a far stronger statement than a
 * break of the short channel alone.
 *
 * Distance beyond the channel is measured in ATR, not percent, so a breakout
 * in a quiet instrument and one in a violent instrument are scored on the
 * same scale.
 *
 * Note the `excludeCurrent` flag on both channels. Without it the current bar
 * helps define the level it is being tested against, and no breakout can ever
 * register — the single easiest way to get this rule silently wrong.
 */
export const donchianBreakout: Strategy = {
  id: "donchian-breakout",
  name: "Donchian breakout",
  family: "trend",
  appliesTo: ["equity", "crypto", "fx"],
  minBars: LONG_ENTRY + 2,

  citation: {
    authors: "Richard Dennis & William Eckhardt",
    year: 1983,
    title: "The Original Turtle Trading Rules",
    where: "Published rule set, via Curtis Faith, Way of the Turtle (2007)",
    claim:
      "A mechanical system entering on 20- and 55-day channel breakouts with ATR-based position sizing and stops produced substantial returns across futures markets.",
  },

  evaluate(ctx) {
    // Each channel reads exactly `period + 1` bars once the current one is
    // excluded, so slicing to that is exact, not an approximation.
    const fast = latest(
      donchian(ctx.candles.slice(-(ENTRY + 1)), ENTRY, { excludeCurrent: true }),
    );
    const slow = latest(
      donchian(ctx.candles.slice(-(LONG_ENTRY + 1)), LONG_ENTRY, { excludeCurrent: true }),
    );
    const range = latest(atr(ctx.candles.slice(-60), 20));
    if (!fast || !slow || range === null || range === 0) return null;

    const price = ctx.candles[ctx.candles.length - 1].c;

    // How far outside the channel we are, in units of daily range.
    const aboveFast = (price - fast.upper) / range;
    const belowFast = (fast.lower - price) / range;
    const brokeSlowUp = price > slow.upper;
    const brokeSlowDown = price < slow.lower;

    if (aboveFast > 0) {
      // A simultaneous break of both channels is the strong form.
      const confirmation = brokeSlowUp ? 1 : 0.6;
      return {
        strategyId: "donchian-breakout",
        score: clamp(Math.tanh(aboveFast) * confirmation, 0, 1),
        confidence: clamp(0.45 + (brokeSlowUp ? 0.3 : 0) + Math.min(aboveFast, 1) * 0.2, 0.2, 0.9),
        rationale: brokeSlowUp
          ? `Broke both the 20- and 55-day highs, ${aboveFast.toFixed(1)} ATR beyond the shorter channel.`
          : `Cleared the 20-day high by ${aboveFast.toFixed(1)} ATR, though the 55-day channel is intact.`,
        horizonDays: 45,
        halfLifeDays: 25,
      };
    }

    if (belowFast > 0) {
      const confirmation = brokeSlowDown ? 1 : 0.6;
      return {
        strategyId: "donchian-breakout",
        score: clamp(-Math.tanh(belowFast) * confirmation, -1, 0),
        confidence: clamp(0.45 + (brokeSlowDown ? 0.3 : 0) + Math.min(belowFast, 1) * 0.2, 0.2, 0.9),
        rationale: brokeSlowDown
          ? `Broke both the 20- and 55-day lows, ${belowFast.toFixed(1)} ATR below the shorter channel.`
          : `Broke the 20-day low by ${belowFast.toFixed(1)} ATR, with the 55-day channel still holding.`,
        horizonDays: 45,
        halfLifeDays: 25,
      };
    }

    // Inside the channel is the normal state and carries no signal. Saying so
    // explicitly is more useful than staying silent — the user can see the
    // strategy looked and found nothing.
    const room = Math.min(fast.upper - price, price - fast.lower) / range;
    return {
      strategyId: "donchian-breakout",
      score: 0,
      confidence: 0.25,
      rationale: `Inside its 20-day range, ${room.toFixed(1)} ATR from the nearest edge. No breakout to trade — the channel spans ${pctAbs((fast.upper - fast.lower) / price)} of price.`,
      horizonDays: 45,
      halfLifeDays: 25,
    };
  },
};
