import type { MarketKind } from "@/lib/api/types";
import {
  eventMask,
  eventsWithin,
  EVENT_LABELS,
  type MarketEvent,
} from "@/lib/market/calendar";
import { describeSpan } from "@/lib/market/format";
import { liquidityAt, zonedTime } from "@/lib/market/sessions";

const HOUR = 3_600_000;

/**
 * How far ahead the window search looks, per market.
 *
 * This was one constant, 72, for all three markets. The number itself was never
 * wrong for equities — it is the wrong *kind* of number, because it was picked
 * rather than derived, and nothing said what it was for.
 *
 * What it is for: **the horizon has to be long enough to contain the next
 * liquidity crest, and no longer.** Decay strictly favours the earliest crest and
 * liquidity is near-identical from one session to the next, so the peak is always
 * in the first available session — extending the search past that draws three days
 * of band to answer a question settled in the first eight hours, which overstates
 * what is being searched.
 *
 * So the binding constraint is the longest a market can be *shut*:
 *
 * | | longest closure | next crest after it | horizon |
 * |---|---|---|---|
 * | equity | Fri 16:00 → Mon 09:30 local (~66h) | ~11:00 local | 72h |
 * | fx | Fri 21:00 → Sun 21:00 UTC (48h) | Mon 13:00 UTC overlap | 72h |
 * | crypto | never | within 24h, always | 36h |
 *
 * Two of the three land on the same number, and that is the interesting part
 * rather than a failure to differentiate: for exchange-traded instruments the
 * weekend sets the horizon, not the market's own cadence. Only crypto, which
 * never closes, can be shorter — and there the honest claim is "in the next day
 * and a half", which is what it now draws.
 *
 * **Exchange holidays are not modelled** (§8), so a Monday holiday puts the real
 * next session ~91h out, past the equity horizon. It changes nothing today
 * because `liquidityAt` also believes Monday is open; it is the second thing that
 * breaks when holidays land, and the first is the window itself.
 */
export const HORIZON_HOURS: Record<MarketKind, number> = {
  equity: 72,
  fx: 72,
  crypto: 36,
};

/** Span counted as "the window": everything above this share of the peak. */
const WINDOW_THRESHOLD = 0.5;

/**
 * How far a split verdict raises that bar, at maximum.
 *
 * `assess()` already cuts blended *confidence* when strategies disagree, which
 * governs whether a call is shown at all. This is the other half of the same
 * thought and it was missing from the engine: a call four rules like and three
 * dislike deserves a **shorter** window than a unanimous one, because the case
 * for it is more fragile and more easily overtaken. It is the display rule
 * "disagreement is shown, not hidden" reaching the window.
 *
 * ── Why the threshold and not the half-life ─────────────────────────────────
 *
 * The first version shortened the effective half-life, which is the more elegant
 * story — a contested edge decays faster — and it was measured to do **nothing**.
 * Decay over a 72-hour horizon is `exp(−ln2 · 3 / halfLife)`, and the blended
 * half-life of every call this engine actually produces lands between 24 and 75
 * days: 0.96 at the slow end, 0.92 at the fast one. Against a liquidity term that
 * swings from 0 to 1 inside a single session, a 4% tilt is invisible. Halving the
 * half-life moved no window's boundaries at all.
 *
 * The span is set by which hours clear the threshold, so that is the only lever
 * that can narrow it. Read plainly it says something true and stronger than the
 * decay version did: **for a contested call, "good enough to fill in" means
 * better.** At full dissent the bar rises from half the crest to 80% of it.
 */
const MAX_DISSENT_TIGHTENING = 0.6;

export interface WindowSample {
  t: number;
  /** 0…1, normalised so the crest is exactly 1. */
  intensity: number;
}

export interface ExecutionWindow {
  from: number;
  to: number;
  /** Hourly samples across the horizon. */
  curve: WindowSample[];
  /** The single best moment — where the ember point sits on the band. */
  peakAt: number;
  /** Contiguous span around the peak above half its intensity. */
  opensAt: number;
  closesAt: number;
  /** False when the horizon holds nothing worth acting in. */
  hasWindow: boolean;
  /** Plain-language reasons, rendered beneath the band. */
  notes: string[];
  events: MarketEvent[];
}

/**
 * The execution window — the product's core claim, and the thing the
 * signature component draws.
 *
 * It is not a guess dressed up as a range. Four independently documented things
 * are multiplied together across the market's own horizon (`HORIZON_HOURS`):
 *
 *   liquidity  — when this market can actually absorb an order
 *                (see lib/market/sessions.ts)
 *   events     — scheduled releases the signal doesn't claim to predict
 *                (see lib/market/calendar.ts)
 *   decay      — the strategy's own half-life, so the window closes when the
 *                edge does
 *   dissent    — how split the rules are, which shortens that half-life,
 *                because a contested edge is a shorter one
 *
 * The band's density ramp *is* that product. It rises to a crest and falls
 * away rather than sitting as a hard rectangle, because "Thursday late
 * morning" is genuinely a soft-shouldered claim and drawing it as a fence
 * would overstate what the model knows.
 */
export function computeWindow({
  now,
  symbol,
  market,
  exchange,
  halfLifeDays,
  events = [],
  dissentRatio = 0,
  horizonHours,
}: {
  now: number;
  symbol: string;
  market: MarketKind;
  /**
   * The venue, for equities — so a Tokyo window lands in Tokyo hours.
   *
   * Without this every equity was evaluated against the New York session,
   * which was correct while all seventy-two were American and would have had
   * ember recommending a Toyota fill at a time the exchange is shut.
   */
  exchange?: string;
  /** Half-life of the signal's edge, in days. Drives how fast it closes. */
  halfLifeDays: number;
  /**
   * Share of the voting strategies that dissent from the call, 0…1.
   *
   * Narrows the window rather than being reported beside it — see
   * `MAX_DISSENT_NARROWING`.
   */
  dissentRatio?: number;
  events?: readonly MarketEvent[];
  /** Overrides the market's own horizon. Only tests and the asset page pass it. */
  horizonHours?: number;
}): ExecutionWindow {
  const span = horizonHours ?? HORIZON_HOURS[market];
  const from = now;
  const to = now + span * HOUR;

  const dissent = clampUnit(dissentRatio);
  // A contested call has to clear a higher bar before an hour counts as "in the
  // window". 0.5 unanimous, up to 0.8 fully split.
  const threshold =
    WINDOW_THRESHOLD + (1 - WINDOW_THRESHOLD) * MAX_DISSENT_TIGHTENING * dissent;

  const decayPerHour = Math.log(2) / (halfLifeDays * 24);

  const raw: WindowSample[] = [];
  let peakRaw = 0;

  for (let h = 0; h < span; h++) {
    const t = from + h * HOUR;
    const liquidity = liquidityAt(t, market, exchange);

    // A closed market is a hard exclusion, not a low score — no amount of
    // signal decay makes 3am on a Sunday a good time to fill an equity order.
    const intensity =
      liquidity === 0
        ? 0
        : liquidity * eventMask(t, symbol, market, events) * Math.exp(-decayPerHour * h);

    raw.push({ t, intensity });
    if (intensity > peakRaw) peakRaw = intensity;
  }

  const horizonEvents = eventsWithin(from, to, symbol, market, events);

  if (peakRaw <= 0) {
    return {
      from,
      to,
      curve: raw,
      peakAt: from,
      opensAt: from,
      closesAt: from,
      hasWindow: false,
      notes: [
        `The market is closed for the next ${describeSpan(span)}.`,
      ],
      events: horizonEvents,
    };
  }

  const curve = raw.map((s) => ({ t: s.t, intensity: s.intensity / peakRaw }));
  const peakIndex = curve.reduce(
    (best, s, i) => (s.intensity > curve[best].intensity ? i : best),
    0,
  );

  // Expand outward from the crest while the band stays above the threshold.
  // Stopping at the first dip is deliberate: a second, later peak is a
  // different window, and merging them would claim a continuity that isn't
  // there.
  let open = peakIndex;
  while (open > 0 && curve[open - 1].intensity >= threshold) open--;

  let close = peakIndex;
  while (close < curve.length - 1 && curve[close + 1].intensity >= threshold) {
    close++;
  }

  return {
    from,
    to,
    curve,
    peakAt: curve[peakIndex].t,
    opensAt: curve[open].t,
    closesAt: sessionBoundedEnd(curve[close].t, market, exchange),
    hasWindow: true,
    notes: buildNotes({
      market,
      peakAt: curve[peakIndex].t,
      halfLifeDays,
      narrowed: dissent > 0.15,
      events: horizonEvents,
    }),
    events: horizonEvents,
  };
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * The end of the last good hour, but never past the closing bell.
 *
 * Samples are hourly from `now`, so they sit at an arbitrary offset within
 * the session — a bucket starting at 15:46 runs to 16:46, three quarters of
 * an hour after US equities close. Telling someone their window stays open
 * until 16:46 when the exchange shuts at 16:00 is exactly the kind of
 * plausible-looking wrongness this app cannot afford, so the end is clipped
 * to the session it falls in.
 */
function sessionBoundedEnd(
  lastGoodSample: number,
  market: MarketKind,
  exchange?: string,
): number {
  const naive = lastGoodSample + HOUR;
  const STEP = 5 * 60_000;

  for (let t = lastGoodSample + STEP; t <= naive; t += STEP) {
    if (liquidityAt(t, market, exchange) === 0) return t - STEP;
  }
  return naive;
}

/**
 * Why this window and not another.
 *
 * Each note names a real constraint that shaped the curve. If the model can't
 * say why, it shouldn't be drawing a window.
 */
/**
 * A title-cased label dropped into the middle of a sentence.
 *
 * Sentence case is the house style, but blanket `.toLowerCase()` produces
 * "clear of cpi release" — an acronym in lower case reads as a typo and
 * quietly undermines the analyst register the copy depends on. Acronyms keep
 * their capitals; ordinary words don't.
 */
function inSentence(label: string): string {
  const first = label.split(" ")[0];
  if (first.length > 1 && first === first.toUpperCase()) return label;
  return label.charAt(0).toLowerCase() + label.slice(1);
}

function buildNotes({
  market,
  peakAt,
  halfLifeDays,
  narrowed,
  events,
}: {
  market: MarketKind;
  peakAt: number;
  halfLifeDays: number;
  narrowed: boolean;
  events: readonly MarketEvent[];
}): string[] {
  const notes: string[] = [];

  if (market === "equity") {
    const t = zonedTime(peakAt, "America/New_York");
    if (t.minutes >= 14 * 60 + 30) {
      notes.push("Trading is deepest into the New York close.");
    } else if (t.minutes >= 10 * 60 && t.minutes < 12 * 60) {
      notes.push("Prices settle after the opening auction.");
    } else {
      notes.push("The deepest trading of the session.");
    }
  } else if (market === "fx") {
    const t = zonedTime(peakAt, "UTC");
    if (t.hour >= 13 && t.hour < 17) {
      notes.push("London and New York overlap, with the tightest spreads of the day.");
    } else if (t.hour >= 7 && t.hour < 13) {
      notes.push("London hours, before New York trading thins out.");
    } else {
      notes.push("The deepest trading before the New York close.");
    }
  } else {
    const t = zonedTime(peakAt, "UTC");
    const weekend = t.weekday === 0 || t.weekday === 6;
    notes.push(
      weekend
        ? "Weekend trading is thin; this is its deepest point."
        : "European and US hours overlap, when trading is deepest.",
    );
  }

  if (events.length > 0) {
    const next = events[0];
    notes.push(
      `Avoids ${inSentence(EVENT_LABELS[next.kind])}, which the signal doesn't predict.`,
    );
  }

  /**
   * Rounded for the sentence, because the effective half-life is now a product
   * of the strategies' number and the dissent narrowing — "a 2.3-day half-life"
   * is false precision in a line of prose.
   */
  const days = Math.max(1, Math.round(halfLifeDays));
  if (halfLifeDays <= 3.5) {
    notes.push(
      `The signal fades fast (a ${days === 1 ? "one-day" : `${days}-day`} half-life), so the window is short.`,
    );
  } else if (halfLifeDays >= 60) {
    notes.push("A slow signal. The timing here is about execution, not urgency.");
  }

  // Said plainly, because a narrower window with no stated reason reads as the
  // model being twitchy rather than as the rules being split.
  if (narrowed) {
    notes.push(
      "The rules disagree, so the window is limited to the best hours.",
    );
  }

    // No "Open now." note: the band's own scale already says so.


  return notes;
}
