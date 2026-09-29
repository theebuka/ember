import { describe, expect, it } from "vitest";
import type { Candle, Instrument, MarketKind } from "@/lib/api/types";
import { POLICY_RATES } from "@/lib/market/universe";
import {
  crossSectionOf,
  indexAsOf,
  utcDay,
  type CrossSectionSource,
} from "../cross-section";
import { buildContext, type Universe } from "../context";
import type { PeerSeries, StrategyContext } from "../types";
import {
  bab,
  currencyMomentum,
  industryMomentum,
  residualMomentum,
  shortReversal,
  week52High,
} from "./index";

/**
 * The six rules added in phase 24, against fixtures with a known answer.
 *
 * Deliberately not against the generated universe. A test that reads what
 * `week52-high` says about Apple today passes for whatever reason the generator
 * happened to produce and breaks the same way — `collinearity.test.ts` is where
 * real output is measured, and it measures a property (are these rules distinct)
 * rather than a value. Here every price path is constructed so that the correct
 * answer is arithmetic.
 */

const DAY = 86_400_000;
/** All fixtures end on the same UTC day, so date alignment is testable. */
const END_DAY = Math.floor(Date.UTC(2026, 7, 14) / DAY);
/** Clears the longest window any of these rules reads (253) with room over. */
const BARS = 320;

/** A deterministic generator — a seeded fixture is a fixture you can argue about. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Box–Muller, so the fixtures have realistic-shaped noise rather than uniform. */
function normals(seed: number, count: number): number[] {
  const next = random(seed);
  const out: number[] = [];
  while (out.length < count) {
    const u = Math.max(next(), 1e-9);
    const v = next();
    const r = Math.sqrt(-2 * Math.log(u));
    out.push(r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v));
  }
  return out.slice(0, count);
}

function pathOf(returns: readonly number[], start = 100): number[] {
  const closes = [start];
  for (const r of returns) closes.push(closes[closes.length - 1] * (1 + r));
  return closes;
}

/**
 * Bars on consecutive UTC days, the last landing on `endDay`.
 *
 * `o = h = l = c`, which is not a simplification invented for the test — it is
 * exactly the shape the live provider produces for FX and for crypto beyond
 * thirty days, where the upstream serves a close and nothing else.
 */
function barsOf(closes: readonly number[], endDay = END_DAY): Candle[] {
  return closes.map((c, i) => ({
    t: (endDay - (closes.length - 1 - i)) * DAY,
    o: c,
    h: c,
    l: c,
    c,
    v: 1_000,
  }));
}

interface Row {
  symbol: string;
  closes: number[];
  sector?: string;
  market?: MarketKind;
  /** FX only — annualised interest differential, base less quote. */
  carry?: number;
}

function sourceOf(rows: readonly Row[]): CrossSectionSource {
  return {
    instruments: rows.map(
      (row): Instrument => ({
        symbol: row.symbol,
        name: row.symbol,
        market: row.market ?? "equity",
        currency: "USD",
        precision: 2,
        sector: row.sector,
      }),
    ),
    candles: new Map(rows.map((row) => [row.symbol, barsOf(row.closes)])),
  };
}

/** A context for one row of a fixture, with the shared cross-section attached. */
function contextFor(rows: readonly Row[], symbol: string): StrategyContext {
  const source = sourceOf(rows);
  const instrument = source.instruments.find((i) => i.symbol === symbol)!;
  const subject = rows.find((r) => r.symbol === symbol)!;

  const peers: PeerSeries[] = rows
    .filter((row) => (row.market ?? "equity") === instrument.market)
    .map((row) => ({
      symbol: row.symbol,
      market: row.market ?? "equity",
      candles: source.candles.get(row.symbol)!,
      sector: row.sector,
      carry: row.carry,
    }));

  return {
    instrument,
    candles: source.candles.get(symbol)!,
    peers,
    crossSection: crossSectionOf(source, instrument.market, END_DAY),
    fx:
      instrument.market === "fx"
        ? { baseRate: subject.carry ?? 0, quoteRate: 0 }
        : undefined,
    riskFreeRate: 0.043,
    periodsPerYear: instrument.market === "crypto" ? 365 : 252,
    now: END_DAY * DAY,
  };
}

/** A market path plus `count` names whose returns are `beta × market + noise`. */
function betaCohort(
  market: readonly number[],
  cohort: readonly { symbol: string; beta: number; sector?: string }[],
  seed = 11,
): Row[] {
  return cohort.map((member, index) => {
    const noise = normals(seed + index * 97, market.length);
    const returns = market.map(
      (m, i) => member.beta * m + noise[i] * 0.004,
    );
    return { symbol: member.symbol, sector: member.sector, closes: pathOf(returns) };
  });
}

/* ── The alignment this phase had to fix first ──────────────────────────── */

describe("peers are read by date, not by array index", () => {
  it("indexAsOf lands on the last bar at or before a day", () => {
    const candles = barsOf([1, 2, 3, 4, 5]);
    expect(indexAsOf(candles, END_DAY)).toBe(4);
    expect(indexAsOf(candles, END_DAY - 2)).toBe(2);
    // A day before the series starts has no bar, which is distinct from index 0.
    expect(indexAsOf(candles, END_DAY - 99)).toBe(-1);
    // A day after the series ends resolves to its last bar — a venue on holiday
    // contributes its most recent session, which is what a real ranking uses.
    expect(indexAsOf(candles, END_DAY + 30)).toBe(4);
  });

  /**
   * The bug in one assertion.
   *
   * Two listings ending on the same day with different bar counts is the normal
   * case since phase 23 — Yahoo returns 1,214 bars for one international name and
   * 1,280 for another. `long` spends 299 bars flat and then rises 50%; a
   * cross-section that read it at the *short* series' index would land in the flat
   * stretch and report no recent move at all.
   */
  it("a longer peer is measured to today, not to its own index-319", () => {
    const flat = new Array(260).fill(100);
    const long = [...new Array(299).fill(100), ...pathOf(new Array(20).fill(0.0206), 100)];

    const section = crossSectionOf(
      sourceOf([
        { symbol: "SHORT", closes: flat },
        { symbol: "LONG", closes: long },
      ]),
      "equity",
      END_DAY,
    );

    expect(section.rows.get("SHORT")!.reversal21).toBeCloseTo(0, 5);
    expect(section.rows.get("LONG")!.reversal21).toBeGreaterThan(0.4);
  });

  it("buildContext gives every peer the same last trading day as the subject", () => {
    // Real symbols, because `buildContext` resolves specs from the universe.
    const apple = barsOf(new Array(260).fill(100));
    const microsoft = barsOf(new Array(320).fill(100));

    const universe: Universe = {
      at: END_DAY * DAY,
      instruments: [
        { symbol: "AAPL", name: "Apple", market: "equity", currency: "USD", precision: 2 },
        { symbol: "MSFT", name: "Microsoft", market: "equity", currency: "USD", precision: 2 },
      ],
      candles: new Map([
        ["AAPL", apple],
        ["MSFT", microsoft],
      ]),
      fundamentals: new Map(),
      onchain: new Map(),
      policyRates: POLICY_RATES,
      events: [],
      pending: [],
    };

    const context = buildContext(universe, "AAPL")!;
    const subjectDay = utcDay(context.candles[context.candles.length - 1].t);

    for (const peer of context.peers) {
      const last = peer.candles[peer.candles.length - 1];
      expect(utcDay(last.t), `${peer.symbol} was cut at the wrong bar`).toBe(subjectDay);
    }

    /**
     * And the snapshot is attached, stated directly rather than inferred.
     *
     * Eight of the thirteen equity rules now read `crossSection` and return null
     * without it, so a refactor that dropped this line would silently mute most of
     * the engine — the same shape of defect as the `exchange` field three of four
     * `Instrument` literals quietly lost in phase 23. Nothing throws; the feature
     * just stops happening.
     */
    expect(context.crossSection).toBeDefined();
    expect(context.crossSection!.market).toBe("equity");
    expect(context.crossSection!.asOfDay).toBe(subjectDay);
    expect([...context.crossSection!.rows.keys()].sort()).toEqual(["AAPL", "MSFT"]);
  });
});

/* ── Betting against beta ──────────────────────────────────────────────── */

describe("betting against beta", () => {
  const market = normals(3, BARS).map((z) => z * 0.01);
  const rows = betaCohort(market, [
    { symbol: "DEFENSIVE", beta: 0.3 },
    { symbol: "RACY", beta: 2.2 },
    ...Array.from({ length: 10 }, (_, i) => ({ symbol: `MID${i}`, beta: 1 })),
  ]);

  it("prefers the low-beta name and dislikes the high-beta one", () => {
    const low = bab.evaluate(contextFor(rows, "DEFENSIVE"))!;
    const high = bab.evaluate(contextFor(rows, "RACY"))!;

    expect(low.score).toBeGreaterThan(0);
    expect(high.score).toBeLessThan(0);
    expect(low.score).toBeGreaterThan(high.score);
  });

  it("recovers the betas it was given", () => {
    const section = contextFor(rows, "DEFENSIVE").crossSection!;
    // Shrunk 0.6/0.4 toward one, per the paper — so 0.3 reads near 0.58 and 2.2
    // near 1.72. The shrinkage is the reason these are not the input values.
    expect(section.rows.get("DEFENSIVE")!.beta!).toBeLessThan(0.75);
    expect(section.rows.get("RACY")!.beta!).toBeGreaterThan(1.5);
    expect(section.rows.get("MID0")!.beta!).toBeCloseTo(1, 1);
  });

  /**
   * The guard against ranking on noise. A name the market does not explain has a
   * beta that is mostly estimation error, and a cross-sectional rule that ranks
   * on it confidently is manufacturing conviction out of nothing.
   */
  it("is far less confident about a name the market barely explains", () => {
    const noise = normals(555, BARS).map((z) => z * 0.05);
    const withStranger = [...rows, { symbol: "STRANGER", closes: pathOf(noise) }];

    const stranger = bab.evaluate(contextFor(withStranger, "STRANGER"))!;
    const explained = bab.evaluate(contextFor(withStranger, "DEFENSIVE"))!;
    expect(stranger.confidence).toBeLessThan(explained.confidence);
  });

  it("says nothing when there are too few names to rank against", () => {
    const thin = betaCohort(market, [
      { symbol: "A", beta: 0.5 },
      { symbol: "B", beta: 1.5 },
    ]);
    expect(bab.evaluate(contextFor(thin, "A"))).toBeNull();
  });

  it("never claims more conviction than a risk premium has earned", () => {
    for (const symbol of ["DEFENSIVE", "RACY", "MID3"]) {
      const signal = bab.evaluate(contextFor(rows, symbol));
      expect(signal!.confidence).toBeLessThanOrEqual(0.5);
    }
  });
});

/* ── Residual momentum ─────────────────────────────────────────────────── */

describe("residual momentum", () => {
  /** A market that rose over the window, so a high-beta name has a real return. */
  const market = normals(7, BARS).map((z) => z * 0.008 + 0.0009);

  /**
   * Drift over the measurement window only.
   *
   * A drift applied to the *whole* fixture is absorbed by the regression's
   * intercept and scores zero — correctly, because the measure detects a change
   * in drift rather than a level of it (see `residualMomentumOf`). Getting this
   * wrong is how the first version of this test came to assert the opposite of
   * what the published construction does.
   */
  const MEASURED = 252;
  /**
   * What "no residual momentum" is allowed to measure.
   *
   * `residualT` is a t-statistic by construction, so a name whose return is fully
   * explained by its market does not read 0.000 — it draws from roughly a standard
   * normal. Asserting a tighter bound than this would be asserting that noise is
   * absent, which is a test that fails for being right. One standard error is the
   * meaningful statement of "nothing here".
   */
  const NO_SIGNAL = 1;

  function member(beta: number, drift: number, seed: number): number[] {
    const noise = normals(seed, BARS);
    return pathOf(
      market.map(
        (m, i) => beta * m + noise[i] * 0.004 + (i >= BARS - MEASURED ? drift : 0),
      ),
    );
  }

  /**
   * The property that makes this a different rule rather than a second copy of
   * `xs-momentum`: two names with similar raw returns, one of which got there by
   * being high-beta in a rising market and one by pulling away from it.
   */
  it("credits drift the market cannot explain, and ignores a levered ride", () => {
    const rows: Row[] = [
      { symbol: "LEVERED", closes: member(2.4, 0, 23) },
      { symbol: "INDEPENDENT", closes: member(0.5, 0.004, 41) },
      ...Array.from({ length: 10 }, (_, i) => ({
        symbol: `MID${i}`,
        closes: member(1, 0, 101 + i * 7),
      })),
    ];

    const totalReturn = (symbol: string) => {
      const closes = rows.find((r) => r.symbol === symbol)!.closes;
      return closes[closes.length - 1] / closes[0] - 1;
    };
    // The fixture only means anything if raw twelve-month return cannot separate
    // them — that is the whole comparison being made.
    expect(totalReturn("LEVERED")).toBeGreaterThan(0.2);
    expect(totalReturn("INDEPENDENT")).toBeGreaterThan(0.2);

    const rows_ = contextFor(rows, "LEVERED").crossSection!.rows;
    // Everything the levered name did is explained by its beta, so there is no
    // residual to report — a raw-return ranking would have called it a winner.
    expect(Math.abs(rows_.get("LEVERED")!.residualT!)).toBeLessThan(NO_SIGNAL);
    expect(rows_.get("INDEPENDENT")!.residualT!).toBeGreaterThan(2);

    const levered = residualMomentum.evaluate(contextFor(rows, "LEVERED"))!;
    const independent = residualMomentum.evaluate(contextFor(rows, "INDEPENDENT"))!;
    expect(independent.score).toBeGreaterThan(levered.score);
    expect(independent.confidence).toBeGreaterThan(levered.confidence);
  });

  /**
   * The property the paper is explicit about and which is easy to leave out: a
   * steady long-run alpha is not momentum. Asserting it stops someone "fixing"
   * the estimator later by dropping the intercept.
   */
  it("scores a constant out-performance at zero, not at its size", () => {
    const rows: Row[] = [
      { symbol: "STEADY", closes: pathOf(market.map((m, i) => m + 0.0018 + normals(5, BARS)[i] * 0.004)) },
      ...Array.from({ length: 10 }, (_, i) => ({
        symbol: `MID${i}`,
        closes: member(1, 0, 202 + i * 3),
      })),
    ];
    const row = contextFor(rows, "STEADY").crossSection!.rows.get("STEADY")!;
    expect(row.momentum12_1!).toBeGreaterThan(0.2);
    expect(Math.abs(row.residualT!)).toBeLessThan(NO_SIGNAL);
  });

  /**
   * Scaling by residual volatility is half of the published effect, not a
   * normalisation detail: a name whose residuals are enormous has demonstrated
   * nothing by drifting up inside them.
   */
  it("is a t-statistic, so identical drift inside more noise counts for less", () => {
    const others: Row[] = Array.from({ length: 10 }, (_, i) => ({
      symbol: `MID${i}`,
      closes: member(1, 0, 303 + i * 5),
    }));
    const noiseOf = (scale: number) =>
      pathOf(
        market.map(
          (m, i) =>
            m + (i >= BARS - MEASURED ? 0.0012 : 0) + normals(999, BARS)[i] * scale,
        ),
      );

    const calm = contextFor([{ symbol: "X", closes: noiseOf(0.004) }, ...others], "X");
    const wild = contextFor([{ symbol: "X", closes: noiseOf(0.05) }, ...others], "X");

    expect(Math.abs(wild.crossSection!.rows.get("X")!.residualT!)).toBeLessThan(
      Math.abs(calm.crossSection!.rows.get("X")!.residualT!),
    );
  });
});

/* ── 52-week high ──────────────────────────────────────────────────────── */

describe("52-week high proximity", () => {
  /** Rises to 200 over the year, then optionally gives some back. */
  function withGiveback(giveback: number): number[] {
    const up = pathOf(new Array(BARS - 41).fill(0.0022));
    const peak = up[up.length - 1];
    const down = pathOf(new Array(40).fill(-giveback), peak);
    return [...up, ...down.slice(1)];
  }

  const rows: Row[] = [
    { symbol: "ATHIGH", closes: withGiveback(0) },
    { symbol: "PULLBACK", closes: withGiveback(0.008) },
    ...Array.from({ length: 10 }, (_, i) => ({
      symbol: `MID${i}`,
      closes: withGiveback(0.002 + i * 0.0004),
    })),
  ];

  it("ranks a name at its high above one that gave a third back", () => {
    const high = week52High.evaluate(contextFor(rows, "ATHIGH"))!;
    const pulled = week52High.evaluate(contextFor(rows, "PULLBACK"))!;
    expect(high.score).toBeGreaterThan(pulled.score);
    expect(high.score).toBeGreaterThan(0);
    expect(pulled.score).toBeLessThan(0);
  });

  /**
   * The case that makes this rule non-redundant, spelled out: both names have
   * risen a great deal over the year, so a twelve-month return ranking cannot
   * separate them. The distance from the high can.
   */
  it("separates two names a twelve-month return would call the same", () => {
    const section = contextFor(rows, "ATHIGH").crossSection!;
    const a = section.rows.get("ATHIGH")!;
    const b = section.rows.get("PULLBACK")!;
    expect(a.momentum12_1!).toBeGreaterThan(0.3);
    expect(b.momentum12_1!).toBeGreaterThan(0.3);
    expect(a.highProximity!).toBeGreaterThan(0.99);
    expect(b.highProximity!).toBeLessThan(0.8);
  });

  it("reads the highest high, not the highest close", () => {
    const spike = new Array(BARS).fill(100);
    const candles = barsOf(spike).map((bar, i) =>
      i === BARS - 100 ? { ...bar, h: 200 } : bar,
    );
    const section = crossSectionOf(
      {
        instruments: [
          { symbol: "SPIKE", name: "s", market: "equity", currency: "USD", precision: 2 },
        ],
        candles: new Map([["SPIKE", candles]]),
      },
      "equity",
      END_DAY,
    );
    expect(section.rows.get("SPIKE")!.highProximity).toBeCloseTo(0.5, 5);
  });
});

/* ── Short-term reversal ───────────────────────────────────────────────── */

describe("short-term reversal", () => {
  function withLastMonth(monthly: number): number[] {
    const flat = new Array(BARS - 21).fill(100);
    return [...flat, ...pathOf(new Array(21).fill(monthly), 100).slice(1)];
  }

  const rows: Row[] = [
    { symbol: "SLUMPED", closes: withLastMonth(-0.006) },
    { symbol: "SPIKED", closes: withLastMonth(0.006) },
    ...Array.from({ length: 10 }, (_, i) => ({
      symbol: `MID${i}`,
      closes: withLastMonth(-0.002 + i * 0.0004),
    })),
  ];

  it("buys the month's loser and sells the month's winner", () => {
    const loser = shortReversal.evaluate(contextFor(rows, "SLUMPED"))!;
    const winner = shortReversal.evaluate(contextFor(rows, "SPIKED"))!;
    expect(loser.score).toBeGreaterThan(0);
    expect(winner.score).toBeLessThan(0);
  });

  /**
   * The transaction-cost cap, asserted. This rule's published edge lives largely
   * inside the bid-ask spread, and ember models no spread — so it must not be
   * able to speak as loudly as a rule whose edge does not.
   */
  it("cannot exceed the confidence a cost-sensitive rule is allowed", () => {
    for (const row of rows) {
      const signal = shortReversal.evaluate(contextFor(rows, row.symbol));
      expect(signal!.confidence).toBeLessThanOrEqual(0.45);
    }
  });

  it("produces the tightest window of the additions", () => {
    const signal = shortReversal.evaluate(contextFor(rows, "SLUMPED"))!;
    expect(signal.halfLifeDays).toBeLessThan(bab.evaluate(contextFor(rows, "SLUMPED"))!.halfLifeDays);
    expect(signal.horizonDays).toBeLessThanOrEqual(21);
  });
});

/* ── Industry momentum ─────────────────────────────────────────────────── */

describe("industry momentum", () => {
  const SECTORS = ["Technology", "Financials", "Energy", "Utilities", "Materials"];

  /** Five sectors of four names each, the first sector strongest. */
  const rows: Row[] = SECTORS.flatMap((sector, s) =>
    Array.from({ length: 4 }, (_, n) => ({
      symbol: `${sector.slice(0, 3).toUpperCase()}${n}`,
      sector,
      closes: pathOf(
        normals(400 + s * 13 + n, BARS).map((z) => z * 0.006 + (0.0016 - s * 0.0008)),
      ),
    })),
  );

  it("scores the sector, so every name in it reads the same", () => {
    const first = industryMomentum.evaluate(contextFor(rows, "TEC0"))!;
    const second = industryMomentum.evaluate(contextFor(rows, "TEC3"))!;
    expect(second.score).toBe(first.score);
    expect(second.rationale).toBe(first.rationale);
  });

  it("prefers a name in the leading sector to one in the lagging sector", () => {
    const leading = industryMomentum.evaluate(contextFor(rows, "TEC0"))!;
    const lagging = industryMomentum.evaluate(contextFor(rows, "MAT0"))!;
    expect(leading.score).toBeGreaterThan(0);
    expect(lagging.score).toBeLessThan(0);
  });

  it("names the sector and its size in the sentence", () => {
    const signal = industryMomentum.evaluate(contextFor(rows, "TEC0"))!;
    expect(signal.rationale).toContain("Technology");
    expect(signal.rationale).toContain("1st of 5 sectors");
    expect(signal.rationale).toContain("4 names");
  });

  /** The mean of three companies is not an industry. */
  it("ignores a sector below the membership floor", () => {
    const withTiny = [
      ...rows,
      { symbol: "TINY0", sector: "Real estate", closes: pathOf(new Array(BARS).fill(0.004)) },
      { symbol: "TINY1", sector: "Real estate", closes: pathOf(new Array(BARS).fill(0.004)) },
    ];
    const section = contextFor(withTiny, "TINY0").crossSection!;
    expect(section.sectors.map((s) => s.sector)).not.toContain("Real estate");
    expect(industryMomentum.evaluate(contextFor(withTiny, "TINY0"))).toBeNull();
  });

  it("says nothing when there are too few sectors to rank", () => {
    const twoSectors = rows.filter((r) => r.sector === "Technology" || r.sector === "Financials");
    expect(industryMomentum.evaluate(contextFor(twoSectors, "TEC0"))).toBeNull();
  });

  it("stays a preference rather than a call", () => {
    const signal = industryMomentum.evaluate(contextFor(rows, "TEC0"))!;
    expect(signal.confidence).toBeLessThanOrEqual(0.5);
  });
});

/* ── Currency momentum ─────────────────────────────────────────────────── */

describe("currency momentum", () => {
  const flat = new Array(BARS).fill(1.1);

  /** Every pair's spot is flat, so only the carry term can separate them. */
  const rows: Row[] = [
    { symbol: "AAABBB", market: "fx", closes: flat, carry: 0.06 },
    { symbol: "CCCDDD", market: "fx", closes: flat, carry: -0.04 },
    ...Array.from({ length: 8 }, (_, i) => ({
      symbol: `E${i}EFFF`,
      market: "fx" as MarketKind,
      closes: flat,
      carry: 0.01 * (i - 4) * 0.25,
    })),
  ];

  /**
   * The reason this rule exists. Every price-only rule in the engine reads a
   * flat spot as no signal; a holder of a pair paying six percent made six
   * percent.
   */
  it("separates pairs whose spot did nothing, on carry alone", () => {
    const paying = currencyMomentum.evaluate(contextFor(rows, "AAABBB"))!;
    const costing = currencyMomentum.evaluate(contextFor(rows, "CCCDDD"))!;
    expect(paying.score).toBeGreaterThan(0);
    expect(costing.score).toBeLessThan(0);
  });

  it("reports the carry portion of the return in its sentence", () => {
    const signal = currencyMomentum.evaluate(contextFor(rows, "AAABBB"))!;
    // Three months of a 6% differential is 1.5%.
    expect(signal.rationale).toContain("1.5% of it carry");
    expect(signal.rationale).toContain("AAA against BBB");
  });

  it("adds spot and carry rather than choosing one", () => {
    // Spot falls 2% over the quarter while the pair pays 6% a year — a loss on
    // price and a gain to the holder.
    const falling = [...new Array(BARS - 63).fill(1.1), ...pathOf(new Array(63).fill(-0.00032), 1.1).slice(1)];
    const mixed = rows.map((row) =>
      row.symbol === "AAABBB" ? { ...row, closes: falling } : row,
    );
    const signal = currencyMomentum.evaluate(contextFor(mixed, "AAABBB"))!;
    expect(signal.rationale).toMatch(/returned −0\.[0-9]% over three months/);
  });

  it("says nothing with too few pairs to rank", () => {
    const thin = rows.slice(0, 3);
    expect(currencyMomentum.evaluate(contextFor(thin, "AAABBB"))).toBeNull();
  });
});
