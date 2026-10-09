import type { Strategy } from "../types";
import { clamp } from "../indicators/stats";
import {
  crossSectionalScore,
  ordinal,
  pct,
  peerConfidence,
  rankOf,
  returnOver,
} from "./shared";

/** Three months. Menkhoff et al. find the effect strongest at one to three. */
const LOOKBACK = 63;
/** A rank across fewer pairs than this is not a cross-section. */
const MIN_PEERS = 6;

/**
 * Currency momentum, measured on total return rather than spot.
 *
 * FX had four rules before this and three of them read the price path in
 * isolation (`ts-momentum`, `dual-momentum`, `donchian-breakout`), while the
 * fourth read the rate differential in isolation (`fx-carry`). Nothing put the
 * two together, and in currencies that omission is not cosmetic: **a pair's
 * return to a holder is the spot move plus the carry earned on the way**, and
 * those two terms routinely have opposite signs. A high-rate currency that
 * drifted down 2% while paying 5% made money, and every price-only rule in the
 * engine reads it as a loser.
 *
 * Menkhoff, Sarno, Schmeling and Schrimpf sort currencies on exactly that total
 * excess return and find a momentum effect that is large, persistent at one to
 * three months, and — the load-bearing part — **largely unrelated to carry**.
 * The two are separate premia rather than one measured twice, which is what lets
 * this sit beside `fx-carry` instead of restating it.
 *
 * Ranked at the level of the *pair*, not the currency. The paper sorts
 * currencies against the dollar; ember's fourteen instruments include crosses
 * with no dollar leg, and "long this pair" has a well-defined excess return
 * whether or not a dollar appears in it. Since a pair's return is the difference
 * of its two legs' returns, ranking pairs is the same sort expressed in the
 * things a user can actually hold.
 *
 * ── On what this replaced ────────────────────────────────────────────────────
 * The plan for this phase asked for an FX rule built on **real** yield
 * deviations, and that turned out not to be buildable honestly. A real yield is
 * a nominal rate less an inflation rate, and no free tier ember has serves a CPI
 * series — Finnhub's economic calendar is 403 on the free plan, which phase 21
 * measured. The choice was a rule with an invented inflation number in it or a
 * different rule, and a fabricated input inside a formula is worse than the
 * missing formula, because the output looks exactly as calculated as a real one.
 * Recorded in the ADR rather than quietly substituted.
 */
export const currencyMomentum: Strategy = {
  id: "currency-momentum",
  name: "Currency momentum",
  family: "momentum",
  appliesTo: ["fx"],
  minBars: LOOKBACK + 1,

  citation: {
    authors: "Menkhoff, Sarno, Schmeling & Schrimpf",
    year: 2012,
    title: "Currency Momentum Strategies",
    where: "Journal of Financial Economics 106(3)",
    claim:
      "Sorting currencies on past one- to twelve-month excess returns produces significant momentum profits that are largely unrelated to carry and not explained by standard risk factors.",
  },

  evaluate(ctx) {
    const carryTerm = (carry: number | undefined) =>
      (carry ?? 0) * (LOOKBACK / ctx.periodsPerYear);

    const ownSpot = returnOver(ctx.candles, LOOKBACK);
    if (ownSpot === null || !ctx.fx) return null;

    const ownCarry = ctx.fx.baseRate - ctx.fx.quoteRate;
    const own = ownSpot + carryTerm(ownCarry);

    const peerReturns: number[] = [];
    for (const peer of ctx.peers) {
      if (peer.symbol === ctx.instrument.symbol) continue;
      const spot = returnOver(peer.candles, LOOKBACK);
      if (spot === null) continue;
      peerReturns.push(spot + carryTerm(peer.carry));
    }
    if (peerReturns.length < MIN_PEERS) return null;

    const column = [...peerReturns, own];
    const score = crossSectionalScore(own, column);
    if (score === null) return null;

    const rank = rankOf(own, column);
    const [base, quote] = [ctx.instrument.symbol.slice(0, 3), ctx.instrument.symbol.slice(3, 6)];

    return {
      strategyId: "currency-momentum",
      score,
      confidence: clamp(
        peerConfidence(column.length) * (0.3 + Math.abs(score) * 0.5),
        0.15,
        0.7,
      ),
      rationale: `Holding ${base} against ${quote} returned ${pct(own)} over three months, ${pct(carryTerm(ownCarry))} of it carry, ${ordinal(rank)} of ${column.length} pairs.`,
      // One to three months, per the paper, and it decays fast — currency
      // momentum reverses at longer horizons where equity momentum does not.
      horizonDays: 45,
      halfLifeDays: 21,
    };
  },
};
