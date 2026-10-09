import { beforeAll, describe, expect, it } from "vitest";
import { RISK_PROFILES, type MarketKind } from "@/lib/api/types";
import { mockProvider } from "@/lib/market/providers/mock";
import { liquidityAt, zonedTime } from "@/lib/market/sessions";
import { INSTRUMENT_BY_SYMBOL } from "@/lib/market/universe";
import { runBacktest } from "./backtest";
import { buildContext, loadUniverse, type Universe } from "./context";
import { assess, qualifies } from "./ensemble";
import { detectRegime } from "./regime";
import type { Strategy, StrategyFamily } from "./types";
import { computeWindow } from "./window";

/**
 * End-to-end tests for the engine: generated candles in, coherent advice out.
 *
 * The ensemble tests use injected strategies with known outputs rather than
 * the real ten. Asserting on real strategy output would make these a snapshot
 * of whatever the generated market happens to be doing today — passing for
 * the wrong reasons and breaking for the wrong ones.
 */

let universe: Universe;

beforeAll(async () => {
  universe = await loadUniverse(mockProvider);
});

/* ── Generated data ─────────────────────────────────────────────────────── */

describe("mock provider", () => {
  it("produces internally consistent candles", async () => {
    for (const instrument of mockProvider.listInstruments()) {
      const candles = await mockProvider.getCandles(instrument.symbol);
      expect(candles.length).toBeGreaterThan(500);

      for (const bar of candles) {
        expect(bar.h).toBeGreaterThanOrEqual(Math.max(bar.o, bar.c));
        expect(bar.l).toBeLessThanOrEqual(Math.min(bar.o, bar.c));
        expect(bar.l).toBeGreaterThan(0);
        expect(Number.isFinite(bar.c)).toBe(true);
      }
    }
  });

  it("returns bars in ascending time order", async () => {
    const candles = await mockProvider.getCandles("AAPL");
    for (let i = 1; i < candles.length; i++) {
      expect(candles[i].t).toBeGreaterThan(candles[i - 1].t);
    }
  });

  it("skips weekends for equities and keeps them for crypto", async () => {
    const equity = await mockProvider.getCandles("AAPL");
    for (const bar of equity.slice(0, -1)) {
      const weekday = new Date(bar.t).getUTCDay();
      expect(weekday).not.toBe(0);
      expect(weekday).not.toBe(6);
    }

    const crypto = await mockProvider.getCandles("BTC");
    expect(new Set(crypto.map((b) => new Date(b.t).getUTCDay())).size).toBe(7);
  });

  it("is deterministic — the same day yields the same history", async () => {
    const first = await mockProvider.getCandles("NVDA");
    const second = await mockProvider.getCandles("NVDA");
    expect(second.map((b) => b.c)).toEqual(first.map((b) => b.c));
  });

  it("lands close to the anchor price", async () => {
    for (const spec of INSTRUMENT_BY_SYMBOL.values()) {
      const quote = await mockProvider.getQuote(spec.symbol);
      expect(quote).not.toBeNull();
      // The path is rescaled to end on the anchor; only the live intraday bar
      // moves it, and only by a fraction of a day's volatility.
      expect(quote!.price).toBeGreaterThan(spec.anchorPrice * 0.9);
      expect(quote!.price).toBeLessThan(spec.anchorPrice * 1.1);
    }
  });

  it("generates volatility clustering, not flat noise", () => {
    // A constant-volatility path gives near-identical realised volatility in
    // every window. Real markets don't, and neither should the generator —
    // without clustering there are no regimes for the filter to detect.
    const candles = universe.candles.get("BTC")!;
    const windows: number[] = [];

    for (let start = 0; start + 60 < candles.length; start += 60) {
      const slice = candles.slice(start, start + 60);
      const returns = slice.slice(1).map((b, i) => Math.log(b.c / slice[i].c));
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      windows.push(
        Math.sqrt(
          returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1),
        ),
      );
    }

    expect(Math.max(...windows) / Math.min(...windows)).toBeGreaterThan(1.8);
  });
});

/* ── Sessions and the execution window ──────────────────────────────────── */

describe("sessions", () => {
  it("closes US equities outside 09:30–16:00 Eastern", () => {
    const start = Date.UTC(2026, 7, 10); // a Monday
    for (let h = 0; h < 24 * 7; h++) {
      const at = start + h * 3_600_000;
      const t = zonedTime(at, "America/New_York");

      const withinHours =
        t.weekday >= 1 &&
        t.weekday <= 5 &&
        t.minutes >= 9 * 60 + 30 &&
        t.minutes <= 16 * 60;

      expect(liquidityAt(at, "equity") > 0).toBe(withinHours);
    }
  });

  it("closes forex on Saturday and keeps crypto open all week", () => {
    const saturday = Date.UTC(2026, 7, 15, 12);
    expect(liquidityAt(saturday, "fx")).toBe(0);
    expect(liquidityAt(saturday, "crypto")).toBeGreaterThan(0);
  });

  it("rates the London/New York overlap above the New York gap", () => {
    const wednesday = Date.UTC(2026, 7, 12);
    expect(liquidityAt(wednesday + 14 * 3_600_000, "fx")).toBeGreaterThan(
      liquidityAt(wednesday + 22 * 3_600_000, "fx"),
    );
  });
});

describe("execution window", () => {
  const now = Date.UTC(2026, 7, 12, 13); // Wednesday

  it("never opens an equity window while the market is shut", () => {
    const window = computeWindow({
      now,
      symbol: "AAPL",
      market: "equity",
      halfLifeDays: 20,
    });

    expect(window.hasWindow).toBe(true);
    for (const sample of window.curve) {
      if (sample.intensity > 0) {
        expect(liquidityAt(sample.t, "equity")).toBeGreaterThan(0);
      }
    }
  });

  it("puts the peak inside the window it reports", () => {
    const window = computeWindow({
      now,
      symbol: "BTC",
      market: "crypto",
      halfLifeDays: 30,
    });

    expect(window.peakAt).toBeGreaterThanOrEqual(window.opensAt);
    expect(window.peakAt).toBeLessThanOrEqual(window.closesAt);
    expect(window.notes.length).toBeGreaterThan(0);
  });

  it("closes a short-half-life window sooner than a long one", () => {
    const fast = computeWindow({ now, symbol: "BTC", market: "crypto", halfLifeDays: 2 });
    const slow = computeWindow({ now, symbol: "BTC", market: "crypto", halfLifeDays: 90 });

    // A two-day edge cannot justify the same window as a three-month one —
    // the reason half-life is threaded all the way through the ensemble.
    expect(fast.closesAt - fast.opensAt).toBeLessThan(slow.closesAt - slow.opensAt);
  });

  it("excludes the hours around a scheduled release", () => {
    const cpi = now + 30 * 3_600_000;
    const window = computeWindow({
      now,
      symbol: "BTC",
      market: "crypto",
      halfLifeDays: 30,
      events: [
        {
          id: "cpi",
          kind: "cpi",
          at: cpi,
          label: "US CPI",
          symbols: [],
          markets: ["crypto"],
          blackoutHoursBefore: 3,
          blackoutHoursAfter: 2,
        },
      ],
    });

    const blacked = window.curve.filter(
      (s) => s.t > cpi - 3 * 3_600_000 && s.t < cpi + 2 * 3_600_000,
    );
    expect(blacked.length).toBeGreaterThan(0);
    for (const sample of blacked) expect(sample.intensity).toBe(0);
  });
});

/* ── Ensemble ───────────────────────────────────────────────────────────── */

/** A strategy with a fixed opinion, for testing the blend. */
function fakeStrategy({
  id,
  score,
  confidence = 0.8,
  family = "trend",
  silent = false,
  quiet = false,
  minBars = 1,
}: {
  id: string;
  score: number;
  confidence?: number;
  family?: StrategyFamily;
  silent?: boolean;
  quiet?: boolean;
  minBars?: number;
}): Strategy {
  return {
    id: id as Strategy["id"],
    name: id,
    family,
    appliesTo: ["equity", "crypto", "fx"] as MarketKind[],
    minBars,
    citation: { authors: "test", year: 2026, title: "test", where: "test", claim: "test" },
    evaluate: () =>
      silent
        ? null
        : {
            strategyId: id as Strategy["id"],
            score: quiet ? 0 : score,
            quiet,
            confidence,
            rationale: `${id} says ${score}`,
            horizonDays: 30,
            halfLifeDays: 20,
          },
  };
}

/** A context with a hand-built trend, for exercising the regime filter. */
function syntheticContext({ drift, vol }: { drift: number; vol: number }) {
  const base = buildContext(universe, "AAPL")!;
  let price = 100;

  const candles = base.candles.map((bar, i) => {
    // A deterministic oscillation, so the regime the test asserts on is
    // exactly the regime it constructed.
    price *= 1 + drift + vol * Math.sin(i / 3);
    return { ...bar, o: price, h: price * (1 + vol), l: price * (1 - vol), c: price };
  });

  return { ...base, candles, peers: [] };
}

describe("ensemble", () => {
  const contextFor = (symbol: string) => buildContext(universe, symbol)!;

  it("reports unanimity as high confidence", () => {
    // A trending context, so the regime isn't damping trend strategies. On a
    // ranging series the same unanimous signals correctly come out lower —
    // that behaviour has its own test below.
    const result = assess({
      context: syntheticContext({ drift: 0.0008, vol: 0.008 }),
      riskProfile: "balanced",
      strategies: [
        fakeStrategy({ id: "a", score: 0.8 }),
        fakeStrategy({ id: "b", score: 0.75 }),
        fakeStrategy({ id: "c", score: 0.85 }),
      ],
    })!;

    expect(result.action).toBe("buy");
    expect(result.agreement.agrees).toBe(3);
    expect(result.agreement.dissents).toBe(0);
    expect(result.confidence).toBeGreaterThan(60);
  });

  it("lowers confidence when strategies disagree", () => {
    const agreed = assess({
      context: contextFor("AAPL"),
      riskProfile: "balanced",
      strategies: [
        fakeStrategy({ id: "a", score: 0.6 }),
        fakeStrategy({ id: "b", score: 0.6 }),
        fakeStrategy({ id: "c", score: 0.6 }),
      ],
    })!;

    const split = assess({
      context: contextFor("AAPL"),
      riskProfile: "balanced",
      strategies: [
        fakeStrategy({ id: "a", score: 0.9 }),
        fakeStrategy({ id: "b", score: 0.9 }),
        fakeStrategy({ id: "c", score: -0.9 }),
      ],
    })!;

    // Both land on a positive call, but a split verdict must not be presented
    // with the same conviction as a unanimous one.
    expect(split.score).toBeGreaterThan(0);
    expect(split.agreement.dissents).toBe(1);
    expect(split.confidence).toBeLessThan(agreed.confidence);
  });

  it("names the dissenter in the summary", () => {
    // Both in one family on purpose: regime weighting then applies equally to
    // each, so the blend is arithmetic and the test doesn't depend on
    // whatever regime the generated AAPL series happens to be in today.
    const result = assess({
      context: contextFor("AAPL"),
      riskProfile: "balanced",
      strategies: [
        fakeStrategy({ id: "momentum-ish", score: 0.9 }),
        fakeStrategy({ id: "contrarian-ish", score: -0.4 }),
      ],
    })!;

    expect(result.action).toBe("accumulate");
    expect(result.summary).toContain("contrarian-ish");
    expect(result.summary.toLowerCase()).toContain("dissent");
  });

  it("reports a standoff rather than staying quiet about it", () => {
    // Two strong, opposed reads cancel to a hold. The naive reading is
    // "nothing to report", but a genuine standoff is the most useful thing
    // the engine can say here, so both sides have to be named.
    const result = assess({
      context: contextFor("AAPL"),
      riskProfile: "balanced",
      strategies: [
        fakeStrategy({ id: "bull-case", score: 0.6 }),
        fakeStrategy({ id: "bear-case", score: -0.6 }),
      ],
    })!;

    expect(result.action).toBe("hold");
    expect(result.summary.toLowerCase()).toContain("bull-case");
    expect(result.summary.toLowerCase()).toContain("bear-case");
    expect(result.summary.toLowerCase()).toContain("decisive");
  });

  it("counts strategies that decline to speak", () => {
    const result = assess({
      context: contextFor("AAPL"),
      riskProfile: "balanced",
      strategies: [
        fakeStrategy({ id: "a", score: 0.7 }),
        fakeStrategy({ id: "b", score: 0, silent: true }),
        fakeStrategy({ id: "c", score: 0, silent: true }),
      ],
    })!;

    expect(result.agreement.silent).toBe(2);
    expect(result.contributions).toHaveLength(1);
  });

  it("holds when nothing is decisive, and carries no size", () => {
    const result = assess({
      context: contextFor("AAPL"),
      riskProfile: "balanced",
      strategies: [
        fakeStrategy({ id: "a", score: 0.05 }),
        fakeStrategy({ id: "b", score: -0.05 }),
      ],
    })!;

    expect(result.action).toBe("hold");
    expect(result.sizing).toBeNull();
    expect(qualifies(result, "balanced")).toBe(false);
  });

  it("down-weights mean reversion in a stressed downtrend", () => {
    // Same signal, two regimes. This filter is what stops the app buying dips
    // into a crash, so it has to actually change the answer.
    const strategies = [fakeStrategy({ id: "dip", score: 0.9, family: "mean-reversion" })];

    const inCrash = assess({
      context: syntheticContext({ drift: -0.0035, vol: 0.045 }),
      riskProfile: "balanced",
      strategies,
    })!;
    const inCalm = assess({
      context: syntheticContext({ drift: 0.0008, vol: 0.008 }),
      riskProfile: "balanced",
      strategies,
    })!;

    expect(inCrash.regime.trend).toBe("downtrend");
    expect(inCalm.regime.trend).toBe("uptrend");
    expect(inCrash.confidence).toBeLessThan(inCalm.confidence);
  });

  it("sizes a wild instrument smaller than a placid one at equal conviction", () => {
    const strategies = [fakeStrategy({ id: "a", score: 0.8, confidence: 0.9 })];

    const placid = assess({ context: contextFor("JPM"), riskProfile: "balanced", strategies })!;
    const wild = assess({ context: contextFor("SOL"), riskProfile: "balanced", strategies })!;

    expect(wild.sizing!.weight).toBeLessThan(placid.sizing!.weight);
  });

  it("puts the stop on the losing side of the trade", () => {
    const long = assess({
      context: contextFor("AAPL"),
      riskProfile: "balanced",
      strategies: [fakeStrategy({ id: "a", score: 0.9 })],
    })!;
    const short = assess({
      context: contextFor("AAPL"),
      riskProfile: "balanced",
      strategies: [fakeStrategy({ id: "a", score: -0.9 })],
    })!;

    expect(long.sizing!.stopPrice).toBeLessThan(long.price);
    expect(short.sizing!.stopPrice).toBeGreaterThan(short.price);
  });

  it("gives conservative and aggressive profiles genuinely different books", () => {
    const strategies = [
      fakeStrategy({ id: "dip", score: 0.7, family: "mean-reversion" }),
      fakeStrategy({ id: "quality", score: 0.2, family: "quality" }),
    ];
    const context = contextFor("MSFT");

    const cautious = assess({ context, riskProfile: "conservative", strategies })!;
    const bold = assess({ context, riskProfile: "aggressive", strategies })!;

    // Conservative leans on the quality read and distrusts the dip; aggressive
    // does the reverse. If the profile only changed size it would be a label.
    expect(bold.score).toBeGreaterThan(cautious.score);
    expect(bold.sizing!.weight).toBeGreaterThan(cautious.sizing!.weight);
  });
});

/**
 * Confidence must not depend on how many rules are in the engine (decision 304).
 *
 * Three phases each added rules and each time every confidence fell, until the
 * profiles' floors had to be lowered by hand. These pin the property instead: a
 * rule that cannot or does not speak about an instrument changes nothing about
 * it, and correlated rules count as the voices they are.
 */
describe("confidence does not depend on the number of rules", () => {
  const base = () => [
    fakeStrategy({ id: "a", score: 0.7 }),
    fakeStrategy({ id: "b", score: 0.5, confidence: 0.6 }),
    fakeStrategy({ id: "c", score: -0.3, confidence: 0.5 }),
  ];
  const run = (strategies: Strategy[]) =>
    assess({ context: buildContext(universe, "AAPL")!, riskProfile: "balanced", strategies })!;

  it("a rule that cannot assess the instrument changes nothing", () => {
    const without = run(base());
    const withNull = run([...base(), fakeStrategy({ id: "d", score: 0, silent: true })]);
    expect(withNull.confidence).toBe(without.confidence);
    expect(withNull.score).toBe(without.score);
  });

  it("a quiet rule changes nothing, and is still shown", () => {
    const without = run(base());
    const withQuiet = run([...base(), fakeStrategy({ id: "d", score: 0.9, quiet: true })]);
    expect(withQuiet.confidence).toBe(without.confidence);
    expect(withQuiet.score).toBe(without.score);

    const shown = withQuiet.contributions.find((c) => c.name === "d")!;
    expect(shown.weight).toBe(0);
    expect(shown.score).toBe(0);
    expect(shown.stance).toBe("neutral");
  });

  /** Thin history is thin evidence: a rule that would speak with more bars still costs. */
  it("a rule the listing is too young for still costs coverage", () => {
    const without = run(base());
    const young = run([...base(), fakeStrategy({ id: "d", score: 0.6, minBars: 1_000_000 })]);
    expect(young.confidence).toBeLessThan(without.confidence);
  });

  /**
   * Three readings of one number are one voice. Against an equal and opposite
   * independent rule, the declared group must not win three votes to one.
   */
  it("a correlated group counts as the voices it is", () => {
    const result = run([
      fakeStrategy({ id: "ts-momentum", score: 0.6 }),
      fakeStrategy({ id: "xs-momentum", score: 0.6 }),
      fakeStrategy({ id: "dual-momentum", score: 0.6 }),
      fakeStrategy({ id: "a", score: -0.6 }),
    ]);
    expect(Math.abs(result.score)).toBeLessThan(0.05);
    expect(result.action).toBe("hold");
  });
});

/* ── Regime ─────────────────────────────────────────────────────────────── */

describe("regime", () => {
  it("classifies every instrument in the universe", () => {
    for (const instrument of universe.instruments) {
      const context = buildContext(universe, instrument.symbol)!;
      const regime = detectRegime(context.candles, context.periodsPerYear);

      expect(regime, `${instrument.symbol}`).not.toBeNull();
      expect(["uptrend", "downtrend", "range"]).toContain(regime!.trend);
      expect(regime!.volPercentile).toBeGreaterThanOrEqual(0);
      expect(regime!.volPercentile).toBeLessThanOrEqual(1);
      expect(regime!.summary.length).toBeGreaterThan(10);
    }
  });
});

/* ── Full run against the real strategies ───────────────────────────────── */

describe("assess, against the real strategies", () => {
  it("produces a coherent assessment for every instrument", () => {
    for (const instrument of universe.instruments) {
      const context = buildContext(universe, instrument.symbol)!;
      const result = assess({ context, riskProfile: "balanced" });

      expect(result, `${instrument.symbol} produced no assessment`).not.toBeNull();
      expect(result!.score).toBeGreaterThanOrEqual(-1);
      expect(result!.score).toBeLessThanOrEqual(1);
      expect(result!.confidence).toBeGreaterThanOrEqual(0);
      expect(result!.confidence).toBeLessThanOrEqual(100);
      expect(result!.contributions.length).toBeGreaterThan(0);

      // Rationales are user-facing prose, not log lines.
      for (const contribution of result!.contributions) {
        expect(contribution.rationale.length).toBeGreaterThan(20);
        expect(contribution.rationale.trim()).toMatch(/\.$/);
      }

      // Ordered by influence, so a card can take the first as its headline.
      const weights = result!.contributions.map((c) => c.weight);
      expect([...weights].sort((a, b) => b - a)).toEqual(weights);
    }
  });

  it("only surfaces recommendations clearing both conviction and confidence", () => {
    for (const instrument of universe.instruments) {
      const context = buildContext(universe, instrument.symbol)!;
      const result = assess({ context, riskProfile: "balanced" });
      if (!result || !qualifies(result, "balanced")) continue;

      /**
       * Read from the profile, not written down here.
       *
       * These were the literals `0.22` and `35`, and the floor was re-derived in
       * phase 24 when the sixteen-rule ensemble shifted the confidence
       * distribution down — at which point this test failed on a value that was
       * correct. A test that restates a calibrated constant is a second place for
       * it to drift, and the constant is the thing under test's own input.
       */
      const { actionThreshold, confidenceFloor } = RISK_PROFILES.balanced;
      expect(Math.abs(result.score)).toBeGreaterThanOrEqual(actionThreshold);
      expect(result.confidence).toBeGreaterThanOrEqual(confidenceFloor);
      expect(result.sizing).not.toBeNull();
      expect(result.window.hasWindow).toBe(true);
    }
  });
});

/* ── Backtest ───────────────────────────────────────────────────────────── */

describe("backtest", () => {
  it("never lets a context see past its evaluation bar", () => {
    // The invariant separating a real backtest from an impressive bug.
    const full = universe.candles.get("AAPL")!;
    for (const index of [450, 600, 750]) {
      const context = buildContext(universe, "AAPL", index)!;
      expect(context.candles.at(-1)!.t).toBe(full[index].t);

      for (const peer of context.peers) {
        expect(peer.candles.every((bar) => bar.t <= full[index].t)).toBe(true);
      }
    }
  });

  it("runs walk-forward and reports coherent statistics", () => {
    const result = runBacktest({
      universe,
      riskProfile: "balanced",
      symbols: ["AAPL", "NVDA", "BTC", "EURUSD"],
    });

    expect(result.calls).toBeGreaterThan(0);
    expect(result.hitRate).toBeGreaterThanOrEqual(0);
    expect(result.hitRate).toBeLessThanOrEqual(1);
    expect(result.equityCurve).toHaveLength(result.calls);
    expect(result.caveats.length).toBeGreaterThanOrEqual(5);

    for (const trade of result.trades) {
      expect(trade.exitAt).toBeGreaterThanOrEqual(trade.entryAt);
      expect(trade.holdBars).toBeGreaterThan(0);
      expect(Number.isFinite(trade.return)).toBe(true);
    }
  });

  it("never holds two positions in one instrument at once", () => {
    const result = runBacktest({
      universe,
      riskProfile: "aggressive",
      symbols: ["NVDA", "SOL"],
    });

    const bySymbol = new Map<string, typeof result.trades>();
    for (const trade of result.trades) {
      const list = bySymbol.get(trade.symbol) ?? [];
      list.push(trade);
      bySymbol.set(trade.symbol, list);
    }

    for (const trades of bySymbol.values()) {
      for (let i = 1; i < trades.length; i++) {
        expect(trades[i].entryAt).toBeGreaterThan(trades[i - 1].exitAt);
      }
    }
  });

  /**
   * Compounding order is the whole point of this test, and it used to have it
   * backwards.
   *
   * `trades` is ordered by *entry*, for the table. `equityCurve` is ordered by
   * *exit*, because that is when the P&L was realised — decision 031, and the
   * reason `maxDrawdown` measures anything. Positions in different instruments
   * overlap, so the two orders genuinely differ.
   *
   * This test walked `trades` and indexed `equityCurve` positionally, which
   * only agrees when every trade exits in the order it entered. On the
   * thirteen-instrument universe that happened to hold for AAPL and MSFT, so
   * the test passed while asserting something untrue. Expanding the universe
   * changed the cross-sectional inputs, the trades moved, and the coincidence
   * ended — which is the useful kind of test failure.
   */
  it("compounds the equity curve in exit order, at the sizes the engine suggested", () => {
    const result = runBacktest({
      universe,
      riskProfile: "balanced",
      symbols: ["AAPL", "MSFT"],
    });

    expect(result.trades.length).toBeGreaterThan(1);
    for (const trade of result.trades) {
      expect(trade.weight).toBeGreaterThan(0);
      expect(trade.weight).toBeLessThanOrEqual(0.15); // the balanced cap
    }

    const byExit = [...result.trades].sort((a, b) => a.exitAt - b.exitAt);
    expect(result.equityCurve.map((p) => p.t)).toEqual(byExit.map((t) => t.exitAt));

    let expected = 1;
    byExit.forEach((trade, i) => {
      expected *= 1 + trade.return * trade.weight;
      expect(result.equityCurve[i].value).toBeCloseTo(expected, 10);
    });

    // Multiplication commutes, so the destination is order-independent even
    // though the path is not. Worth asserting explicitly: it is the property
    // that makes sorting by exit a correction to the *drawdown* rather than a
    // quiet change to the reported result.
    const inEntryOrder = result.trades.reduce(
      (acc, t) => acc * (1 + t.return * t.weight),
      1,
    );
    expect(result.equityCurve.at(-1)!.value).toBeCloseTo(inEntryOrder, 10);

    // Non-decreasing timestamps — the actual defect decision 031 fixed.
    for (let i = 1; i < result.equityCurve.length; i++) {
      expect(result.equityCurve[i].t).toBeGreaterThanOrEqual(
        result.equityCurve[i - 1].t,
      );
    }
  });
});
