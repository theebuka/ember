import { describe, expect, it } from "vitest";
import { CURRENCY_META } from "@/lib/api/types";
import { EXCHANGES, exchangeOf, sessionMinutes } from "@/lib/market/exchanges";
import { INSTRUMENTS, fxLegs, instrumentsIn } from "@/lib/market/universe";
import { ALIASES, NAME_MATCHERS } from "./finnhub";
import {
  COINGECKO_IDS,
  CONVERSION_CURRENCIES,
  FX_CURRENCIES,
  SYMBOL_BY_COINGECKO_ID,
  YAHOO_FX_CURRENCIES,
  yahooTicker,
} from "./mapping";

/**
 * The failure these guard against is silent.
 *
 * A crypto instrument with no CoinGecko id, or an equity whose Yahoo ticker is
 * wrong, returns no candles — `buildContext` drops it and it simply stops
 * appearing. No error, no empty state, nothing on any screen to notice, and it
 * looks exactly like an instrument the engine had no view on. Adding a row to
 * `universe.ts` and forgetting its mapping is a one-line mistake that would
 * take a long time to find by looking.
 */
describe("live symbol mapping", () => {
  it("every crypto instrument resolves to a CoinGecko id", () => {
    const unmapped = instrumentsIn("crypto")
      .filter((instrument) => !COINGECKO_IDS[instrument.symbol])
      .map((instrument) => instrument.symbol);

    expect(unmapped).toEqual([]);
  });

  it("no two symbols claim the same coin", () => {
    expect(SYMBOL_BY_COINGECKO_ID.size).toBe(Object.keys(COINGECKO_IDS).length);
  });

  it("maps no coin the universe has dropped", () => {
    const known = new Set(instrumentsIn("crypto").map((i) => i.symbol));
    expect(Object.keys(COINGECKO_IDS).filter((s) => !known.has(s))).toEqual([]);
  });

  it("every currency an fx pair is built from is one the ECB publishes", () => {
    const published = new Set<string>([...FX_CURRENCIES, "USD"]);

    for (const instrument of instrumentsIn("fx")) {
      const legs = fxLegs(instrument.symbol);
      expect(legs, `${instrument.symbol} has no legs`).not.toBeNull();
      expect(published.has(legs!.base), `${instrument.symbol} base`).toBe(true);
      expect(published.has(legs!.quote), `${instrument.symbol} quote`).toBe(true);
    }
  });

  it("every quote currency in the universe has somewhere to get a rate", () => {
    // Otherwise a foreign holding is valued at its face number — a plausible
    // figure that is wrong by whatever the exchange rate happens to be.
    const sourced = new Set<string>([
      "USD",
      ...FX_CURRENCIES,
      ...CONVERSION_CURRENCIES,
      ...YAHOO_FX_CURRENCIES,
    ]);
    const unsourced = [
      ...new Set(INSTRUMENTS.map((i) => i.currency).filter((c) => !sourced.has(c))),
    ];

    expect(unsourced).toEqual([]);
  });
});

describe("exchanges", () => {
  it("every equity names a venue that exists", () => {
    const bad = instrumentsIn("equity")
      .filter((i) => !exchangeOf(i.exchange))
      .map((i) => `${i.symbol}:${i.exchange}`);

    expect(bad).toEqual([]);
  });

  it("crypto and fx name no venue", () => {
    // They trade continuously or over the counter. An exchange on either would
    // put a session boundary on something that has none.
    const wrong = [...instrumentsIn("crypto"), ...instrumentsIn("fx")]
      .filter((i) => i.exchange !== undefined)
      .map((i) => i.symbol);

    expect(wrong).toEqual([]);
  });

  it("an instrument's currency and precision come from its venue", () => {
    for (const instrument of instrumentsIn("equity")) {
      const exchange = exchangeOf(instrument.exchange)!;
      expect(instrument.currency, instrument.symbol).toBe(exchange.currency);
      expect(instrument.precision, instrument.symbol).toBe(
        CURRENCY_META[exchange.currency].decimals,
      );
    }
  });

  it("every venue has a session with time in it", () => {
    for (const exchange of Object.values(EXCHANGES)) {
      expect(exchange.close, exchange.id).toBeGreaterThan(exchange.open);
      expect(sessionMinutes(exchange), exchange.id).toBeGreaterThan(60);
      if (exchange.lunch) {
        expect(exchange.lunch[0], exchange.id).toBeGreaterThan(exchange.open);
        expect(exchange.lunch[1], exchange.id).toBeLessThan(exchange.close);
      }
      // A bad zone name makes `Intl` throw inside the window loop, 72 times.
      expect(() => new Intl.DateTimeFormat("en-US", { timeZone: exchange.timeZone })).not.toThrow();
    }
  });

  it("writes tickers the way Yahoo does", () => {
    // A US share class uses a hyphen where the exchange uses a dot. `BRK.B`
    // returned an empty series until this existed, which is the one case in the
    // universe that proves the rule.
    expect(yahooTicker("BRK.B", EXCHANGES.XNYS)).toBe("BRK-B");
    expect(yahooTicker("AAPL", EXCHANGES.XNYS)).toBe("AAPL");

    // An international symbol already carries its venue suffix and must pass
    // through untouched — rewriting `SHEL.L` to `SHEL-L` would ask Yahoo for
    // nothing.
    expect(yahooTicker("SHEL.L", EXCHANGES.XLON)).toBe("SHEL.L");
    expect(yahooTicker("7203.T", EXCHANGES.XTKS)).toBe("7203.T");
    expect(yahooTicker("005930.KS", EXCHANGES.XKRX)).toBe("005930.KS");
  });

  it("marks exactly the two venues that quote in minor units", () => {
    /**
     * **The most expensive mistake available in this phase.** London reports
     * pence and Johannesburg reports cents — Shell comes back as 3313.825 with
     * a currency of `GBp`, Naspers as 79770 with `ZAc`. Taken at face value a
     * holding is out by a factor of a hundred: cost basis, weight, the
     * concentration warning, every figure downstream.
     *
     * Probed against the live feed rather than assumed, and asserted here so a
     * new venue cannot be added without someone deciding which case it is.
     */
    const minor = Object.values(EXCHANGES)
      .filter((e) => e.quoteDivisor === 100)
      .map((e) => e.id)
      .sort();

    expect(minor).toEqual(["XJSE", "XLON"]);
  });

  it("anchors London and Johannesburg in major units", () => {
    // The divisor is applied in the provider, so the generated path has to be
    // written in the same units the feed ends up in — or the mock and the live
    // feed would disagree by a hundred for the same instrument.
    const shell = INSTRUMENTS.find((i) => i.symbol === "SHEL.L")!;
    const naspers = INSTRUMENTS.find((i) => i.symbol === "NPN.JO")!;

    // Shell in pounds, not pence: tens, not thousands.
    expect(shell.anchorPrice).toBeGreaterThan(10);
    expect(shell.anchorPrice).toBeLessThan(100);
    // Naspers in rand, not cents: hundreds, not tens of thousands.
    expect(naspers.anchorPrice).toBeGreaterThan(100);
    expect(naspers.anchorPrice).toBeLessThan(2_000);
  });
});

describe("news name matching", () => {
  it("has something to match every instrument on", () => {
    // A name shorter than the matcher's floor could never be tagged, and it
    // would fail silently — BP was exactly this until an alias and a
    // case-sensitive pattern were added.
    const unmatchable = INSTRUMENTS.filter(
      (i) => i.market !== "fx" && !ALIASES[i.symbol] && i.name.length < 3,
    );

    expect(unmatchable.map((i) => i.symbol)).toEqual([]);
  });

  it("matches a two-letter name only in exact case", () => {
    const bp = NAME_MATCHERS.find((m) => m.symbol === "BP.L")!;

    expect(bp.pattern.test("BP raises its dividend")).toBe(true);
    // Lowercase "bp" in prose is not the company. A case-insensitive
    // two-letter pattern is the same class of mistake as scanning for `SO`.
    expect(bp.pattern.test("measured in bp terms")).toBe(false);
  });

  it("does not match an English word that happens to be a ticker", () => {
    const near = NAME_MATCHERS.find((m) => m.symbol === "NEAR")!;
    expect(near.pattern.test("shares closed near a record")).toBe(false);
    expect(near.pattern.test("NEAR Protocol added staking")).toBe(true);
  });

  it("matches a multi-word name only in full", () => {
    const bac = NAME_MATCHERS.find((m) => m.symbol === "BAC")!;
    // `\bBank\b` tagged seven unrelated banking stories and put "bank" top of
    // the trending strip attributed to Intel and BlackRock.
    expect(bac.pattern.test("the bank raised rates")).toBe(false);
    expect(bac.pattern.test("Bank of America beat estimates")).toBe(true);
  });
});
