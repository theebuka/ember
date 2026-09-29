import type { MarketKind } from "@/lib/api/types";
import { EXCHANGES, sessionMinutes, type Exchange } from "@/lib/market/exchanges";

/**
 * When each market is actually worth trading in.
 *
 * This is the empirical half of the execution window. Liquidity is not flat
 * across the day in any market, and the differences are large enough to
 * matter to a retail-sized order: spreads at the US open are routinely
 * several times what they are an hour later, and a crypto order on a Sunday
 * morning walks a materially thinner book than the same order on Tuesday.
 *
 * The shapes below are the well-documented ones — the U-shaped equity volume
 * curve, the London/New York overlap in FX, weekend thinning in crypto. They
 * are modelled, not measured: with a real feed these become observed spread
 * and depth. Recorded as a known gap in CLAUDE.md.
 */

/** Cached because a window evaluates 72 points and would otherwise rebuild. */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
    });
    formatters.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface ZonedTime {
  /** 0–23 in the target zone. */
  hour: number;
  minute: number;
  /** 0 = Sunday. */
  weekday: number;
  /** Minutes since midnight, for range comparisons. */
  minutes: number;
}

/**
 * Wall-clock time in a named zone. Uses `Intl` rather than fixed offsets so
 * daylight saving is handled correctly — the US equity session shifts against
 * UTC twice a year, and hard-coding −5 would put the close in the wrong hour
 * for eight months of the year.
 */
export function zonedTime(at: number, timeZone: string): ZonedTime {
  const parts = formatterFor(timeZone).formatToParts(new Date(at));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";

  // Intl renders midnight as 24 in some ICU versions under hour12: false.
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));

  return {
    hour,
    minute,
    weekday: Math.max(0, WEEKDAYS.indexOf(get("weekday"))),
    minutes: hour * 60 + minute,
  };
}

/** Piecewise-linear interpolation over (minutes, quality) control points. */
function interpolate(
  minutes: number,
  points: readonly [number, number][],
): number {
  if (minutes <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (minutes >= last[0]) return last[1];

  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x0, y0] = points[i - 1];
    if (minutes <= x1) {
      const ratio = (minutes - x0) / (x1 - x0);
      return y0 + (y1 - y0) * ratio;
    }
  }
  return last[1];
}

/**
 * The equity session, as fractions of the session rather than clock times.
 *
 * It used to be absolute Eastern-time minutes, which was fine while every
 * instrument was American and wrong the moment one was not. Expressed as a
 * fraction of the session it describes all sixteen venues with one shape: a
 * 4.5-hour Taipei day and an 8.5-hour London day both have an open, a middle
 * and a close, and the documented U applies to both.
 *
 * The shape keeps its one important deviation: the first stretch scores *low*
 * rather than high. Volume is enormous at the open, but so is the spread and so
 * is the reversal risk from overnight order imbalance — high volume is not the
 * same as good execution. Depth into the close is the best window of the day
 * for a retail order, and the last few minutes are pulled back down for
 * auction imbalance.
 */
const EQUITY_CURVE: readonly [number, number][] = [
  [0.0, 0.25], // open — heavy volume, wide spreads
  [0.04, 0.35],
  [0.08, 0.6],
  [0.15, 0.8],
  [0.31, 0.72],
  [0.46, 0.5], // midday lull
  [0.62, 0.58],
  [0.77, 0.82],
  [0.92, 0.95], // depth into the close
  [0.97, 0.7], // closing auction imbalance
  [1.0, 0.3],
];

/**
 * How far through the trading session a local time is, 0 to 1.
 *
 * `null` means the market is shut — before the open, after the close, or inside
 * a lunch break. A break is a genuine halt rather than a thin patch: Tokyo and
 * Hong Kong stop for an hour, and treating that as low liquidity would let a
 * window open into a period when no order can fill at all.
 */
function sessionProgress(minutes: number, exchange: Exchange): number | null {
  if (minutes < exchange.open || minutes > exchange.close) return null;

  const lunch = exchange.lunch;
  if (lunch && minutes >= lunch[0] && minutes <= lunch[1]) return null;

  const elapsed =
    lunch && minutes > lunch[1]
      ? minutes - exchange.open - (lunch[1] - lunch[0])
      : minutes - exchange.open;

  const total = sessionMinutes(exchange);
  return total <= 0 ? null : Math.min(1, Math.max(0, elapsed / total));
}

/**
 * FX, in UTC.
 *
 * Tokyo, London and New York overlap in a predictable pattern. The
 * London/New York overlap around 13:00–16:00 UTC carries the tightest
 * spreads of the day; the gap between the New York close and the Tokyo open
 * is the thinnest liquidity of the week outside the weekend.
 */
const FX_CURVE: readonly [number, number][] = [
  [0, 0.45], // Tokyo
  [3 * 60, 0.5],
  [6 * 60, 0.4], // Tokyo winding down
  [7 * 60, 0.65], // London opens
  [9 * 60, 0.8],
  [12 * 60, 0.85],
  [13 * 60, 1.0], // London/New York overlap
  [16 * 60, 0.95],
  [17 * 60, 0.7], // London closes
  [20 * 60, 0.5],
  [21 * 60, 0.25], // New York close to Tokyo open
  [23 * 60, 0.3],
  [24 * 60 - 1, 0.42],
];

/**
 * Crypto, in UTC.
 *
 * Never closed, but far from uniform. Depth follows waking hours in Europe
 * and the Americas, and weekends are consistently thinner — which is exactly
 * when large moves are most likely to slip.
 */
const CRYPTO_CURVE: readonly [number, number][] = [
  [0, 0.55],
  [6 * 60, 0.5],
  [8 * 60, 0.7], // Europe
  [13 * 60, 0.9], // Europe and US both awake
  [16 * 60, 0.95],
  [20 * 60, 0.8],
  [23 * 60, 0.62],
];

/**
 * Execution quality at an instant, 0 (don't) to 1 (best window available).
 *
 * Zero means the market is closed, and the window model treats it as a hard
 * exclusion rather than a low score.
 */
export function liquidityAt(
  at: number,
  market: MarketKind,
  /**
   * The venue, for equities. Defaults to New York so every existing caller —
   * including the backtest and the tests — keeps its previous behaviour, and
   * so a missing exchange degrades to the old answer rather than to no market.
   */
  exchangeId: string = "XNYS",
): number {
  if (market === "equity") {
    const exchange = EXCHANGES[exchangeId] ?? EXCHANGES.XNYS;
    const t = zonedTime(at, exchange.timeZone);
    if (t.weekday === 0 || t.weekday === 6) return 0;

    const progress = sessionProgress(t.minutes, exchange);
    if (progress === null) return 0;
    return interpolate(progress, EQUITY_CURVE);
  }

  if (market === "fx") {
    const t = zonedTime(at, "UTC");
    // The week runs from the Sydney open on Sunday evening to the New York
    // close on Friday. Outside that there is no market to trade in.
    if (t.weekday === 6) return 0;
    if (t.weekday === 0 && t.minutes < 21 * 60) return 0;
    if (t.weekday === 5 && t.minutes > 21 * 60) return 0;
    return interpolate(t.minutes, FX_CURVE);
  }

  const t = zonedTime(at, "UTC");
  const base = interpolate(t.minutes, CRYPTO_CURVE);
  // Weekend books are consistently thinner across venues.
  const weekend = t.weekday === 0 || t.weekday === 6 ? 0.72 : 1;
  return base * weekend;
}

/** Whether the market is open at all. */
export function isOpen(at: number, market: MarketKind, exchangeId?: string): boolean {
  return liquidityAt(at, market, exchangeId) > 0;
}
