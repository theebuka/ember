import {
  CURRENCY_META,
  type Currency,
  type Instrument,
  type MarketKind,
} from "@/lib/api/types";

/**
 * Every number and date the user sees is formatted here.
 *
 * **The locale is pinned.** `Intl` defaults to the runtime's locale, which is
 * the server's on the first render and the browser's on hydration — a user in
 * Lagos would get `1,234.56` from Node and `1.234,56` from Chrome, and React
 * would throw a hydration mismatch on a number. Pinning to `en-US` makes both
 * sides agree. Locale becomes a real setting when there's an account to hang
 * it on; until then a silent mismatch is worse than a fixed choice.
 */
const LOCALE = "en-US";

/* ── Money ─────────────────────────────────────────────────────────────── */

const moneyCache = new Map<string, Intl.NumberFormat>();

function moneyFormatter(currency: Currency, decimals: number): Intl.NumberFormat {
  const key = `${currency}:${decimals}`;
  let cached = moneyCache.get(key);
  if (!cached) {
    cached = new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    moneyCache.set(key, cached);
  }
  return cached;
}

export function formatMoney(
  value: number,
  currency: Currency,
  options: { decimals?: number; signed?: boolean } = {},
): string {
  const decimals = options.decimals ?? CURRENCY_META[currency].decimals;
  const formatted = moneyFormatter(currency, decimals).format(Math.abs(value));

  if (value < 0) return `−${formatted}`;
  return options.signed ? `+${formatted}` : formatted;
}

/**
 * A money value split into its parts, so the hero can set them differently.
 *
 * The portfolio value is the largest thing on the screen; rendering its cents
 * at the same size as its dollars makes the eye read the decimals first. Two
 * sizes in one number is a deliberate typographic move, and it needs the parts
 * separately rather than one formatted string.
 */
export function splitMoney(
  value: number,
  currency: Currency,
): { sign: string; symbol: string; whole: string; fraction: string } {
  const decimals = CURRENCY_META[currency].decimals;
  const parts = moneyFormatter(currency, decimals).formatToParts(Math.abs(value));

  let symbol = "";
  let whole = "";
  let fraction = "";

  for (const part of parts) {
    if (part.type === "currency") symbol += part.value;
    else if (part.type === "fraction") fraction = part.value;
    else if (part.type === "decimal") continue;
    else if (part.type !== "literal") whole += part.value;
  }

  return { sign: value < 0 ? "−" : "", symbol, whole, fraction };
}

/** Large values shortened for chart axes and dense chips. Never for the hero. */
export function formatCompactMoney(value: number, currency: Currency): string {
  const formatted = new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.abs(value));
  return value < 0 ? `−${formatted}` : formatted;
}

/* ── Prices ────────────────────────────────────────────────────────────── */

/**
 * A quote at the instrument's own conventional precision.
 *
 * FX pairs are quoted as a bare rate — `1.0942`, not `$1.0942` — because the
 * number *is* the exchange rate, and prefixing it with a currency symbol says
 * something false about what's being measured. Everything else carries its
 * quote currency.
 */
export function formatQuotePrice(instrument: Instrument, value: number): string {
  if (instrument.market === "fx") {
    return new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: instrument.precision,
      maximumFractionDigits: instrument.precision,
    }).format(value);
  }
  return formatMoney(value, instrument.currency, { decimals: instrument.precision });
}

/**
 * A price as it goes into a form field: the instrument's own precision, no
 * currency, no grouping. `String(price)` pre-filled "12.69792680031", which
 * overflowed the field on a phone and is a price nobody paid.
 */
export function priceForInput(instrument: Instrument, value: number): string {
  return String(Number(value.toFixed(instrument.precision)));
}

/**
 * How finely a quantity in this market is worth quoting.
 *
 * Shared by the display formatter and by anything that pre-fills a quantity
 * into the transaction form, so a suggested size arrives as `10.7082` rather
 * than `10.70817157` — eight decimal places of a share is a number no broker
 * will fill and no person typed.
 */
export function quantityPrecision(market: MarketKind): number {
  return market === "crypto" ? 8 : market === "fx" ? 2 : 4;
}

/**
 * A holding size.
 *
 * Crypto positions are fractional to eight places and equity positions are
 * usually whole shares, so a fixed precision would print either `0.00 BTC` or
 * `12.00000000 AAPL`. Trailing zeros are trimmed instead.
 */
export function formatQuantity(value: number, market: MarketKind): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: quantityPrecision(market),
  }).format(value);
}

/**
 * A suggested size, printed after "≈". It is an estimate, so it is rounded to
 * what a person would type: 0.3145 BTC, not 0.3144784.
 */
export function formatApproxQuantity(value: number, market: MarketKind): string {
  const options: Intl.NumberFormatOptions =
    market === "crypto"
      ? Math.abs(value) < 1
        ? { maximumSignificantDigits: 4 }
        : { maximumFractionDigits: 4 }
      : { maximumFractionDigits: market === "fx" ? 0 : 2 };
  return new Intl.NumberFormat(LOCALE, options).format(value);
}

/**
 * A suggested size as it goes into the trade form: rounded the way
 * `formatApproxQuantity` prints it, without grouping. The form opened on
 * "75.50574729 LINK", a quantity nobody would type.
 */
export function quantityForInput(value: number, market: MarketKind): string {
  if (market === "crypto") {
    return String(
      Math.abs(value) < 1 ? Number(value.toPrecision(4)) : Number(value.toFixed(4)),
    );
  }
  return String(Number(value.toFixed(market === "fx" ? 0 : 2)));
}

/* ── Percentages ───────────────────────────────────────────────────────── */

/** Takes a proportion (0.0124), renders a percentage (1.24%). */
export function formatPercent(
  fraction: number,
  options: { signed?: boolean; decimals?: number } = {},
): string {
  const decimals = options.decimals ?? 2;
  const value = Math.abs(fraction) * 100;
  const body = `${value.toFixed(decimals)}%`;

  if (fraction < 0) return `−${body}`;
  return options.signed ? `+${body}` : body;
}

/* ── Direction ─────────────────────────────────────────────────────────── */

export type Direction = "up" | "down" | "flat";

/**
 * Below a tenth of a basis point, a move is rounding noise. Colouring it green
 * or red asserts a direction the data doesn't support.
 */
export function directionOf(value: number, epsilon = 1e-6): Direction {
  if (value > epsilon) return "up";
  if (value < -epsilon) return "down";
  return "flat";
}

/* ── Time ──────────────────────────────────────────────────────────────── */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long ago, in the shortest honest form.
 *
 * Deliberately coarse past an hour: "3h ago" is what a person wants from a
 * price timestamp, and "3h 14m ago" implies a precision the staleness of the
 * quote doesn't have.
 */
export function formatRelative(at: number, now: number = Date.now()): string {
  const elapsed = now - at;
  if (elapsed < 0) return "just now";
  if (elapsed < 45_000) return "just now";
  if (elapsed < HOUR) return `${Math.round(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.round(elapsed / HOUR)}h ago`;
  if (elapsed < 7 * DAY) return `${Math.round(elapsed / DAY)}d ago`;
  return formatDate(at);
}

export function formatDate(at: number): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(at);
}

export function formatShortDate(at: number): string {
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short" }).format(at);
}

/**
 * A moment inside the execution window — `Thu 14:15`.
 *
 * 24-hour, because the window is a range and `2:15 PM – 4:00 PM` costs four
 * extra characters per bound to say the same thing. The weekday is included
 * because the horizon is 72 hours, so "14:15" alone is ambiguous.
 */
export function formatWindowTime(at: number): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
}

/**
 * The viewer's timezone, spelled out once beside a window.
 *
 * Times are rendered in local time throughout — a window the user has to
 * convert is a window they'll miss — but local time is only unambiguous if the
 * zone is stated somewhere.
 */
export function timeZoneLabel(at: number = Date.now()): string {
  const parts = new Intl.DateTimeFormat(LOCALE, {
    timeZoneName: "short",
  }).formatToParts(at);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}

/**
 * A bare ratio, with a real minus sign.
 *
 * `toFixed` emits a hyphen-minus, which is narrower than the digits around it
 * and than the U+2212 every other number in the app uses. One `-0.16` in a row
 * of `−2.91%` figures is the sort of detail that makes a table look assembled.
 */
export function formatRatio(value: number, decimals = 2): string {
  const body = Math.abs(value).toFixed(decimals);
  return value < 0 ? `−${body}` : body;
}

/** `2h 40m` — the span of a window, for the card's summary line. */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / MINUTE));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * The horizon in the words a person would use.
 *
 * Derived rather than written down: this sentence used to say "three days" as a
 * literal, which was true for every market until crypto's horizon became 36
 * hours and then it was simply wrong on a third of the universe — the same shape
 * of defect as the methodology page's hardcoded "prices in this build are
 * generated" (decision 030).
 *
 * Lives here rather than in `window.ts` so a component can say it without
 * importing the engine: four screens wrote "three days" as a literal because
 * this function was private to the one file they could not reach.
 */
export function describeSpan(hours: number): string {
  if (hours >= 48) {
    const days = Math.round(hours / 24);
    return days === 2 ? "two days" : days === 3 ? "three days" : `${days} days`;
  }
  return hours >= 36 ? "day and a half" : `${hours} hours`;
}

/** The span a computed window covers, in words — "three days", "day and a half". */
export function describeHorizon(window: { from: number; to: number }): string {
  return describeSpan(Math.round((window.to - window.from) / 3_600_000));
}
