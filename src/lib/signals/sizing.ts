import { clamp } from "./indicators/stats";

/**
 * A fixed haircut on the vol-targeted size, in the spirit of fractional Kelly.
 *
 * Worth being precise about what this is and isn't. Kelly sizing needs an
 * estimated edge and variance; practitioners then bet a quarter of it because
 * edge estimates are unreliable. This engine has a *conviction score*, not an
 * estimated edge — calling the result "Kelly-optimal" would be false
 * precision. What survives is the discipline the fraction encodes: size well
 * below what the signal appears to justify, because the signal is an estimate.
 */
const CONVICTION_HAIRCUT = 0.25;

export interface PositionSize {
  /** Fraction of your portfolio, already capped by the risk profile. */
  weight: number;
  /** Stop distance in ATR multiples. */
  stopMultiple: number;
  stopPrice: number;
  /** Fraction of the whole book lost if the stop is hit. */
  riskBudget: number;
  /** Annualised volatility used in the calculation. */
  instrumentVol: number;
  /** One sentence explaining the size, for the advice card. */
  note: string;
}

/**
 * How much, and where to give up.
 *
 * Advice without a size and a stop is how people get hurt: the same "buy
 * NVDA" is prudent at 2% of a portfolio and reckless at 40%, and the
 * recommendation is meaningless without saying which it means.
 *
 * Size starts from volatility targeting — the weight that would contribute
 * roughly the profile's target volatility if this were the only position —
 * then scales by conviction and takes a fixed haircut. The effect is that a
 * wild instrument gets a smaller position than a placid one at identical
 * conviction, which is the whole point: it makes a signal on SOL and a signal
 * on EURUSD comparable.
 */
export function sizePosition({
  conviction,
  direction,
  price,
  atr,
  instrumentVol,
  volTarget,
  maxWeight,
  horizonDays,
}: {
  /** Blended |score| × confidence, 0…1. */
  conviction: number;
  /** +1 to add, −1 to reduce. The stop sits on the losing side of each. */
  direction: 1 | -1;
  price: number;
  /** Average true range, in price terms. */
  atr: number;
  /** Annualised realised volatility of the instrument. */
  instrumentVol: number;
  volTarget: number;
  maxWeight: number;
  horizonDays: number;
}): PositionSize | null {
  if (price <= 0 || atr <= 0 || instrumentVol <= 0) return null;

  const volScalar = volTarget / instrumentVol;
  const weight = clamp(volScalar * conviction * CONVICTION_HAIRCUT, 0, maxWeight);

  // Longer holds need room to breathe: a two-day mean-reversion trade stopped
  // at 3 ATR isn't a stop, and a six-month trend position stopped at 1.5 ATR
  // will be shaken out by ordinary noise long before the thesis resolves.
  const stopMultiple = clamp(1.5 + horizonDays / 60, 1.5, 3.5);
  const stopDistance = stopMultiple * atr;
  // The stop always sits on the side the position loses on.
  const stopPrice = price - direction * stopDistance;

  const riskBudget = weight * (stopDistance / price);

  const capped = volScalar * conviction * CONVICTION_HAIRCUT > maxWeight;

  const note = capped
    ? `Capped at the ${(maxWeight * 100).toFixed(0)}% single-position limit for your risk profile.`
    : `Sized so a ${stopMultiple.toFixed(1)} ATR stop costs ${(riskBudget * 100).toFixed(2)}% of your portfolio, against ${(instrumentVol * 100).toFixed(0)}% annualised volatility.`;

  return {
    weight,
    stopMultiple,
    stopPrice,
    riskBudget,
    instrumentVol,
    note,
  };
}
