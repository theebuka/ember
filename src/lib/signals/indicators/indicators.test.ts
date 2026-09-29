import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/api/types";
import { ema, sma, wilderSmooth } from "./moving-averages";
import { macd, roc, rsi } from "./momentum";
import {
  atr,
  maxDrawdown,
  realizedVolatility,
  trueRange,
} from "./volatility";
import { bollinger, donchian } from "./channels";
import { linearRegression, momentumRank } from "./regression";
import { percentileRank, stdev, zScore } from "./stats";

/**
 * Fixtures here are hand-computable rather than lifted from published tables.
 *
 * That's deliberate: a table copied from memory can be subtly wrong, and a
 * test that asserts the wrong number is worse than no test — it certifies the
 * bug. Every expectation below is either arithmetic worked out in the comment
 * beside it, or a property that must hold by definition.
 */

/** Build candles from closes, with a fixed range around each close. */
function candlesFrom(closes: number[], halfRange = 1): Candle[] {
  return closes.map((c, i) => ({
    t: i * 86_400_000,
    o: c,
    h: c + halfRange,
    l: c - halfRange,
    c,
    v: 1_000,
  }));
}

describe("sma", () => {
  it("averages the trailing window and leaves the warm-up null", () => {
    // Windows: [1,2,3]=2, [2,3,4]=3, [3,4,5]=4
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it("is all null when there are fewer values than the period", () => {
    expect(sma([1, 2], 5)).toEqual([null, null]);
  });
});

describe("ema", () => {
  it("seeds from the SMA and then applies alpha = 2/(n+1)", () => {
    // period 3 → alpha 0.5, seed = mean(1,2,3) = 2
    //   i=3: 4(0.5) + 2(0.5) = 3
    //   i=4: 5(0.5) + 3(0.5) = 4
    expect(ema([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
});

describe("wilderSmooth", () => {
  it("uses alpha = 1/period, not 2/(n+1)", () => {
    // seed = 2, then prev + (x - prev)/3
    //   i=3: 2 + (4-2)/3       = 2.666…
    //   i=4: 2.666… + (5-2.666…)/3 = 3.444…
    const out = wilderSmooth([1, 2, 3, 4, 5], 3);
    expect(out[2]).toBe(2);
    expect(out[3]).toBeCloseTo(2.6667, 4);
    expect(out[4]).toBeCloseTo(3.4444, 4);
  });

  it("differs from ema at the same period — they are not interchangeable", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(wilderSmooth(values, 3).at(-1)).not.toBeCloseTo(
      ema(values, 3).at(-1)!,
      6,
    );
  });
});

describe("rsi", () => {
  it("matches a hand-worked RSI(2)", () => {
    // closes [10,11,10,11,10] → changes +1,-1,+1,-1
    // gains  [1,0,1,0] → Wilder(2): 0.5, 0.75, 0.375
    // losses [0,1,0,1] → Wilder(2): 0.5, 0.25, 0.625
    //   RS 0.5/0.5   = 1    → 50
    //   RS 0.75/0.25 = 3    → 75
    //   RS 0.375/0.625=0.6  → 37.5
    const out = rsi([10, 11, 10, 11, 10], 2);
    expect(out[2]).toBeCloseTo(50, 6);
    expect(out[3]).toBeCloseTo(75, 6);
    expect(out[4]).toBeCloseTo(37.5, 6);
  });

  it("pins at 100 when nothing has fallen", () => {
    const rising = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(rsi(rising, 14).at(-1)).toBe(100);
  });

  it("pins at 0 when nothing has risen", () => {
    const falling = Array.from({ length: 30 }, (_, i) => 100 - i);
    expect(rsi(falling, 14).at(-1)).toBeCloseTo(0, 6);
  });

  it("stays inside 0…100 on noisy input", () => {
    const noisy = Array.from(
      { length: 200 },
      (_, i) => 100 + Math.sin(i / 3) * 10 + Math.cos(i / 7) * 4,
    );
    for (const v of rsi(noisy, 14)) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("roc", () => {
  it("returns the proportional change over the period", () => {
    // 121/100 - 1
    expect(roc([100, 110, 121], 2)[2]).toBeCloseTo(0.21, 10);
  });
});

describe("macd", () => {
  it("aligns the signal line to the MACD line's own warm-up", () => {
    const closes = Array.from({ length: 120 }, (_, i) => 100 + i * 0.5);
    const { macd: line, signal, histogram } = macd(closes);

    // Slow EMA is 26, so nothing before index 25 can exist.
    expect(line[24]).toBeNull();
    expect(line[25]).not.toBeNull();
    // The signal EMA seeds at its own index 8, measured from where the MACD
    // line starts — so 25 + 8 = 33, not 32.
    expect(signal[32]).toBeNull();
    expect(signal[33]).not.toBeNull();
    expect(histogram.at(-1)).toBeCloseTo(line.at(-1)! - signal.at(-1)!, 10);
  });
});

describe("trueRange / atr", () => {
  it("uses the widest of range and both gap measures", () => {
    // Flat closes with a ±1 range: h-l = 2 dominates both gap terms.
    const tr = trueRange(candlesFrom([10, 10, 10, 10]));
    expect(tr[0]).toBeNull();
    expect(tr.slice(1)).toEqual([2, 2, 2]);
  });

  it("catches a gap that high-minus-low would miss", () => {
    // Second bar has a narrow 0.2 range but opens 5 below the prior close.
    const candles: Candle[] = [
      { t: 0, o: 100, h: 100.5, l: 99.5, c: 100, v: 1 },
      { t: 1, o: 95, h: 95.1, l: 94.9, c: 95, v: 1 },
    ];
    // max(0.2, |95.1 - 100|, |94.9 - 100|) = 5.1
    expect(trueRange(candles)[1]).toBeCloseTo(5.1, 10);
  });

  it("converges on the constant true range", () => {
    const out = atr(candlesFrom(new Array(40).fill(10)), 14);
    expect(out.at(-1)).toBeCloseTo(2, 10);
  });
});

describe("realizedVolatility", () => {
  it("is zero for constant compound growth", () => {
    // Identical log returns every bar → no dispersion → no volatility.
    const closes = Array.from({ length: 60 }, (_, i) => 100 * 1.001 ** i);
    expect(realizedVolatility(closes, 20).at(-1)).toBeCloseTo(0, 10);
  });

  it("scales with the square root of periods per year", () => {
    const closes = Array.from(
      { length: 80 },
      (_, i) => 100 * (1 + (i % 2 === 0 ? 0.01 : -0.008)) ** i,
    );
    const daily252 = realizedVolatility(closes, 20, 252).at(-1)!;
    const daily365 = realizedVolatility(closes, 20, 365).at(-1)!;
    expect(daily365 / daily252).toBeCloseTo(Math.sqrt(365 / 252), 10);
  });
});

describe("maxDrawdown", () => {
  it("measures peak to trough, not first to last", () => {
    // Peak 120, trough 90 → 30/120
    expect(maxDrawdown([100, 120, 90, 130])).toBeCloseTo(0.25, 10);
  });

  it("is zero for a series that never falls", () => {
    expect(maxDrawdown([1, 2, 3, 4])).toBe(0);
  });
});

describe("donchian", () => {
  const candles = candlesFrom([1, 2, 3, 4, 5], 0);

  it("includes the current bar by default", () => {
    const out = donchian(candles, 3);
    expect(out[2]).toEqual({ upper: 3, lower: 1, middle: 2 });
    expect(out[4]).toEqual({ upper: 5, lower: 3, middle: 4 });
  });

  it("excludes the current bar for entry rules", () => {
    // Without this the current bar sets the level it is being tested against,
    // and a breakout can never trigger.
    const out = donchian(candles, 3, { excludeCurrent: true });
    expect(out[2]).toBeNull();
    expect(out[3]).toEqual({ upper: 3, lower: 1, middle: 2 });
    expect(out[4]).toEqual({ upper: 4, lower: 2, middle: 3 });
  });
});

describe("bollinger", () => {
  it("centres on the SMA with symmetric bands", () => {
    const closes = [2, 4, 4, 4, 5, 5, 7, 9];
    const out = bollinger(closes, 4, 2);
    const band = out.at(-1)!;
    expect(band.middle).toBeCloseTo((5 + 5 + 7 + 9) / 4, 10);
    expect(band.upper - band.middle).toBeCloseTo(band.middle - band.lower, 10);
  });
});

describe("linearRegression", () => {
  it("recovers an exact linear fit", () => {
    const fit = linearRegression([1, 2, 3, 4, 5])!;
    expect(fit.slope).toBeCloseTo(1, 10);
    expect(fit.intercept).toBeCloseTo(1, 10);
    expect(fit.r2).toBeCloseTo(1, 10);
  });

  it("reports a poor fit for noise around a flat line", () => {
    const fit = linearRegression([5, 1, 6, 2, 5, 1, 6, 2])!;
    expect(fit.r2).toBeLessThan(0.2);
  });

  it("needs at least three points", () => {
    expect(linearRegression([1, 2])).toBeNull();
  });
});

describe("momentumRank", () => {
  it("annualises the log-space slope of a clean exponential", () => {
    // c = 100·e^(0.001i) → log slope 0.001/bar → e^(0.001·252) − 1
    const closes = Array.from({ length: 100 }, (_, i) => 100 * Math.exp(0.001 * i));
    const rank = momentumRank(closes, 90, 252).at(-1)!;

    expect(rank.r2).toBeCloseTo(1, 8);
    expect(rank.annualisedSlope).toBeCloseTo(Math.exp(0.252) - 1, 6);
    expect(rank.score).toBeCloseTo(rank.annualisedSlope, 6);
  });

  it("penalises noise around the same trend — the point of the R² term", () => {
    // Same underlying drift, one clean and one oscillating around it. Holding
    // the slope roughly fixed is what isolates R²: comparing two differently
    // *shaped* paths would confound the two terms, since OLS fits a step
    // function with a steeper slope than the line through its endpoints.
    const steady = Array.from({ length: 90 }, (_, i) => 100 * Math.exp(0.002 * i));
    const noisy = steady.map((c, i) => c * (1 + 0.08 * Math.sin(i)));

    const clean = momentumRank(steady, 90).at(-1)!;
    const rough = momentumRank(noisy, 90).at(-1)!;

    // Drift survives; conviction doesn't.
    expect(rough.annualisedSlope).toBeCloseTo(clean.annualisedSlope, 1);
    expect(rough.r2).toBeLessThan(0.7);
    expect(rough.score).toBeLessThan(clean.score * 0.75);
  });

  it("goes negative for a downtrend", () => {
    const closes = Array.from({ length: 100 }, (_, i) => 100 * Math.exp(-0.001 * i));
    expect(momentumRank(closes, 90).at(-1)!.score).toBeLessThan(0);
  });
});

describe("stats", () => {
  it("computes a sample standard deviation", () => {
    // mean 3, Σ(x−3)² = 10, n−1 = 4 → √2.5
    expect(stdev([1, 2, 3, 4, 5])).toBeCloseTo(Math.sqrt(2.5), 10);
  });

  it("returns null rather than NaN below two observations", () => {
    expect(stdev([1])).toBeNull();
  });

  it("computes a z-score against the sample", () => {
    expect(zScore(5, [1, 2, 3, 4, 5])).toBeCloseTo(2 / Math.sqrt(2.5), 10);
  });

  it("returns null for a z-score with no dispersion", () => {
    expect(zScore(3, [3, 3, 3])).toBeNull();
  });

  it("computes a percentile rank", () => {
    expect(percentileRank(3, [1, 2, 3, 4, 5])).toBeCloseTo(0.6, 10);
  });
});
