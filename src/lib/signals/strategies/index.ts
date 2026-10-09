import type { MarketKind } from "@/lib/api/types";
import type { Strategy, StrategyId } from "../types";

import { assetGrowth } from "./asset-growth";
import { bab } from "./bab";
import { clenow } from "./clenow";
import { connorsRsi2 } from "./connors-rsi2";
import { cryptoMvrv } from "./crypto-mvrv";
import { currencyMomentum } from "./currency-momentum";
import { donchianBreakout } from "./donchian-breakout";
import { dualMomentum } from "./dual-momentum";
import { fxCarry } from "./fx-carry";
import { highVolume } from "./high-volume";
import { industryMomentum } from "./industry-momentum";
import { magicFormula } from "./magic-formula";
import { maxEffect } from "./max-effect";
import { piotroski } from "./piotroski";
import { residualMomentum } from "./residual-momentum";
import { shortReversal } from "./short-reversal";
import { tsMomentum } from "./ts-momentum";
import { week52High } from "./week52-high";
import { xsMomentum } from "./xs-momentum";

/**
 * Every strategy in the engine.
 *
 * Adding one here is the only step needed to include it in the ensemble, the
 * backtest and the methodology page — nothing enumerates strategies by hand.
 *
 * Ordered by what a reader would want first, not by when it was written: the
 * price-and-trend rules, then the cross-sectional ones, then the fundamental
 * ones, then the two that apply to a single market.
 */
export const STRATEGIES: Strategy[] = [
  tsMomentum,
  xsMomentum,
  clenow,
  dualMomentum,
  donchianBreakout,
  residualMomentum,
  week52High,
  industryMomentum,
  connorsRsi2,
  shortReversal,
  maxEffect,
  highVolume,
  bab,
  piotroski,
  magicFormula,
  assetGrowth,
  fxCarry,
  currencyMomentum,
  cryptoMvrv,
];

/**
 * Rules that are, measured, mostly one opinion.
 *
 * `ts-momentum`, `xs-momentum` and `dual-momentum` are three readings of one
 * number, the trailing twelve-month return, and their scores correlate at
 * 0.88–0.94. Weighted as three independent voices they gave the trend book three
 * votes for one opinion, and their agreement with each other was counted as
 * agreement, which is how confidence was being raised by arithmetic.
 *
 * `assess` weights a group of k members that all speak by 1 / (1 + (k − 1)ρ)
 * each, so together they count as k / (1 + (k − 1)ρ) voices: about 1.06 here.
 * That is the standard effective-sample-size correction for equally correlated
 * estimates. `correlation` is the group's mean pairwise score correlation, and
 * `collinearity.test.ts` measures it and fails if this number drifts from what
 * the engine produces, or if any other pair crosses 0.85 without being listed.
 */
export interface OverlapGroup {
  members: readonly StrategyId[];
  correlation: number;
}

export const OVERLAP_GROUPS: readonly OverlapGroup[] = [
  { members: ["ts-momentum", "xs-momentum", "dual-momentum"], correlation: 0.92 },
];

export const STRATEGY_BY_ID = new Map<StrategyId, Strategy>(
  STRATEGIES.map((s) => [s.id, s]),
);

export function strategiesFor(market: MarketKind): Strategy[] {
  return STRATEGIES.filter((s) => s.appliesTo.includes(market));
}

export {
  assetGrowth,
  bab,
  clenow,
  connorsRsi2,
  cryptoMvrv,
  currencyMomentum,
  donchianBreakout,
  dualMomentum,
  fxCarry,
  highVolume,
  industryMomentum,
  magicFormula,
  maxEffect,
  piotroski,
  residualMomentum,
  shortReversal,
  tsMomentum,
  week52High,
  xsMomentum,
};
export { fScoreTests } from "./piotroski";
