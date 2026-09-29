import { describe, expect, it } from "vitest";
import type { Candle, Instrument } from "@/lib/api/types";
import type { MarketEvent } from "@/lib/market/calendar";
import type { Assessment, Contribution } from "./ensemble";
import { evaluateExposure, type HeldExposure, type RiskTrigger } from "./exposure";
import { buildFindings } from "./findings";

/**
 * The loss-prevention engine, tested against fixtures rather than the market.
 *
 * Every trigger here is a rule with a threshold, and the point of the tests is
 * that the threshold is where it says it is — a drawdown warning that fires at
 * 11% on a Balanced profile is a different product from one that fires at 12%,
 * and neither the generated data nor a screenshot would ever show the
 * difference.
 */

const NOW = Date.UTC(2026, 7, 13, 12, 0, 0);
const DAY = 86_400_000;

/**
 * Flat bars at a fixed price, then a run at the closing level.
 *
 * `atr(candles, 20)` reads high/low/close, so the range is set explicitly
 * rather than left at zero: an ATR of zero makes the stop equal to the average
 * cost and every test would be measuring a degenerate case.
 */
function candles({
  close,
  range = 4,
  bars = 60,
}: {
  close: number;
  range?: number;
  bars?: number;
}): Candle[] {
  return Array.from({ length: bars }, (_, i) => ({
    t: NOW - (bars - i) * DAY,
    o: close,
    h: close + range / 2,
    l: close - range / 2,
    c: close,
    v: 1_000_000,
  }));
}

function contribution(overrides: Partial<Contribution> = {}): Contribution {
  return {
    strategyId: "ts-momentum",
    name: "Time-series momentum",
    family: "trend",
    score: 0.6,
    confidence: 0.5,
    weight: 0.5,
    rationale: "Twelve-month return is positive and above the risk-free rate.",
    stance: "agrees",
    citation: {
      authors: "Moskowitz, T., Ooi, Y. H. & Pedersen, L. H.",
      year: 2012,
      title: "Time Series Momentum",
      where: "Journal of Financial Economics 104(2)",
      claim: "An instrument's own trailing return predicts its next-month return.",
    },
    ...overrides,
  };
}

function assessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
    symbol: "NVDA",
    market: "equity",
    action: "hold",
    score: 0.1,
    confidence: 40,
    confidenceLabel: "Moderate",
    summary: "Nothing decisive either way.",
    detail: "Trend and momentum disagree.",
    contributions: [contribution()],
    agreement: { agrees: 1, dissents: 0, neutral: 0, silent: 0 },
    regime: {
      trend: "uptrend",
      vol: "normal",
      volatility: 0.28,
      volPercentile: 0.5,
      trendStrength: 0.05,
      label: "normal-vol uptrend",
      summary: "Volatility is around its usual level, holding 5.0% above its 200-day average.",
    },
    sizing: {
      weight: 0.06,
      stopMultiple: 2.5,
      stopPrice: 90,
      riskBudget: 0.01,
      instrumentVol: 0.3,
      note: "",
    },
    window: {
      from: NOW,
      to: NOW + 72 * 3_600_000,
      curve: [],
      peakAt: NOW,
      opensAt: NOW,
      closesAt: NOW + 6 * 3_600_000,
      hasWindow: true,
      notes: [],
      events: [],
    },
    horizonDays: 30,
    price: 100,
    createdAt: NOW,
    ...overrides,
  } as Assessment;
}

function instrumentFor(symbol: string): Instrument {
  return {
    symbol,
    name: symbol === "NVDA" ? "NVIDIA" : symbol,
    market: "equity",
    currency: "USD",
    precision: 2,
  };
}

function position(overrides: Partial<HeldExposure> = {}): HeldExposure {
  return {
    symbol: "NVDA",
    quantity: 100,
    averageCost: 100,
    openedAt: NOW - 90 * DAY,
    weight: 0.05,
    ...overrides,
  };
}

const triggersOf = (signals: { trigger: RiskTrigger }[]) =>
  signals.map((s) => s.trigger);

const evaluate = (overrides: {
  position?: Partial<HeldExposure>;
  assessment?: Partial<Assessment>;
  candles?: Candle[];
  entryAssessment?: Assessment | null;
  riskProfile?: "conservative" | "balanced" | "aggressive";
  events?: MarketEvent[];
}) => {
  const read = assessment(overrides.assessment);
  return evaluateExposure({
    position: position(overrides.position),
    instrument: instrumentFor(read.symbol),
    assessment: read,
    candles: overrides.candles ?? candles({ close: read.price }),
    entryAssessment: overrides.entryAssessment ?? null,
    riskProfile: overrides.riskProfile ?? "balanced",
    events: overrides.events,
    now: NOW,
  });
};

describe("evaluateExposure", () => {
  /**
   * The common case, and the one that has to stay cheap to say. A risk engine
   * that always finds something is a scaremonger and gets ignored inside a
   * week.
   */
  it("says nothing about a healthy position", () => {
    expect(evaluate({})).toEqual([]);
  });

  it("ignores a position with no quantity or no cost basis", () => {
    expect(evaluate({ position: { quantity: 0 } })).toEqual([]);
    // `averageCost` of zero is what a fully-clamped imported ledger produces.
    expect(evaluate({ position: { averageCost: 0 } })).toEqual([]);
  });

  describe("the stop, measured from the user's entry", () => {
    /**
     * The signal v1 structurally could not produce. `sizing.stopPrice` is
     * anchored to last close for a hypothetical new position; this one is
     * anchored to what the user actually paid.
     */
    it("fires when price is through 2.5 ATR below the average cost", () => {
      // ATR ≈ 4, so the stop sits at 100 − 2.5 × 4 = 90.
      const signals = evaluate({
        assessment: { price: 89 },
        candles: candles({ close: 89, range: 4 }),
        position: { averageCost: 100 },
      });

      expect(triggersOf(signals)).toContain("stop-breached");
      expect(signals[0].severity).toBe("critical");
      expect(signals[0].action.sellFraction).toBe(1);
      expect(signals[0].action.label).toBe("Close the position");
    });

    it("stays quiet a hair above the stop", () => {
      const signals = evaluate({
        assessment: { price: 91 },
        candles: candles({ close: 91, range: 4 }),
        position: { averageCost: 100 },
      });
      expect(triggersOf(signals)).not.toContain("stop-breached");
    });

    /**
     * A stop is a distance in the instrument's own volatility, so a placid
     * name stops out on a much smaller move than a wild one. That is the whole
     * argument for ATR and it should be visible in the output.
     */
    it("scales with the instrument's own range", () => {
      const wild = evaluate({
        assessment: { price: 92 },
        candles: candles({ close: 92, range: 12 }),
        position: { averageCost: 100 },
      });
      const placid = evaluate({
        assessment: { price: 92 },
        candles: candles({ close: 92, range: 2 }),
        position: { averageCost: 100 },
      });

      expect(triggersOf(wild)).not.toContain("stop-breached");
      expect(triggersOf(placid)).toContain("stop-breached");
    });

    /** Two rows describing one loss is noise on a card that needs acting on. */
    it("suppresses the drawdown warning it would duplicate", () => {
      const signals = evaluate({
        assessment: { price: 80 },
        candles: candles({ close: 80, range: 4 }),
        position: { averageCost: 100 },
      });

      expect(triggersOf(signals)).toContain("stop-breached");
      expect(triggersOf(signals)).not.toContain("drawdown");
    });
  });

  describe("drawdown from entry", () => {
    /** 12% on Balanced — the band is a stated judgement call, not a fit. */
    it("fires at the profile's band and not before it", () => {
      const under = evaluate({
        assessment: { price: 89 },
        candles: candles({ close: 89, range: 20 }),
        position: { averageCost: 100 },
      });
      const over = evaluate({
        assessment: { price: 87 },
        candles: candles({ close: 87, range: 20 }),
        position: { averageCost: 100 },
      });

      expect(triggersOf(under)).not.toContain("drawdown");
      expect(triggersOf(over)).toContain("drawdown");
    });

    it("gives a conservative profile a shorter leash than an aggressive one", () => {
      const options = {
        assessment: { price: 90 },
        candles: candles({ close: 90, range: 20 }),
        position: { averageCost: 100 },
      };

      expect(triggersOf(evaluate({ ...options, riskProfile: "conservative" }))).toContain(
        "drawdown",
      );
      expect(
        triggersOf(evaluate({ ...options, riskProfile: "aggressive" })),
      ).not.toContain("drawdown");
    });

    /**
     * The sizing rule behind every signal here: reduce to what ember would
     * hold today. On a read that no longer supports the position at all, that
     * is a full exit; on one that still does, it is a partial.
     */
    it("sizes the response to what today's read supports", () => {
      const partial = evaluate({
        assessment: {
          price: 85,
          score: 0.5,
          sizing: { ...assessment().sizing!, weight: 0.04 },
        },
        candles: candles({ close: 85, range: 20 }),
        position: { averageCost: 100, weight: 0.08 },
      });

      const drawdown = partial.find((s) => s.trigger === "drawdown")!;
      expect(drawdown.action.targetWeight).toBe(0.04);
      expect(drawdown.action.sellFraction).toBeCloseTo(0.5, 6);
      expect(drawdown.action.quantity).toBeCloseTo(50, 6);

      const full = evaluate({
        assessment: { price: 85, score: -0.3 },
        candles: candles({ close: 85, range: 20 }),
        position: { averageCost: 100, weight: 0.08 },
      });

      expect(full.find((s) => s.trigger === "drawdown")!.action.sellFraction).toBe(1);
    });
  });

  describe("thesis decay", () => {
    it("names the rules that flipped, matched by id rather than by rank", () => {
      const entry = assessment({
        contributions: [
          contribution({ strategyId: "ts-momentum", name: "Time-series momentum", score: 0.7, weight: 0.6 }),
          contribution({ strategyId: "clenow", name: "Clenow momentum", score: 0.4, weight: 0.4 }),
        ],
      });

      const signals = evaluate({
        entryAssessment: entry,
        assessment: {
          // Deliberately reordered, and the flipped rule is now last.
          contributions: [
            contribution({ strategyId: "clenow", name: "Clenow momentum", score: 0.3, weight: 0.7 }),
            contribution({
              strategyId: "ts-momentum",
              name: "Time-series momentum",
              score: -0.6,
              weight: 0.3,
              rationale: "Twelve-month return has fallen below the risk-free rate.",
            }),
          ],
        },
      });

      const decay = signals.find((s) => s.trigger === "thesis-decay")!;
      expect(decay.headline).toContain("Time-series momentum");
      expect(decay.detail).toContain("60%");
      // The citation travels from the rule that stopped holding, not a generic one.
      expect(decay.citation.title).toBe("Time Series Momentum");
    });

    it("ignores a rule that merely weakened without turning", () => {
      const entry = assessment({
        contributions: [contribution({ score: 0.7, weight: 1 })],
      });
      const signals = evaluate({
        entryAssessment: entry,
        assessment: { contributions: [contribution({ score: 0.05, weight: 1 })] },
      });
      expect(triggersOf(signals)).not.toContain("thesis-decay");
    });

    /**
     * A position bought before ember existed has no entry read, and withholding
     * risk signals from the oldest positions — the ones most likely to have
     * drifted — would be exactly the wrong failure mode.
     */
    it("falls back to today's read when there is no entry to compare against", () => {
      const signals = evaluate({
        assessment: { action: "sell", score: -0.6, confidence: 45 },
      });
      const decay = signals.find((s) => s.trigger === "thesis-decay")!;
      expect(decay.severity).toBe("critical");
      expect(decay.action.sellFraction).toBe(1);
    });

    it("holds the fallback to the profile's own bar", () => {
      // Score below Balanced's 0.22 threshold: a read, not a recommendation.
      const signals = evaluate({
        assessment: { action: "reduce", score: -0.2, confidence: 45 },
      });
      expect(triggersOf(signals)).not.toContain("thesis-decay");
    });
  });

  describe("regime flip", () => {
    const stressed = {
      regime: {
        ...assessment().regime,
        trend: "downtrend" as const,
        vol: "stressed" as const,
      },
    };

    it("fires when the position is now in a stressed downtrend", () => {
      expect(triggersOf(evaluate({ assessment: stressed }))).toContain("regime-flip");
    });

    it("does not fire when it was already in one at entry", () => {
      const entry = assessment(stressed);
      expect(
        triggersOf(evaluate({ assessment: stressed, entryAssessment: entry })),
      ).not.toContain("regime-flip");
    });

    it("needs both halves — a downtrend at normal volatility is not a flip", () => {
      const signals = evaluate({
        assessment: {
          regime: { ...assessment().regime, trend: "downtrend", vol: "normal" },
        },
      });
      expect(triggersOf(signals)).not.toContain("regime-flip");
    });
  });

  describe("concentration", () => {
    it("fires above 1.25× the profile's cap and sizes back to the cap", () => {
      // Balanced caps a position at 15%.
      expect(triggersOf(evaluate({ position: { weight: 0.18 } }))).not.toContain(
        "concentration",
      );

      const signals = evaluate({ position: { weight: 0.3 } });
      const concentration = signals.find((s) => s.trigger === "concentration")!;
      expect(concentration.action.targetWeight).toBe(0.15);
      expect(concentration.action.sellFraction).toBeCloseTo(0.5, 6);
    });

    it("moves with the profile", () => {
      // 12% is over Conservative's 8% cap by more than a quarter, and well
      // under Aggressive's 25%.
      expect(
        triggersOf(evaluate({ position: { weight: 0.12 }, riskProfile: "conservative" })),
      ).toContain("concentration");
      expect(
        triggersOf(evaluate({ position: { weight: 0.12 }, riskProfile: "aggressive" })),
      ).not.toContain("concentration");
    });
  });

  describe("event risk", () => {
    const earnings: MarketEvent = {
      id: "nvda-q3",
      kind: "earnings",
      at: NOW + 2 * DAY,
      label: "NVDA Q3",
      symbols: ["NVDA"],
      markets: ["equity"],
      blackoutHoursBefore: 6,
      blackoutHoursAfter: 6,
    };

    it("fires only on a position large enough for it to matter", () => {
      expect(
        triggersOf(evaluate({ events: [earnings], position: { weight: 0.05 } })),
      ).not.toContain("event-risk");
      expect(
        triggersOf(evaluate({ events: [earnings], position: { weight: 0.13 } })),
      ).toContain("event-risk");
    });

    it("ignores an event outside the horizon", () => {
      const distant = { ...earnings, at: NOW + 9 * DAY };
      expect(
        triggersOf(evaluate({ events: [distant], position: { weight: 0.13 } })),
      ).not.toContain("event-risk");
    });
  });

  it("returns the worst signal first", () => {
    const signals = evaluate({
      assessment: { price: 80 },
      candles: candles({ close: 80, range: 4 }),
      position: { averageCost: 100, weight: 0.4 },
    });

    expect(signals.length).toBeGreaterThan(1);
    expect(signals[0].trigger).toBe("stop-breached");
    for (let i = 1; i < signals.length; i++) {
      expect(signals[i - 1].urgency).toBeGreaterThanOrEqual(signals[i].urgency);
    }
  });

  it("always carries a sized action, never a bare direction", () => {
    const signals = evaluate({
      assessment: { price: 80 },
      candles: candles({ close: 80, range: 4 }),
      position: { averageCost: 100, weight: 0.4 },
    });

    for (const signal of signals) {
      expect(signal.action.label).toBeTruthy();
      expect(signal.action.note).toBeTruthy();
      expect(signal.action.sellFraction).toBeGreaterThan(0);
      expect(signal.action.quantity).toBeGreaterThan(0);
      expect(signal.citation.authors).toBeTruthy();
      expect(signal.citation.year).toBeGreaterThan(1900);
    }
  });
});

describe("buildFindings", () => {
  const build = (options: {
    assessments: Assessment[];
    positions?: HeldExposure[];
    watching?: string[] | null;
  }) =>
    buildFindings({
      assessments: options.assessments,
      riskProfile: "balanced",
      positions: options.positions ?? [],
      watching: options.watching ?? null,
      candles: new Map(
        options.assessments.map((a) => [a.symbol, candles({ close: a.price })]),
      ),
      instruments: new Map(
        options.assessments.map((a) => [a.symbol, instrumentFor(a.symbol)]),
      ),
      now: NOW,
    });

  it("surfaces a qualifying buy as an opportunity", () => {
    const findings = build({
      assessments: [assessment({ action: "buy", score: 0.6, confidence: 45 })],
    });
    expect(findings.map((f) => f.kind)).toEqual(["opportunity"]);
    expect(findings[0].id).toBe("opportunity:NVDA");
  });

  /**
   * The differentiator v1 threw away. `isActionable` required `hasWindow`, so
   * a call whose window had not arrived never reached the user at all.
   */
  it("keeps a find whose window has not opened, and says when it will", () => {
    const opensAt = NOW + 20 * 3_600_000;
    const findings = build({
      assessments: [
        assessment({
          action: "buy",
          score: 0.6,
          confidence: 45,
          window: { ...assessment().window, opensAt, closesAt: opensAt + 3_600_000 },
        }),
      ],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].ready).toBe(false);
    expect(findings[0].opensAt).toBe(opensAt);
  });

  it("does not raise a risk on an instrument the user doesn't hold", () => {
    const findings = build({
      assessments: [assessment({ action: "sell", score: -0.6, confidence: 45 })],
    });
    expect(findings).toEqual([]);
  });

  it("raises a risk on the same instrument once it is held", () => {
    const findings = build({
      assessments: [assessment({ action: "sell", score: -0.6, confidence: 45 })],
      positions: [position()],
    });
    expect(findings.map((f) => f.kind)).toEqual(["risk"]);
  });

  /** Sorted by urgency across both kinds, not kind first. */
  it("ranks a strong opportunity above a low-urgency risk", () => {
    const findings = build({
      assessments: [
        assessment({ symbol: "NVDA", action: "buy", score: 0.9, confidence: 55 }),
        assessment({ symbol: "AAPL", action: "hold", score: 0.05 }),
      ],
      // Over the cap, which is a `watch`, not a crisis.
      positions: [position({ symbol: "AAPL", weight: 0.25 })],
    });

    expect(findings.map((f) => f.symbol)).toEqual(["NVDA", "AAPL"]);
  });
});
