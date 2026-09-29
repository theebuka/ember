import { describe, expect, it } from "vitest";
import type { Candle, Instrument, Quote, Transaction } from "@/lib/api/types";
import { convert, derivePortfolio, portfolioValueSeries, type Rates } from "./derive";

/**
 * Portfolio maths, checked against figures worked out by hand.
 *
 * This is the file that decides whether the number at the top of the home
 * screen is right, so the expectations here are arithmetic done on paper
 * rather than whatever the implementation happened to return.
 */

const AAPL: Instrument = {
  symbol: "AAPL",
  name: "Apple",
  market: "equity",
  currency: "USD",
  precision: 2,
};

const USDJPY: Instrument = {
  symbol: "USDJPY",
  name: "US dollar / Japanese yen",
  market: "fx",
  currency: "JPY",
  precision: 2,
};

const BTC: Instrument = {
  symbol: "BTC",
  name: "Bitcoin",
  market: "crypto",
  currency: "USD",
  precision: 0,
};

// Round numbers rather than plausible ones: every expectation below is a hand
// calculation, and a rate of 1.0942 turns each of them into a tolerance.
const RATES: Rates = {
  USD: 1,
  EUR: 1.1,
  GBP: 1.25,
  JPY: 0.008,
  NGN: 0.000625,
  CHF: 1.15,
  AUD: 0.65,
  CAD: 0.72,
  NZD: 0.6,
  // The quote currencies of the international listings. Nothing below trades
  // in them; they are here because `Rates` is exhaustive over `Currency`.
  ZAR: 0.05,
  EGP: 0.02,
  HKD: 0.128,
  KRW: 0.0007,
  INR: 0.0114,
  SGD: 0.775,
  TWD: 0.0314,
};

function quote(symbol: string, price: number, previousClose = price): Quote {
  return {
    symbol,
    price,
    change: price - previousClose,
    changePct: previousClose === 0 ? 0 : (price - previousClose) / previousClose,
    previousClose,
    dayHigh: Math.max(price, previousClose),
    dayLow: Math.min(price, previousClose),
    at: 0,
  };
}

function tx(t: Omit<Transaction, "id"> & { id?: string }): Transaction {
  return { id: t.id ?? `${t.symbol}-${t.date}-${t.side}`, ...t };
}

describe("convert", () => {
  it("is the identity within one currency", () => {
    expect(convert(120, "USD", "USD", RATES)).toBe(120);
  });

  it("routes through USD", () => {
    // 10,000 JPY → 80 USD → 64 GBP
    expect(convert(10_000, "JPY", "GBP", RATES)).toBeCloseTo(64, 10);
  });
});

describe("derivePortfolio", () => {
  it("averages cost across tranches and includes fees in the basis", () => {
    const summary = derivePortfolio({
      transactions: [
        tx({ symbol: "AAPL", side: "buy", quantity: 10, price: 100, fees: 5, date: "2025-01-02" }),
        tx({ symbol: "AAPL", side: "buy", quantity: 10, price: 120, fees: 5, date: "2025-02-02" }),
      ],
      quotes: [quote("AAPL", 130)],
      instruments: [AAPL],
      rates: RATES,
      base: "USD",
    });

    const position = summary.positions[0];
    // (10×100 + 5) + (10×120 + 5) = 2,210 over 20 shares
    expect(position.quantity).toBe(20);
    expect(position.averageCost).toBeCloseTo(110.5, 10);
    expect(position.costBasis).toBeCloseTo(2_210, 10);
    expect(position.marketValue).toBeCloseTo(2_600, 10);
    expect(position.unrealized).toBeCloseTo(390, 10);
    expect(position.unrealizedPct).toBeCloseTo(390 / 2_210, 10);
  });

  it("books realized P&L against average cost and leaves the rest open", () => {
    const summary = derivePortfolio({
      transactions: [
        tx({ symbol: "AAPL", side: "buy", quantity: 10, price: 100, date: "2025-01-02" }),
        tx({ symbol: "AAPL", side: "buy", quantity: 10, price: 120, date: "2025-02-02" }),
        tx({ symbol: "AAPL", side: "sell", quantity: 8, price: 150, fees: 2, date: "2025-03-02" }),
      ],
      quotes: [quote("AAPL", 130)],
      instruments: [AAPL],
      rates: RATES,
      base: "USD",
    });

    const position = summary.positions[0];
    // Average cost 110. Sold 8 at 150 → 8×40 = 320, less the 2 fee.
    expect(summary.realized).toBeCloseTo(318, 10);
    expect(position.quantity).toBe(12);
    // The remaining 12 stay at the same average cost — a sell doesn't reprice
    // what's left.
    expect(position.averageCost).toBeCloseTo(110, 10);
    expect(position.costBasis).toBeCloseTo(1_320, 10);
  });

  it("closes the position cleanly on a full exit", () => {
    const summary = derivePortfolio({
      transactions: [
        tx({ symbol: "AAPL", side: "buy", quantity: 10, price: 100, date: "2025-01-02" }),
        tx({ symbol: "AAPL", side: "sell", quantity: 10, price: 130, date: "2025-03-02" }),
      ],
      quotes: [quote("AAPL", 130)],
      instruments: [AAPL],
      rates: RATES,
      base: "USD",
    });

    expect(summary.positions).toHaveLength(0);
    expect(summary.totalValue).toBe(0);
    expect(summary.realized).toBeCloseTo(300, 10);
    expect(summary.closed).toEqual([{ symbol: "AAPL", realized: 300 }]);
  });

  it("orders by date, not by array order", () => {
    const late = tx({
      symbol: "AAPL",
      side: "sell",
      quantity: 5,
      price: 200,
      date: "2025-06-01",
    });
    const early = tx({
      symbol: "AAPL",
      side: "buy",
      quantity: 5,
      price: 100,
      date: "2025-01-01",
    });

    // A sell listed before its buy must not be clamped to a zero holding.
    const summary = derivePortfolio({
      transactions: [late, early],
      quotes: [quote("AAPL", 210)],
      instruments: [AAPL],
      rates: RATES,
      base: "USD",
    });

    expect(summary.realized).toBeCloseTo(500, 10);
  });

  it("converts a non-USD instrument into the base currency", () => {
    const summary = derivePortfolio({
      transactions: [
        tx({ symbol: "USDJPY", side: "buy", quantity: 1_000, price: 150, date: "2025-01-02" }),
      ],
      quotes: [quote("USDJPY", 155)],
      instruments: [USDJPY],
      rates: RATES,
      base: "USD",
    });

    // 1,000 units at ¥155 = ¥155,000 → $1,240 at 0.008 USD per yen.
    expect(summary.totalValue).toBeCloseTo(1_240, 10);
    expect(summary.totalCost).toBeCloseTo(1_200, 10);
  });

  it("computes the day change from the previous close, not from cost", () => {
    const summary = derivePortfolio({
      transactions: [
        tx({ symbol: "BTC", side: "buy", quantity: 2, price: 50_000, date: "2025-01-02" }),
      ],
      quotes: [quote("BTC", 101_000, 100_000)],
      instruments: [BTC],
      rates: RATES,
      base: "USD",
    });

    expect(summary.dayChange).toBeCloseTo(2_000, 10);
    expect(summary.dayChangePct).toBeCloseTo(0.01, 10);
    // Unrealized still measures against what was paid.
    expect(summary.unrealized).toBeCloseTo(102_000, 10);
  });

  it("holds an unquoted position at cost rather than at zero", () => {
    const summary = derivePortfolio({
      transactions: [
        tx({ symbol: "AAPL", side: "buy", quantity: 4, price: 250, date: "2025-01-02" }),
      ],
      quotes: [],
      instruments: [AAPL],
      rates: RATES,
      base: "USD",
    });

    expect(summary.totalValue).toBeCloseTo(1_000, 10);
    expect(summary.unrealized).toBeCloseTo(0, 10);
    expect(summary.dayChange).toBeCloseTo(0, 10);
  });

  it("weights positions by market value", () => {
    const summary = derivePortfolio({
      transactions: [
        tx({ symbol: "AAPL", side: "buy", quantity: 10, price: 100, date: "2025-01-02" }),
        tx({ symbol: "BTC", side: "buy", quantity: 0.1, price: 60_000, date: "2025-01-02" }),
      ],
      quotes: [quote("AAPL", 100), quote("BTC", 90_000)],
      instruments: [AAPL, BTC],
      rates: RATES,
      base: "USD",
    });

    // $9,000 of BTC against $1,000 of AAPL.
    expect(summary.positions.map((p) => p.symbol)).toEqual(["BTC", "AAPL"]);
    expect(summary.positions[0].weight).toBeCloseTo(0.9, 10);
    expect(summary.positions[1].weight).toBeCloseTo(0.1, 10);
  });

  it("reports an empty log as empty rather than as a zero portfolio", () => {
    const summary = derivePortfolio({
      transactions: [],
      quotes: [quote("AAPL", 100)],
      instruments: [AAPL],
      rates: RATES,
      base: "USD",
    });

    expect(summary.isEmpty).toBe(true);
    expect(summary.unrealizedPct).toBeNull();
    expect(summary.dayChangePct).toBeNull();
  });
});

describe("portfolioValueSeries", () => {
  const candle = (t: number, c: number): Candle => ({ t, o: c, h: c, l: c, c, v: 0 });
  const DAY = 86_400_000;
  const d = (n: number) => n * DAY;

  /**
   * The chart's last point and the hero figure above it are the same
   * quantity, and they have to agree. Left to the candles the line ended on
   * the previous *close* while the hero read the live tick — two numbers for
   * "what your book is worth", a centimetre apart, quietly different.
   */
  it("prices the final point at the live quote, not the last close", () => {
    const args = {
      transactions: [
        tx({
          symbol: "AAPL",
          side: "buy",
          quantity: 10,
          price: 100,
          date: new Date(d(1)).toISOString(),
        }),
      ],
      candles: new Map([["AAPL", [candle(d(1), 100), candle(d(2), 110)]]]),
      instruments: [AAPL],
      rates: RATES,
      base: "USD" as const,
    };

    const onCloses = portfolioValueSeries(args);
    expect(onCloses[onCloses.length - 1].value).toBe(1100);

    const live = portfolioValueSeries({ ...args, quotes: [quote("AAPL", 130)] });
    const last = live[live.length - 1];

    expect(last.value).toBe(1300);
    // Same instant as before — re-pricing must not move the x-axis.
    expect(last.t).toBe(onCloses[onCloses.length - 1].t);
    // Cost is what you paid. A price move can never change it.
    expect(last.cost).toBe(onCloses[onCloses.length - 1].cost);
    // And only the last point is touched.
    expect(live[0]).toEqual(onCloses[0]);
  });

  it("starts where every holding has a price, not where the first series does", () => {
    const buy = (symbol: string) =>
      tx({ symbol, side: "buy", quantity: 1, price: 100, date: new Date(d(0)).toISOString() });
    const points = portfolioValueSeries({
      transactions: [buy("AAPL"), buy("BTC")],
      // BTC's range opens two days before AAPL's first bar.
      candles: new Map([
        ["BTC", [candle(d(1), 100), candle(d(2), 100), candle(d(3), 100)]],
        ["AAPL", [candle(d(3), 100)]],
      ]),
      instruments: [AAPL, BTC],
      rates: RATES,
      base: "USD",
    });
    expect(points.map((p) => p.t)).toEqual([d(3)]);
    expect(points[0].value).toBe(200);
  });

  it("keeps the chart when one holding never gets a series", () => {
    const buy = (symbol: string) =>
      tx({ symbol, side: "buy", quantity: 1, price: 100, date: new Date(d(0)).toISOString() });
    const points = portfolioValueSeries({
      transactions: [buy("AAPL"), buy("BTC")],
      candles: new Map([["BTC", [candle(d(1), 100), candle(d(2), 100)]]]),
      instruments: [AAPL, BTC],
      rates: RATES,
      base: "USD",
    });
    expect(points).toHaveLength(2);
  });

  it("falls back to the last close for a symbol with no quote", () => {
    const points = portfolioValueSeries({
      transactions: [
        tx({
          symbol: "AAPL",
          side: "buy",
          quantity: 10,
          price: 100,
          date: new Date(d(1)).toISOString(),
        }),
      ],
      candles: new Map([["AAPL", [candle(d(1), 100), candle(d(2), 110)]]]),
      instruments: [AAPL],
      rates: RATES,
      base: "USD",
      quotes: [quote("BTC", 90_000)],
    });

    expect(points[points.length - 1].value).toBe(1100);
  });

  it("values only what was held on each date", () => {
    const points = portfolioValueSeries({
      transactions: [
        tx({
          symbol: "AAPL",
          side: "buy",
          quantity: 10,
          price: 100,
          date: new Date(d(2)).toISOString(),
        }),
      ],
      candles: new Map([
        ["AAPL", [candle(d(1), 90), candle(d(2), 100), candle(d(3), 120)]],
      ]),
      instruments: [AAPL],
      rates: RATES,
      base: "USD",
    });

    // Day 1 predates the first trade and is not portfolio history.
    expect(points.map((p) => p.t)).toEqual([d(2), d(3)]);
    expect(points[0].value).toBeCloseTo(1_000, 10);
    expect(points[1].value).toBeCloseTo(1_200, 10);
    // Cost is flat: buying doesn't change what was paid for it afterwards.
    expect(points.map((p) => p.cost)).toEqual([1_000, 1_000]);
  });

  it("carries a symbol forward across a day its market didn't trade", () => {
    const points = portfolioValueSeries({
      transactions: [
        tx({
          symbol: "AAPL",
          side: "buy",
          quantity: 1,
          price: 100,
          date: new Date(d(1)).toISOString(),
        }),
        tx({
          symbol: "BTC",
          side: "buy",
          quantity: 1,
          price: 1_000,
          date: new Date(d(1)).toISOString(),
        }),
      ],
      candles: new Map([
        // The equity has no bar on day 2 — a weekend.
        ["AAPL", [candle(d(1), 100), candle(d(3), 110)]],
        ["BTC", [candle(d(1), 1_000), candle(d(2), 1_100), candle(d(3), 1_200)]],
      ]),
      instruments: [AAPL, BTC],
      rates: RATES,
      base: "USD",
    });

    expect(points).toHaveLength(3);
    // Day 2 holds AAPL at its day-1 close rather than dropping it from the sum,
    // which would print a phantom crash every weekend.
    expect(points[1].value).toBeCloseTo(100 + 1_100, 10);
    expect(points[2].value).toBeCloseTo(110 + 1_200, 10);
  });

  it("drops the cost of a position once it is sold", () => {
    const points = portfolioValueSeries({
      transactions: [
        tx({
          symbol: "AAPL",
          side: "buy",
          quantity: 10,
          price: 100,
          date: new Date(d(1)).toISOString(),
        }),
        tx({
          symbol: "AAPL",
          side: "sell",
          quantity: 10,
          price: 150,
          date: new Date(d(3)).toISOString(),
        }),
      ],
      candles: new Map([
        ["AAPL", [candle(d(1), 100), candle(d(2), 130), candle(d(3), 150)]],
      ]),
      instruments: [AAPL],
      rates: RATES,
      base: "USD",
    });

    expect(points[1].value).toBeCloseTo(1_300, 10);
    // Exited on day 3: nothing held, nothing invested.
    expect(points[2].value).toBe(0);
    expect(points[2].cost).toBe(0);
  });

  it("returns nothing for an empty log", () => {
    expect(
      portfolioValueSeries({
        transactions: [],
        candles: new Map([["AAPL", [candle(d(1), 100)]]]),
        instruments: [AAPL],
        rates: RATES,
        base: "USD",
      }),
    ).toEqual([]);
  });
});
