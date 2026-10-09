import { beforeAll, describe, expect, it } from "vitest";
import { mockProvider } from "@/lib/market/providers/mock";
import { buildContext, loadUniverse, type Universe } from "./context";
import { OVERLAP_GROUPS, STRATEGIES } from "./strategies";
import type { StrategyId } from "./types";

/**
 * Are the new rules actually saying something new?
 *
 * The phase that added six strategies had one verification requirement above the
 * unit tests: **check the additions are not collinear with the trend book before
 * trusting the ensemble.** The reason is specific to how `assess` works. Weights
 * are each rule's own confidence, and disagreement lowers blended confidence —
 * so two rules that are the same rule twice do not cancel out or announce
 * themselves. They quietly double one opinion's weight and *raise* confidence by
 * manufacturing agreement, which is the failure this codebase describes as fake
 * unanimity and calls the tell of a gimmick.
 *
 * Measured on generated prices, which is exactly right for this question. A
 * random walk has no momentum or reversal structure to find, so any correlation
 * that shows up here is **structural** — a property of how the two rules read a
 * price path, not of an effect they both happened to catch. That makes this a
 * cleaner test of construction than real market data would be.
 *
 * The matrix is printed rather than only asserted, because a number nobody looks
 * at is a number that stops meaning anything.
 */

/**
 * A copy. Not a diversification target.
 *
 * Deliberately not a round number picked to make the current engine pass. It is
 * a *duplication* detector, and it is calibrated on a real duplicate: the first
 * run of this test measured `ts-momentum` against `dual-momentum` at exactly
 * 1.00, because dual momentum's score was the same expression to the character.
 * Anything at 0.98 is that defect again.
 *
 * The engine's genuine diversification problem is not caught by a pairwise
 * threshold at all, and pretending otherwise by choosing a number just under the
 * worst surviving pair would be the lie of arrangement. What is caught instead is
 * `KNOWN_OVERLAP` below — an exact, measured set, so nothing can join it quietly.
 */
const DUPLICATE = 0.98;

/**
 * Pairs that genuinely move together, measured, listed so they cannot grow.
 *
 * All three are transforms of one statistic — the trailing twelve-month return.
 * `ts-momentum` scores it against cash and scales by volatility, `xs-momentum`
 * ranks it against peers, `dual-momentum` gates on the first and scores on the
 * second. Three readings, one number, 0.88–0.94.
 *
 * Since decision 304 the ensemble knows: `OVERLAP_GROUPS` declares the group and
 * its correlation, and `assess` weights the three as about one voice. This list
 * is derived from it, so a pair above the floor that is not declared fails here
 * rather than quietly manufacturing agreement.
 *
 * The first hypothesis for it was wrong and worth recording: that generated
 * prices have no market drift, so "beat cash" and "beat your peers" collapse into
 * one comparison. Measured, the generated equity universe returns +10.9% over
 * twelve months with a 36.6% cross-sectional spread — there is plenty of drift
 * and plenty of dispersion. The overlap is in the rules, not in the data.
 */
const KNOWN_OVERLAP: readonly [StrategyId, StrategyId][] = OVERLAP_GROUPS.flatMap((group) =>
  group.members.flatMap((a, i) =>
    group.members.slice(i + 1).map((b): [StrategyId, StrategyId] => [a, b]),
  ),
);
/** Above this a pair has to be on the list above. */
const OVERLAP_FLOOR = 0.85;

/** The six rules phase 24 added. Each has to earn its seat against the ten before it. */
const ADDED: StrategyId[] = [
  "residual-momentum",
  "week52-high",
  "industry-momentum",
  "short-reversal",
  "bab",
  "currency-momentum",
];

/**
 * The three added after the evidence review (decision 303), each from a theme the
 * engine had nothing in: lottery demand, attention and investment.
 */
const ADDED_LATER: StrategyId[] = ["max-effect", "high-volume", "asset-growth"];

/** A correlation over fewer pairs than this is not worth reporting. */
const MIN_OVERLAP = 20;

function correlation(a: readonly number[], b: readonly number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  const meanA = a.reduce((x, y) => x + y, 0) / n;
  const meanB = b.reduce((x, y) => x + y, 0) / n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i] - meanA) * (b[i] - meanB);
    saa += (a[i] - meanA) ** 2;
    sbb += (b[i] - meanB) ** 2;
  }
  if (saa === 0 || sbb === 0) return null;
  return sab / Math.sqrt(saa * sbb);
}

describe("the strategies are not each other", () => {
  let universe: Universe;
  /** strategyId → symbol → score, for every rule that spoke. */
  const scores = new Map<StrategyId, Map<string, number>>();

  beforeAll(async () => {
    universe = await loadUniverse(mockProvider);

    for (const instrument of universe.instruments) {
      if (instrument.market !== "equity") continue;
      const context = buildContext(universe, instrument.symbol);
      if (!context) continue;

      for (const strategy of STRATEGIES) {
        if (!strategy.appliesTo.includes("equity")) continue;
        if (context.candles.length < strategy.minBars) continue;
        const signal = strategy.evaluate(context);
        if (!signal) continue;
        const row = scores.get(strategy.id) ?? new Map<string, number>();
        row.set(instrument.symbol, signal.score);
        scores.set(strategy.id, row);
      }
    }
  }, 120_000);

  it("every equity rule produced readings to compare", () => {
    const expected = STRATEGIES.filter((s) => s.appliesTo.includes("equity")).map((s) => s.id);
    // Piotroski and the Magic Formula abstain for the 92 international listings
    // (no filed accounts — phase 23), so they are present but thinner.
    for (const id of expected) {
      expect(scores.get(id)?.size ?? 0, `${id} said nothing at all`).toBeGreaterThan(0);
    }
  });

  /** Every pair with enough shared readings to be worth a number, strongest first. */
  function pairs(): { a: StrategyId; b: StrategyId; r: number; n: number }[] {
    const ids = [...scores.keys()];
    const out: { a: StrategyId; b: StrategyId; r: number; n: number }[] = [];

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const left = scores.get(ids[i])!;
        const right = scores.get(ids[j])!;
        const x: number[] = [];
        const y: number[] = [];
        for (const [symbol, value] of left) {
          const other = right.get(symbol);
          if (other === undefined) continue;
          x.push(value);
          y.push(other);
        }
        if (x.length < MIN_OVERLAP) continue;
        const r = correlation(x, y);
        if (r === null) continue;
        out.push({ a: ids[i], b: ids[j], r, n: x.length });
      }
    }
    return out.sort((p, q) => Math.abs(q.r) - Math.abs(p.r));
  }

  it("no rule is a copy of another", () => {
    const ranked = pairs();

    const report = ranked
      .slice(0, 16)
      .map(
        (p) =>
          `  ${p.r >= 0 ? "+" : "−"}${Math.abs(p.r).toFixed(2)}  ${p.a} · ${p.b}  (n=${p.n})`,
      )
      .join("\n");
    console.log(`\nStrongest score correlations across the equity universe:\n${report}\n`);

    expect(
      ranked
        .filter((p) => Math.abs(p.r) >= DUPLICATE)
        .map((p) => `${p.a}/${p.b} = ${p.r.toFixed(2)}`),
      "a rule this close to another is the same rule counted twice, which manufactures agreement",
    ).toEqual([]);
  });

  /**
   * The high-overlap cluster is exactly the one that is documented, and no larger.
   *
   * A bare threshold would let a seventeenth rule quietly join the trend book at
   * 0.9 and nothing would say so. Naming the members means a new one fails.
   */
  it("nothing has joined the known overlap cluster", () => {
    const known = new Set(KNOWN_OVERLAP.map(([a, b]) => [a, b].sort().join("/")));

    const found = pairs()
      .filter((p) => Math.abs(p.r) >= OVERLAP_FLOOR)
      .map((p) => [p.a, p.b].sort().join("/"));

    expect(found.filter((pair) => !known.has(pair))).toEqual([]);
    // And the documented pairs are still there — a list describing overlap that
    // has since been fixed is as misleading as one that is missing an entry.
    expect(new Set(found)).toEqual(known);
  });

  /**
   * The ensemble discounts a group by its declared correlation (decision 304),
   * so the declared number has to be the measured one. A group whose members
   * drift apart would otherwise go on being discounted as if they were one.
   */
  it("each overlap group's declared correlation is the measured one", () => {
    const measured = new Map(pairs().map((p) => [[p.a, p.b].sort().join("/"), p.r]));
    for (const group of OVERLAP_GROUPS) {
      const rs: number[] = [];
      group.members.forEach((a, i) =>
        group.members.slice(i + 1).forEach((b) => rs.push(measured.get([a, b].sort().join("/"))!)),
      );
      const mean = rs.reduce((x, y) => x + y, 0) / rs.length;
      console.log(`\n${group.members.join(" · ")}: declared ${group.correlation}, measured ${mean.toFixed(3)}\n`);
      expect(Math.abs(mean - group.correlation)).toBeLessThan(0.05);
    }
  });

  /**
   * What this phase actually claims about its own work.
   *
   * Six rules were added to an engine the plan described as trend-heavy. Each one
   * has to be doing something the previous ten were not, and "we cited a
   * different paper" is not evidence of that.
   */
  /** Each addition's strongest correlation with any rule outside its own batch. */
  function worstOverlap(batch: readonly StrategyId[]) {
    const added = new Set<StrategyId>(batch);
    const worst = new Map<StrategyId, { against: StrategyId; r: number; n: number }>();

    for (const pair of pairs()) {
      const [addition, existing] = added.has(pair.a) && !added.has(pair.b)
        ? [pair.a, pair.b]
        : added.has(pair.b) && !added.has(pair.a)
          ? [pair.b, pair.a]
          : [null, null];
      if (!addition || !existing) continue;
      const current = worst.get(addition);
      if (!current || Math.abs(pair.r) > Math.abs(current.r)) {
        worst.set(addition, { against: existing, r: pair.r, n: pair.n });
      }
    }
    return worst;
  }

  it("each rule added in phase 24 is distinct from every rule before it", () => {
    const worst = worstOverlap(ADDED);
    const report = [...worst.entries()]
      .map(([id, w]) => `  ${id}: strongest overlap ${w.r.toFixed(2)} against ${w.against}`)
      .join("\n");
    console.log(`\nPhase 24 additions against the existing engine:\n${report}\n`);

    for (const [id, w] of worst) {
      expect(Math.abs(w.r), `${id} is close to ${w.against}`).toBeLessThan(OVERLAP_FLOOR);
    }
  });

  /**
   * The evidence review's additions, against all nineteen others. Every one has
   * to have spoken often enough to be measured, or "distinct" means "silent".
   */
  it("each rule added after the evidence review is distinct from every other rule", () => {
    const worst = worstOverlap(ADDED_LATER);
    const report = [...worst.entries()]
      .map(([id, w]) => `  ${id}: strongest overlap ${w.r.toFixed(2)} against ${w.against} (n=${w.n})`)
      .join("\n");
    console.log(`\nEvidence-review additions against the rest of the engine:\n${report}\n`);

    for (const id of ADDED_LATER) expect(worst.has(id), `${id} was never measured`).toBe(true);
    for (const [id, w] of worst) {
      expect(Math.abs(w.r), `${id} is close to ${w.against}`).toBeLessThan(OVERLAP_FLOOR);
    }
  });

  /**
   * The specific claim phase 24 makes about its own additions, asserted rather
   * than asserted in prose. Short-term reversal exists to be the trend book's
   * opposite number; if it drifted into agreeing with cross-sectional momentum
   * the ensemble would have gained a sixth voice saying the same thing.
   */
  it("short-term reversal opposes cross-sectional momentum rather than echoing it", () => {
    const reversal = scores.get("short-reversal");
    const momentum = scores.get("xs-momentum");
    expect(reversal).toBeDefined();
    expect(momentum).toBeDefined();

    const x: number[] = [];
    const y: number[] = [];
    for (const [symbol, value] of reversal!) {
      const other = momentum!.get(symbol);
      if (other === undefined) continue;
      x.push(value);
      y.push(other);
    }

    const r = correlation(x, y);
    expect(r).not.toBeNull();
    expect(r!, "reversal should not be a momentum rule wearing a different name").toBeLessThan(0.3);
  });

  /**
   * And the one that was genuinely at risk. George and Hwang's whole point is
   * that price-to-52-week-high *dominates* twelve-month return in a joint
   * regression, which only makes sense if the two are related — so a high
   * positive correlation here is expected and correct. What has to be true is
   * that it is not so high the two are interchangeable.
   */
  it("52-week-high proximity is related to momentum without being it", () => {
    const high = scores.get("week52-high")!;
    const momentum = scores.get("xs-momentum")!;
    const x: number[] = [];
    const y: number[] = [];
    for (const [symbol, value] of high) {
      const other = momentum.get(symbol);
      if (other === undefined) continue;
      x.push(value);
      y.push(other);
    }
    const r = correlation(x, y)!;
    expect(Math.abs(r)).toBeLessThan(OVERLAP_FLOOR);
  });
});

/**
 * FX gets its own pass, because fourteen instruments is not a cross-section you
 * can rank rules over the same way.
 *
 * One question matters here and the paper states it as a finding rather than an
 * assumption: currency momentum and carry are **separate premia**, not one
 * measured twice. If they were the same thing on ember's fourteen pairs, adding
 * the second would have doubled carry's weight on a market where it is already
 * one of only four voices.
 */
describe("the FX pair that had to be checked", () => {
  it("currency momentum is not carry restated", async () => {
    const universe = await loadUniverse(mockProvider);

    const momentum: number[] = [];
    const carry: number[] = [];

    for (const instrument of universe.instruments) {
      if (instrument.market !== "fx") continue;
      const context = buildContext(universe, instrument.symbol);
      if (!context) continue;

      const a = STRATEGIES.find((s) => s.id === "currency-momentum")!.evaluate(context);
      const b = STRATEGIES.find((s) => s.id === "fx-carry")!.evaluate(context);
      if (!a || !b) continue;
      momentum.push(a.score);
      carry.push(b.score);
    }

    expect(momentum.length, "no FX pair produced both readings").toBeGreaterThanOrEqual(10);

    const r = correlation(momentum, carry)!;
    console.log(
      `\ncurrency-momentum · fx-carry: ${r >= 0 ? "+" : "−"}${Math.abs(r).toFixed(2)} (n=${momentum.length})\n`,
    );
    expect(Math.abs(r)).toBeLessThan(OVERLAP_FLOOR);
  }, 120_000);
});
