import type { Currency } from "@/lib/api/types";

/**
 * The venues ember's equities actually trade on.
 *
 * **This module exists because of a bug that would have shipped otherwise.**
 * `liquidityAt()` hard-coded `America/New_York` and 09:30–16:00 for every
 * instrument whose market is `equity` — correct while all seventy-two were
 * American, and silently wrong the moment one was not. A Tokyo listing would
 * have had its execution window computed in New York hours: ember would have
 * told you to buy Toyota at a time the Tokyo exchange is shut, on the one
 * feature the whole product is built around.
 *
 * So an exchange is a first-class thing, and it carries the four properties
 * that differ between venues and that something downstream reads:
 *
 * - **Its time zone and hours**, so a window lands inside a real session.
 * - **A lunch break**, where there is one. Tokyo and Hong Kong close for an
 *   hour in the middle of the day, and during it there is no market at all —
 *   not a thin one.
 * - **Its quote currency**, which is a property of the venue rather than of the
 *   company: Shell trades in pence in London and dollars in New York.
 * - **A minor-unit divisor**, which is the trap in this whole phase. See below.
 */

export interface Exchange {
  /** ISO 10383 market identifier code, because it is the one stable id. */
  id: string;
  /** How a person refers to it. */
  label: string;
  /** IANA zone. Never a fixed offset — half these venues observe DST. */
  timeZone: string;
  /** Local minutes since midnight. */
  open: number;
  close: number;
  /**
   * Midday close, local minutes. Liquidity is zero inside it.
   *
   * Not a lull — an actual halt. Treating Tokyo's 11:30–12:30 as "quiet" would
   * let a window open into a period when no order can fill.
   */
  lunch?: readonly [number, number];
  currency: Currency;
  /**
   * Divide an upstream quote by this to get the major unit.
   *
   * **London quotes in pence and Johannesburg in cents.** Yahoo reports Shell
   * at 3313.65 (GBp) and Naspers at 79083 (ZAc), and the currency field comes
   * back as `GBp`/`ZAc` rather than `GBP`/`ZAR`. Taken at face value a holding
   * is misstated by a factor of a hundred — cost basis, position weight, the
   * concentration warning, every figure downstream. It is the single most
   * expensive mistake available in this phase, and it is a one-character
   * difference in a field nobody reads.
   *
   * Applied once, in `providers/live/yahoo.ts`, where the candles are built —
   * so nothing above the provider ever sees a minor unit.
   */
  quoteDivisor?: number;
  /** Suffix Yahoo appends to a ticker on this venue. Empty for US listings. */
  yahooSuffix: string;
}

const HOUR = 60;

function hm(hour: number, minute = 0): number {
  return hour * HOUR + minute;
}

export const EXCHANGES: Record<string, Exchange> = {
  /* ── North America ───────────────────────────────────────────────────── */
  XNYS: {
    id: "XNYS",
    label: "New York",
    timeZone: "America/New_York",
    open: hm(9, 30),
    close: hm(16),
    currency: "USD",
    yahooSuffix: "",
  },

  /* ── Europe ──────────────────────────────────────────────────────────── */
  XLON: {
    id: "XLON",
    label: "London",
    timeZone: "Europe/London",
    open: hm(8),
    close: hm(16, 30),
    currency: "GBP",
    // Pence. See the note on `quoteDivisor`.
    quoteDivisor: 100,
    yahooSuffix: ".L",
  },
  XETR: {
    id: "XETR",
    label: "Xetra",
    timeZone: "Europe/Berlin",
    open: hm(9),
    close: hm(17, 30),
    currency: "EUR",
    yahooSuffix: ".DE",
  },
  XPAR: {
    id: "XPAR",
    label: "Paris",
    timeZone: "Europe/Paris",
    open: hm(9),
    close: hm(17, 30),
    currency: "EUR",
    yahooSuffix: ".PA",
  },
  XAMS: {
    id: "XAMS",
    label: "Amsterdam",
    timeZone: "Europe/Amsterdam",
    open: hm(9),
    close: hm(17, 30),
    currency: "EUR",
    yahooSuffix: ".AS",
  },
  XMIL: {
    id: "XMIL",
    label: "Milan",
    timeZone: "Europe/Rome",
    open: hm(9),
    close: hm(17, 30),
    currency: "EUR",
    yahooSuffix: ".MI",
  },
  XSWX: {
    id: "XSWX",
    label: "Zurich",
    timeZone: "Europe/Zurich",
    open: hm(9),
    close: hm(17, 30),
    currency: "CHF",
    yahooSuffix: ".SW",
  },

  /* ── Asia-Pacific ────────────────────────────────────────────────────── */
  XTKS: {
    id: "XTKS",
    label: "Tokyo",
    timeZone: "Asia/Tokyo",
    open: hm(9),
    close: hm(15, 30),
    lunch: [hm(11, 30), hm(12, 30)],
    currency: "JPY",
    yahooSuffix: ".T",
  },
  XHKG: {
    id: "XHKG",
    label: "Hong Kong",
    timeZone: "Asia/Hong_Kong",
    open: hm(9, 30),
    close: hm(16),
    lunch: [hm(12), hm(13)],
    currency: "HKD",
    yahooSuffix: ".HK",
  },
  XKRX: {
    id: "XKRX",
    label: "Seoul",
    timeZone: "Asia/Seoul",
    open: hm(9),
    close: hm(15, 30),
    currency: "KRW",
    yahooSuffix: ".KS",
  },
  XTAI: {
    id: "XTAI",
    label: "Taipei",
    timeZone: "Asia/Taipei",
    open: hm(9),
    close: hm(13, 30),
    currency: "TWD",
    yahooSuffix: ".TW",
  },
  XNSE: {
    id: "XNSE",
    label: "Mumbai",
    timeZone: "Asia/Kolkata",
    open: hm(9, 15),
    close: hm(15, 30),
    currency: "INR",
    yahooSuffix: ".NS",
  },
  XSES: {
    id: "XSES",
    label: "Singapore",
    timeZone: "Asia/Singapore",
    open: hm(9),
    close: hm(17),
    lunch: [hm(12), hm(13)],
    currency: "SGD",
    yahooSuffix: ".SI",
  },

  /* ── Africa ──────────────────────────────────────────────────────────── */
  XJSE: {
    id: "XJSE",
    label: "Johannesburg",
    timeZone: "Africa/Johannesburg",
    open: hm(9),
    close: hm(17),
    currency: "ZAR",
    // Cents. Same trap as London.
    quoteDivisor: 100,
    yahooSuffix: ".JO",
  },
  XCAI: {
    id: "XCAI",
    label: "Cairo",
    timeZone: "Africa/Cairo",
    open: hm(10),
    close: hm(14, 30),
    currency: "EGP",
    yahooSuffix: ".CA",
  },
  /**
   * Lagos, and it is the one venue with no price history available anywhere.
   *
   * The NGX publishes its own REST API and it serves *today* — real OHLCV for
   * every listed symbol, and no way to ask for any other date. There is no
   * history endpoint, no date parameter that is honoured, and Yahoo does not
   * list the exchange at all. So instruments here are priced and explicitly not
   * assessed until ember has collected enough sessions itself. See
   * `providers/live/ngx.ts` and `dataState` on `Instrument`.
   *
   * Sunday–Thursday would be wrong: the NGX trades Monday to Friday like most
   * venues, 10:00–14:30 West Africa Time.
   */
  XNSA: {
    id: "XNSA",
    label: "Lagos",
    timeZone: "Africa/Lagos",
    open: hm(10),
    close: hm(14, 30),
    currency: "NGN",
    yahooSuffix: "",
  },
};

export type ExchangeId = keyof typeof EXCHANGES;

/** The venue an instrument trades on, or `null` for crypto and FX. */
export function exchangeOf(id: string | undefined): Exchange | null {
  return id ? (EXCHANGES[id] ?? null) : null;
}

/**
 * Minutes the session runs for, excluding any lunch break.
 *
 * Used to normalise the intraday liquidity curve, so one documented shape can
 * describe a 4.5-hour Taipei session and an 8.5-hour London one without a
 * hand-tuned curve per venue.
 */
export function sessionMinutes(exchange: Exchange): number {
  const lunch = exchange.lunch ? exchange.lunch[1] - exchange.lunch[0] : 0;
  return exchange.close - exchange.open - lunch;
}
