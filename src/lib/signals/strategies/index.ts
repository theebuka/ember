import type { MarketKind } from "@/lib/api/types";
import type { Strategy, StrategyId } from "../types";

import { bab } from "./bab";
import { clenow } from "./clenow";
import { connorsRsi2 } from "./connors-rsi2";
import { cryptoMvrv } from "./crypto-mvrv";
import { currencyMomentum } from "./currency-momentum";
import { donchianBreakout } from "./donchian-breakout";
import { dualMomentum } from "./dual-momentum";
import { fxCarry } from "./fx-carry";
import { industryMomentum } from "./industry-momentum";
import { magicFormula } from "./magic-formula";
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
  bab,
  piotroski,
  magicFormula,
  fxCarry,
  currencyMomentum,
  cryptoMvrv,
];

export const STRATEGY_BY_ID = new Map<StrategyId, Strategy>(
  STRATEGIES.map((s) => [s.id, s]),
);

export function strategiesFor(market: MarketKind): Strategy[] {
  return STRATEGIES.filter((s) => s.appliesTo.includes(market));
}

export {
  bab,
  clenow,
  connorsRsi2,
  cryptoMvrv,
  currencyMomentum,
  donchianBreakout,
  dualMomentum,
  fxCarry,
  industryMomentum,
  magicFormula,
  piotroski,
  residualMomentum,
  shortReversal,
  tsMomentum,
  week52High,
  xsMomentum,
};
export { fScoreTests } from "./piotroski";
