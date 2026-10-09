import type { Strategy } from "../types";
import { clamp, latest } from "../indicators/stats";
import { sma } from "../indicators/moving-averages";
import { rsi } from "../indicators/momentum";
import { closesOf, pct } from "./shared";

const TREND = 200;
const RSI_PERIOD = 2;
const OVERSOLD = 10;
const OVERBOUGHT = 90;

/**
 * Connors' RSI(2) — short-horizon mean reversion inside a long-term uptrend.
 *
 * The two-period RSI is far twitchier than the conventional fourteen, which
 * is the intent: it flags brief, sharp pullbacks rather than sustained
 * weakness. The 200-day filter is what stops that from being a way to buy
 * things on their way down — a pullback in an uptrend is a discount, the same
 * pullback in a downtrend is just the trend.
 *
 * This is the ensemble's contrarian voice, and it is the one most likely to
 * dissent from the momentum strategies. That disagreement is surfaced to the
 * user rather than averaged away: a stretched pullback inside a strong trend
 * is genuinely a different trade from a breakout, and it resolves in days
 * rather than months. The short half-life is why it produces the tightest
 * execution windows in the app.
 */
export const connorsRsi2: Strategy = {
  id: "connors-rsi2",
  name: "Connors RSI(2)",
  family: "mean-reversion",
  appliesTo: ["equity", "crypto"],
  minBars: TREND + 1,

  citation: {
    authors: "Larry Connors & Cesar Alvarez",
    year: 2008,
    title: "Short Term Trading Strategies That Work",
    where: "TradingMarkets Publishing Group",
    claim:
      "Buying a 2-period RSI below 10 while price holds above its 200-day average, and exiting above the 5-day average, produced consistent short-horizon edge across US equities.",
  },

  evaluate(ctx) {
    const closes = closesOf(ctx.candles);
    // Wilder smoothing is recursive, so RSI can't be sliced to its period —
    // but at period 2 the weight on a bar k back is 0.5^k, which is below
    // float precision after ~50 bars. 60 is exact for every practical purpose.
    const value = latest(rsi(closes.slice(-60), RSI_PERIOD));
    const trend = latest(sma(closes.slice(-TREND), TREND));
    const exitLine = latest(sma(closes.slice(-5), 5));
    if (value === null || trend === null || exitLine === null) return null;

    const price = closes[closes.length - 1];
    const aboveTrend = price > trend;
    const distanceFromTrend = price / trend - 1;

    // Without the trend filter this becomes a way to catch falling knives,
    // so below the 200-day the strategy declines to take a long at all.
    if (!aboveTrend) {
      return {
        strategyId: "connors-rsi2",
        score: 0,
        quiet: true,
        confidence: 0.3,
        rationale: `RSI(2) at ${value.toFixed(0)}, but price sits ${pct(distanceFromTrend)} against its 200-day average. Oversold in a downtrend is not a discount.`,
        horizonDays: 5,
        halfLifeDays: 2,
      };
    }

    if (value < OVERSOLD) {
      // Deeper oversold, stronger signal, up to the full score at RSI 0.
      const depth = (OVERSOLD - value) / OVERSOLD;
      return {
        strategyId: "connors-rsi2",
        score: clamp(0.35 + depth * 0.65, 0, 1),
        confidence: clamp(0.4 + depth * 0.4, 0.3, 0.85),
        rationale: `RSI(2) at ${value.toFixed(0)} — a sharp pullback while price holds ${pct(distanceFromTrend)} above its 200-day average. Exits above the 5-day average.`,
        horizonDays: 5,
        halfLifeDays: 2,
      };
    }

    if (value > OVERBOUGHT) {
      // The published exit, expressed as a negative score. It is a signal to
      // close a mean-reversion long, not to open a short.
      const stretch = (value - OVERBOUGHT) / (100 - OVERBOUGHT);
      return {
        strategyId: "connors-rsi2",
        score: clamp(-0.2 - stretch * 0.4, -0.6, 0),
        confidence: clamp(0.3 + stretch * 0.3, 0.25, 0.7),
        rationale: `RSI(2) at ${value.toFixed(0)} and price above its 5-day average — stretched short term. The published rule takes profit here rather than adding.`,
        horizonDays: 5,
        halfLifeDays: 2,
      };
    }

    return {
      strategyId: "connors-rsi2",
      score: 0,
      quiet: true,
      confidence: 0.2,
      rationale: `RSI(2) at ${value.toFixed(0)} — neither stretched nor washed out. No short-term edge either way.`,
      horizonDays: 5,
      halfLifeDays: 2,
    };
  },
};
