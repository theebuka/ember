import { describe, expect, it } from "vitest";
import { getProvider } from "@/lib/market/providers";
import { loadUniverse } from "@/lib/signals/context";
import { runBacktest } from "@/lib/signals/backtest";

/**
 * Invariants of the walk-forward run.
 *
 * The track record is the product's credibility, so the properties that make
 * it honest are asserted rather than assumed. These run the real engine over
 * the real universe — a few hundred milliseconds, and worth it.
 */

const universe = await loadUniverse(getProvider(), Date.now());
const result = runBacktest({ universe, riskProfile: "balanced" });

describe("runBacktest", () => {
  it("produces calls to measure", () => {
    expect(result.calls).toBeGreaterThan(20);
    expect(result.trades).toHaveLength(result.calls);
  });

  it("advances through time along the equity curve", () => {
    // The curve is compounded in the order P&L was realised, so it must be
    // sorted by exit. It previously followed `trades` — which is ordered by
    // *entry* — and because positions in different instruments overlap, the
    // x-axis ran backwards in places. Final equity was unaffected
    // (multiplication commutes) but `maxDrawdown` is measured from the path,
    // so it was reporting the drawdown of an arbitrary ordering.
    for (let i = 1; i < result.equityCurve.length; i++) {
      expect(result.equityCurve[i].t).toBeGreaterThanOrEqual(
        result.equityCurve[i - 1].t,
      );
    }
  });

  it("compounds every trade at the size the engine suggested", () => {
    const expected = [...result.trades]
      .sort((a, b) => a.exitAt - b.exitAt)
      .reduce((equity, t) => equity * (1 + t.return * t.weight), 1);

    expect(result.equityCurve.at(-1)?.value).toBeCloseTo(expected, 10);
  });

  it("reports a drawdown consistent with the curve it drew", () => {
    let peak = -Infinity;
    let worst = 0;
    for (const point of result.equityCurve) {
      peak = Math.max(peak, point.value);
      worst = Math.max(worst, (peak - point.value) / peak);
    }
    expect(result.maxDrawdown).toBeCloseTo(worst, 6);
  });

  it("never exits before it enters", () => {
    for (const trade of result.trades) {
      expect(trade.exitAt).toBeGreaterThan(trade.entryAt);
      expect(trade.holdBars).toBeGreaterThan(0);
    }
  });

  it("holds one position per instrument at a time", () => {
    // Overlapping entries in the same symbol would count one trend several
    // times, and the hit rate would measure trend persistence rather than
    // whether the engine was right.
    const bySymbol = new Map<string, { entryAt: number; exitAt: number }[]>();
    for (const t of result.trades) {
      const list = bySymbol.get(t.symbol) ?? [];
      list.push({ entryAt: t.entryAt, exitAt: t.exitAt });
      bySymbol.set(t.symbol, list);
    }

    for (const [symbol, spans] of bySymbol) {
      spans.sort((a, b) => a.entryAt - b.entryAt);
      for (let i = 1; i < spans.length; i++) {
        expect(
          spans[i].entryAt,
          `${symbol} re-entered before the previous position closed`,
        ).toBeGreaterThan(spans[i - 1].exitAt);
      }
    }
  });

  it("keeps every position inside the risk profile's cap", () => {
    for (const trade of result.trades) {
      expect(trade.weight).toBeGreaterThan(0);
      expect(trade.weight).toBeLessThanOrEqual(0.15 + 1e-9);
    }
  });

  it("leads with the caveat that the data has no structure to find", () => {
    // The most important sentence on the page, and the one every app in this
    // category leaves out. Its position is load-bearing.
    expect(result.caveats[0]).toContain("random walk");
    expect(result.caveats[0]).toContain("near chance");
  });

  it("credits each call to the rules that drove it", () => {
    const credited = result.byStrategy.reduce((acc, r) => acc + r.calls, 0);
    // Multi-driver calls are credited to every driver, so the total exceeds
    // the number of calls. It must never be fewer.
    expect(credited).toBeGreaterThanOrEqual(result.calls);
  });
});
