import type { Candle } from "@/lib/api/types";
import type { StrategyFamily } from "./types";
import { sma } from "./indicators/moving-averages";
import { realizedVolatility } from "./indicators/volatility";
import { clamp, latest, percentileRank } from "./indicators/stats";

export type TrendState = "uptrend" | "downtrend" | "range";
export type VolState = "calm" | "normal" | "stressed";

export interface Regime {
  trend: TrendState;
  vol: VolState;
  /** Annualised realised volatility over the trailing month. */
  volatility: number;
  /** Where that volatility sits in its own trailing year, 0…1. */
  volPercentile: number;
  /** Price against the 200-day average, as a proportion. */
  trendStrength: number;
  /** "calm uptrend" — for chips and short labels. */
  label: string;
  /** One sentence, for the advice card. */
  summary: string;
}

const TREND_PERIOD = 200;
const VOL_LOOKBACK = 20;
const VOL_HISTORY = 252;

/**
 * What kind of market this is right now.
 *
 * The regime filter is what stops the app shouting BUY into a crash. Every
 * strategy here is conditionally good: breakouts work in trends and bleed in
 * ranges, mean reversion works in ranges and is ruinous in a downtrend, carry
 * earns steadily until volatility spikes and then gives back years at once.
 * Weighting them identically in all conditions would average a good strategy
 * and an actively harmful one into mush.
 *
 * Volatility is judged as a *percentile of the instrument's own history*, not
 * against an absolute threshold. 60% annualised is a crisis in EURUSD and an
 * ordinary Tuesday in SOL, and a single cutoff would classify one of them
 * wrongly all the time.
 */
export function detectRegime(
  candles: readonly Candle[],
  periodsPerYear: number,
): Regime | null {
  if (candles.length < TREND_PERIOD + 1) return null;

  const closes = candles.map((c) => c.c);

  const trendLine = sma(closes, TREND_PERIOD);
  const current = latest(trendLine);
  if (current === null) return null;

  const price = closes[closes.length - 1];
  const trendStrength = price / current - 1;

  // Direction of the average itself, not just price against it — price can
  // poke above a still-falling 200-day for weeks without the trend changing.
  const monthAgo = trendLine[trendLine.length - 22] ?? null;
  const trendSlope = monthAgo === null ? 0 : current / monthAgo - 1;

  let trend: TrendState;
  if (trendStrength > 0.02 && trendSlope > 0) trend = "uptrend";
  else if (trendStrength < -0.02 && trendSlope < 0) trend = "downtrend";
  else trend = "range";

  const volSeries = realizedVolatility(closes, VOL_LOOKBACK, periodsPerYear);
  const volatility = latest(volSeries);
  if (volatility === null) return null;

  const history = volSeries
    .slice(-VOL_HISTORY)
    .filter((v): v is number => v !== null);
  const volPercentile = percentileRank(volatility, history) ?? 0.5;

  const vol: VolState =
    volPercentile > 0.8 ? "stressed" : volPercentile < 0.3 ? "calm" : "normal";

  const label = `${vol === "normal" ? "normal-vol" : vol} ${trend}`;

  const trendPhrase =
    trend === "uptrend"
      ? `holding ${(trendStrength * 100).toFixed(1)}% above its 200-day average`
      : trend === "downtrend"
        ? `${Math.abs(trendStrength * 100).toFixed(1)}% below its 200-day average`
        : "ranging around its 200-day average";

  const volPhrase =
    vol === "stressed"
      ? `Volatility is in the top ${Math.round((1 - volPercentile) * 100)}% of its year`
      : vol === "calm"
        ? "Volatility is unusually low for this instrument"
        : "Volatility is around its usual level";

  return {
    trend,
    vol,
    volatility,
    volPercentile,
    trendStrength,
    label,
    summary: `${volPhrase}, ${trendPhrase}.`,
  };
}

/**
 * How much to trust a family of strategies in this regime.
 *
 * Multipliers, applied on top of each strategy's own confidence. The values
 * are judgement calls informed by the published behaviour of each family, and
 * they are stated here rather than buried so they can be argued with.
 */
export function regimeWeight(family: StrategyFamily, regime: Regime): number {
  const { trend, vol } = regime;

  let weight = 1;

  switch (family) {
    case "trend":
    case "momentum":
      // Trend following needs a trend. In a range it whipsaws, which is where
      // most of its historical drawdown comes from.
      if (trend === "range") weight *= 0.7;
      // In a stressed downtrend these still say the right thing — get out —
      // so they keep most of their weight.
      if (vol === "stressed" && trend !== "downtrend") weight *= 0.8;
      if (vol === "calm" && trend === "uptrend") weight *= 1.15;
      break;

    case "mean-reversion":
      // The dangerous one. Buying dips works in a range and in a calm uptrend,
      // and is how people lose a great deal of money in a stressed downtrend.
      if (trend === "range") weight *= 1.25;
      if (trend === "downtrend") weight *= 0.4;
      if (vol === "stressed") weight *= 0.45;
      break;

    case "carry":
      // Carry crashes are volatility events — the return profile is small
      // steady gains and rare violent losses, and the losses arrive exactly
      // when volatility spikes.
      if (vol === "stressed") weight *= 0.3;
      if (vol === "calm") weight *= 1.15;
      if (trend === "downtrend") weight *= 0.7;
      break;

    case "value":
    case "quality":
      // Slow, fundamentally anchored, and relatively indifferent to the
      // tape — which makes them worth slightly more when everything
      // price-based is unreliable.
      if (vol === "stressed") weight *= 1.1;
      if (trend === "uptrend" && vol === "calm") weight *= 0.9;
      break;

    case "valuation":
      // Cycle-scale metrics say little about the next three months either way.
      if (vol === "stressed") weight *= 1.05;
      break;

    case "defensive":
      /**
       * The only family whose edge *improves* when the market gets worse.
       *
       * The low-beta premium is earned largely in falling and volatile markets —
       * that is the mechanism, not a coincidence: leverage-constrained buyers
       * crowd into high beta while conditions are calm and are forced out of it
       * when they are not. So this is the one place a stressed regime raises a
       * weight rather than lowering it, and a calm melt-up is where a defensive
       * tilt costs the most and should say the least.
       */
      if (vol === "stressed") weight *= 1.2;
      if (trend === "downtrend") weight *= 1.2;
      if (trend === "uptrend" && vol === "calm") weight *= 0.75;
      break;
  }

  return clamp(weight, 0.2, 1.3);
}
