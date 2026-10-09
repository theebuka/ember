import type { MarketKind, RiskProfile } from "@/lib/api/types";
import { maxDrawdown } from "./indicators/volatility";
import { clamp } from "./indicators/stats";
import { assess, qualifies, type AdviceAction } from "./ensemble";
import { buildContext, CONTEXT_BARS, type Universe } from "./context";
import type { StrategyId } from "./types";

/** Bars between evaluations. Weekly — daily would be noise, not signal. */
const STRIDE = 5;
/** Bars of history required before the first evaluation can run. */
const WARMUP = CONTEXT_BARS;

export interface BacktestTrade {
  symbol: string;
  market: MarketKind;
  action: AdviceAction;
  /** When the call was generated — the close the assessment was computed from. */
  signalAt: number;
  /** The price ember quoted on the card. */
  signalPrice: number;
  entryAt: number;
  entryPrice: number;
  /** Bars between the signal and the earliest possible fill. At least one. */
  entryLagBars: number;
  /**
   * Return given up between the call and the fill, in the call's own direction.
   *
   * Negative means the delay cost you. This is the number the plan for this phase
   * described as "real, unflattering, and something a product whose entire claim
   * is that you can check its record should be the one to publish".
   */
  actionGap: number;
  exitAt: number;
  exitPrice: number;
  /** Return in the direction of the call, so a good "reduce" is positive. */
  return: number;
  /** The position size the engine suggested, as a fraction of your portfolio. */
  weight: number;
  /** Whether the ATR stop was hit before the horizon elapsed. */
  stopped: boolean;
  /**
   * Still running: the horizon reaches past the last bar and the stop hasn't
   * been hit, so `exitAt` is today and the return is a mark, not a result.
   * Listed as "Exited Oct 9" with a figure beside it, it read as closed.
   */
  open: boolean;
  holdBars: number;
  score: number;
  confidence: number;
  /** Which strategies were behind it — powers the per-strategy breakdown. */
  drivers: StrategyId[];
}

export interface StrategyRecord {
  strategyId: StrategyId;
  calls: number;
  hitRate: number;
  averageReturn: number;
}

export interface BacktestResult {
  trades: BacktestTrade[];
  calls: number;
  hitRate: number;
  averageReturn: number;
  medianReturn: number;
  bestReturn: number;
  worstReturn: number;
  /** Average return divided by its own standard deviation across trades. */
  returnPerUnitRisk: number;
  stoppedOutRate: number;
  averageHoldBars: number;
  /**
   * Mean `actionGap` across every call — the cost of not being able to trade the
   * close you were shown.
   */
  averageActionGap: number;
  /** Mean bars between the call and the earliest fill. */
  averageEntryLagBars: number;
  /**
   * A book that took every call at the engine's own suggested size.
   *
   * Sized, not raw. Compounding each trade's full return would treat a 0.9%
   * position and a 15% one as identical full-book bets, which turns a modest
   * losing streak into a fictional near-total loss — the position sizing is
   * most of what the engine does, and a curve that ignores it is measuring a
   * strategy nobody would run.
   */
  equityCurve: { t: number; value: number }[];
  maxDrawdown: number;
  byStrategy: StrategyRecord[];
  /** Stated plainly on the methodology page. Never omitted. */
  caveats: string[];
}

/**
 * Walk-forward evaluation of the live engine.
 *
 * This is what makes the track record honest. It runs the same `assess()` the
 * advice feed calls, on truncated history, stepping forward through time — so
 * the page shows what the engine would actually have said, not a curve fitted
 * afterwards. If a strategy is bad, this reports that it is bad.
 *
 * Two rules keep it from flattering itself:
 *
 * **No lookahead.** `buildContext` truncates at the evaluation bar, and
 * nothing downstream can see past it. This is the invariant that separates a
 * real backtest from a very impressive-looking bug.
 *
 * **No overlapping positions.** A symbol already in a trade isn't
 * re-evaluated until it exits. Without this the same trend gets counted five
 * times and the hit rate becomes a measure of how often trends persist rather
 * than how often the engine is right.
 */
export function runBacktest({
  universe,
  riskProfile,
  symbols,
  synthetic = true,
}: {
  universe: Universe;
  riskProfile: RiskProfile;
  /** Defaults to the whole universe. */
  symbols?: readonly string[];
  /**
   * Whether the prices are generated. The two caveats about simulated data
   * were stated unconditionally, so a live build's track record opened by
   * telling its reader the numbers came from a random walk.
   */
  synthetic?: boolean;
}): BacktestResult {
  const trades: BacktestTrade[] = [];
  const targets = symbols ?? universe.instruments.map((i) => i.symbol);

  for (const symbol of targets) {
    const candles = universe.candles.get(symbol);
    if (!candles || candles.length < WARMUP + 20) continue;

    const instrument = universe.instruments.find((i) => i.symbol === symbol);
    if (!instrument) continue;

    // Bars before this are the warm-up the indicators need; the position
    // block means a trade in progress suppresses further entries.
    let cursor = WARMUP;

    while (cursor < candles.length - 2) {
      const context = buildContext(universe, symbol, cursor);
      if (!context) break;

      const assessment = assess({ context, riskProfile });

      // `qualifies`, not the old combined predicate: the backtest has to measure
      // exactly what the product surfaces, and since phase 15 that is conviction
      // and confidence clearing the bar. Timing is about *when* to fill a call,
      // not whether it was right.
      if (!assessment || !qualifies(assessment, riskProfile) || !assessment.sizing) {
        cursor += STRIDE;
        continue;
      }

      const direction = assessment.score >= 0 ? 1 : -1;

      const signalIndex = cursor;
      const signalPrice = candles[signalIndex].c;

      /**
       * The earliest bar a user could actually have filled — and it is never the
       * signal bar.
       *
       * This used to enter at `candles[cursor].c`, the very close the assessment
       * was computed from. That is not lookahead in the *signal* — the context is
       * correctly truncated — but it is lookahead in the *fill*: you learn a close
       * at the close, and the first price you can trade is the next session's. So
       * the entry moves to the next bar's open.
       *
       * The window check below is honest about its own scope and is **not**
       * currently doing anything: measured, `opensAt` falls inside the next bar for
       * every trade in every profile, so the lag is exactly 1.00 bars and this loop
       * never advances. A daily-bar backtest cannot price an intraday window —
       * that is a live-trading affordance — and the loop stays because it is the
       * correct rule the day the bars are finer, not because it is earning its
       * keep. §8 says so rather than leaving the reader to assume otherwise.
       *
       * §8 has said since phase 9 that "executing does not verify the fill". This
       * is the half of that gap the backtest can measure.
       */
      let entryIndex = signalIndex + 1;
      if (assessment.window.hasWindow) {
        while (
          entryIndex < candles.length - 1 &&
          candles[entryIndex].t < assessment.window.opensAt
        ) {
          entryIndex++;
        }
      }
      // No room left to open and close a trade.
      if (entryIndex >= candles.length - 1) break;

      const entryPrice = candles[entryIndex].o;

      /**
       * Ember's stated stop, not one re-derived from the fill.
       *
       * The card gives an absolute price. If the delay moved the market against
       * you, your risk on that trade is genuinely larger than the card implied,
       * and re-deriving the stop from the fill would quietly hide exactly the cost
       * this change exists to publish.
       */
      const stopPrice = assessment.sizing.stopPrice;

      // The engine's own suggested holding period, bounded so a 250-day
      // fundamental signal doesn't produce a trade the sample can't close.
      const holdBars = Math.round(clamp(assessment.horizonDays, 5, 60));
      const lastIndex = Math.min(entryIndex + holdBars, candles.length - 1);

      let exitIndex = lastIndex;
      let exitPrice = candles[lastIndex].c;
      let stopped = false;

      // Walk the bars looking for the stop before the horizon. Uses the bar's
      // low (long) or high (short), so an intraday touch counts — assuming
      // only closes would understate how often stops are hit.
      for (let i = entryIndex + 1; i <= lastIndex; i++) {
        const bar = candles[i];
        const touched = direction === 1 ? bar.l <= stopPrice : bar.h >= stopPrice;
        if (touched) {
          exitIndex = i;
          exitPrice = stopPrice;
          stopped = true;
          break;
        }
      }

      trades.push({
        symbol,
        market: instrument.market,
        action: assessment.action,
        signalAt: candles[signalIndex].t,
        signalPrice,
        entryAt: candles[entryIndex].t,
        entryPrice,
        entryLagBars: entryIndex - signalIndex,
        actionGap: direction * (entryPrice / signalPrice - 1),
        exitAt: candles[exitIndex].t,
        exitPrice,
        return: direction * (exitPrice / entryPrice - 1),
        weight: assessment.sizing.weight,
        stopped,
        open: !stopped && entryIndex + holdBars > candles.length - 1,
        holdBars: exitIndex - entryIndex,
        score: assessment.score,
        confidence: assessment.confidence,
        drivers: assessment.contributions
          .filter((c) => c.stance === "agrees")
          .map((c) => c.strategyId),
      });

      // Resume only after the position closes.
      cursor = Math.max(exitIndex + 1, cursor + STRIDE);
    }
  }

  trades.sort((a, b) => a.entryAt - b.entryAt);
  return summarise(trades, synthetic);
}

function summarise(trades: BacktestTrade[], synthetic: boolean): BacktestResult {
  const caveats = [
    // The one that matters most, and the one every app in this category
    // leaves out. Say it first.
    ...(synthetic
      ? [
          "These prices are simulated as a random walk, so results near chance are expected. They say nothing about real markets.",
        ]
      : []),
    "Trades enter at the next session's open, not the price you were shown. The cost of that delay is shown below.",
    "Slippage, spreads and fees aren't included, so real returns would be lower.",
    "The list of instruments is fixed, so companies that failed or delisted aren't counted.",
    "Each rule uses the settings its authors published, fitted to past data, so this isn't a fully independent test.",
    "Positions close at the suggested holding period or the stop, whichever comes first.",
  ];

  if (trades.length === 0) {
    return {
      trades: [],
      calls: 0,
      hitRate: 0,
      averageReturn: 0,
      medianReturn: 0,
      bestReturn: 0,
      worstReturn: 0,
      returnPerUnitRisk: 0,
      stoppedOutRate: 0,
      averageHoldBars: 0,
      averageActionGap: 0,
      averageEntryLagBars: 0,
      equityCurve: [],
      maxDrawdown: 0,
      byStrategy: [],
      caveats,
    };
  }

  const returns = trades.map((t) => t.return);
  const wins = returns.filter((r) => r > 0).length;

  const sorted = [...returns].sort((a, b) => a - b);
  const median =
    sorted.length % 2 === 1
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  const averageReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

  const variance =
    returns.reduce((acc, r) => acc + (r - averageReturn) ** 2, 0) /
    Math.max(1, returns.length - 1);
  const dispersion = Math.sqrt(variance);

  /**
   * The equity curve, compounded in the order the P&L was actually realised.
   *
   * **Sorted by exit, not entry.** `trades` is ordered by entry date for the
   * table, and positions in different instruments overlap — so compounding in
   * that order stamps each point with an exit date that can precede the one
   * before it. The final equity is the same either way (multiplication
   * commutes), but the *path* is not, and `maxDrawdown` is measured from the
   * path. Left unsorted it reports the drawdown of an arbitrary ordering
   * rather than of the strategy through time.
   */
  let equity = 1;
  const equityCurve = [...trades]
    .sort((a, b) => a.exitAt - b.exitAt)
    .map((t) => {
      equity *= 1 + t.return * t.weight;
      return { t: t.exitAt, value: equity };
    });

  const byStrategy = new Map<StrategyId, { calls: number; wins: number; total: number }>();
  for (const trade of trades) {
    for (const driver of trade.drivers) {
      const record = byStrategy.get(driver) ?? { calls: 0, wins: 0, total: 0 };
      record.calls++;
      if (trade.return > 0) record.wins++;
      record.total += trade.return;
      byStrategy.set(driver, record);
    }
  }

  return {
    trades,
    calls: trades.length,
    hitRate: wins / trades.length,
    averageReturn,
    medianReturn: median,
    bestReturn: sorted[sorted.length - 1],
    worstReturn: sorted[0],
    returnPerUnitRisk: dispersion === 0 ? 0 : averageReturn / dispersion,
    stoppedOutRate: trades.filter((t) => t.stopped).length / trades.length,
    averageHoldBars: trades.reduce((a, t) => a + t.holdBars, 0) / trades.length,
    averageActionGap: trades.reduce((a, t) => a + t.actionGap, 0) / trades.length,
    averageEntryLagBars:
      trades.reduce((a, t) => a + t.entryLagBars, 0) / trades.length,
    equityCurve,
    maxDrawdown: maxDrawdown(equityCurve.map((p) => p.value)),
    byStrategy: [...byStrategy.entries()]
      .map(([strategyId, r]) => ({
        strategyId,
        calls: r.calls,
        hitRate: r.wins / r.calls,
        averageReturn: r.total / r.calls,
      }))
      .sort((a, b) => b.calls - a.calls),
    caveats,
  };
}
