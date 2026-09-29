import { describe, expect, it } from "vitest";
import { INSTRUMENT_BY_SYMBOL } from "@/lib/market/universe";
import { candlesAsOf, dailyCandles, intradayCandles } from "./series";

/**
 * The generator's calendar behaviour, swept across every hour of a week.
 *
 * These are time-of-day bugs, which is the worst kind to leave to chance: the
 * suite passes all afternoon and fails at one in the morning. Sweeping fixed
 * timestamps makes the coverage deterministic instead of depending on when the
 * tests happen to run.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** A Monday, so a full-week sweep starts on a known weekday. */
const MONDAY = Date.UTC(2026, 7, 10);

const SYMBOLS = ["AAPL", "BTC", "EURUSD"] as const;

describe("mock series calendar", () => {
  it("starts the sweep on a Monday", () => {
    expect(new Date(MONDAY).getUTCDay()).toBe(1);
  });

  for (const symbol of SYMBOLS) {
    const spec = INSTRUMENT_BY_SYMBOL.get(symbol)!;

    it(`${symbol}: bars stay strictly ordered at every hour of the week`, () => {
      for (let hour = 0; hour < 7 * 24; hour++) {
        const at = MONDAY + hour * HOUR;
        const candles = candlesAsOf(spec, at);

        for (let i = 1; i < candles.length; i++) {
          // A duplicate timestamp is the failure this guards: the New York
          // session runs in Eastern time while the daily grid is built in UTC,
          // so between 00:00 UTC and the next open an equity session that the
          // grid has already closed out used to be reported as still live —
          // stamping a second bar on a date that already had one.
          expect(
            candles[i].t,
            `${symbol} at hour ${hour}: bar ${i} is not after bar ${i - 1}`,
          ).toBeGreaterThan(candles[i - 1].t);
        }
      }
    });

    it(`${symbol}: a live bar is never dated before the completed history`, () => {
      for (let hour = 0; hour < 7 * 24; hour++) {
        const at = MONDAY + hour * HOUR;
        const completed = dailyCandles(spec, at);
        const all = candlesAsOf(spec, at);
        if (all.length === completed.length) continue;

        expect(all[all.length - 1].t).toBeGreaterThan(completed[completed.length - 1].t);
      }
    });
  }

  it("keeps intraday bars inside the session they belong to", () => {
    const spec = INSTRUMENT_BY_SYMBOL.get("AAPL")!;

    for (let hour = 0; hour < 7 * 24; hour++) {
      const at = MONDAY + hour * HOUR;
      const bars = intradayCandles(spec, at);
      if (bars.length === 0) continue;

      // 390 minutes at five-minute bars. Running past the close would draw a
      // chart with an hour of trading that never happened.
      expect(bars.length).toBeLessThanOrEqual(78);
      expect(bars[bars.length - 1].t - bars[0].t).toBeLessThan(390 * 60_000);
    }
  });

  it("prices freeze at the close rather than drifting after it", () => {
    const spec = INSTRUMENT_BY_SYMBOL.get("AAPL")!;
    // 16:30 and 18:30 New York, both after the 16:00 bell, on the same UTC day.
    const closeish = MONDAY + 20 * HOUR + 30 * 60_000;
    const later = MONDAY + 22 * HOUR + 30 * 60_000;

    const a = candlesAsOf(spec, closeish);
    const b = candlesAsOf(spec, later);

    expect(a[a.length - 1].t).toBe(b[b.length - 1].t);
    expect(a[a.length - 1].c).toBeCloseTo(b[b.length - 1].c, 10);
  });

  it("gives crypto a live bar on a Sunday and equities none", () => {
    const sunday = MONDAY - DAY + 12 * HOUR;

    const btc = INSTRUMENT_BY_SYMBOL.get("BTC")!;
    const aapl = INSTRUMENT_BY_SYMBOL.get("AAPL")!;

    expect(candlesAsOf(btc, sunday).length).toBe(dailyCandles(btc, sunday).length + 1);
    expect(candlesAsOf(aapl, sunday).length).toBe(dailyCandles(aapl, sunday).length);
  });
});
