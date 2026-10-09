import type { Candle, Instrument, RiskProfile } from "@/lib/api/types";
import { RISK_PROFILES } from "@/lib/api/types";
import { EVENT_LABELS, eventsWithin, type MarketEvent } from "@/lib/market/calendar";
import { describeHorizon, formatQuotePrice } from "@/lib/market/format";
import { clamp, latest } from "./indicators/stats";
import { atr } from "./indicators/volatility";
import type { Assessment, Contribution } from "./ensemble";
import type { Citation } from "./types";

/**
 * The loss-prevention half of the product.
 *
 * v1 had none of this. `assess()` takes candles and a risk profile and has no
 * idea what you own, so every read was addressed to a hypothetical new buyer:
 * the stop it computes sits 2.5 ATR below *last close* for a position opened
 * today, and on a `reduce` it sits *above* price — which is a short-side stop,
 * not a loss stop on the long you actually hold. There was no drawdown from
 * your entry, no notion that the regime had turned since you bought, and
 * nothing that could ever say "this one has stopped working, here's how much
 * to take off."
 *
 * Everything here is pure and takes the position as an argument, so ownership
 * enters at the API boundary and the engine stays out of the browser bundle
 * (CLAUDE.md §4). Every trigger is mechanical, measured against a number the
 * user can check, and carries a citation — the same bar the opportunity side
 * has always had to clear.
 *
 * **Every signal carries a sized action.** `reduceTo()` below is the single
 * rule behind all of them: *reduce to the weight ember would hold today*. A
 * bare "sell" is not advice, and a made-up "halve it" is worse — it looks like
 * a calculation and isn't one.
 */

export type RiskTrigger =
  | "stop-breached"
  | "thesis-decay"
  | "regime-flip"
  | "drawdown"
  | "concentration"
  | "event-risk";

/**
 * Three levels, and the words are chosen to be honest about what they claim.
 *
 * `critical` means a rule the user agreed to has already been broken.
 * `warning` means the case for holding has weakened materially.
 * `watch` means something is scheduled or building that isn't a problem yet.
 */
export type RiskSeverity = "critical" | "warning" | "watch";

/** What the user actually holds, derived from the ledger — never the ledger itself. */
export interface HeldExposure {
  symbol: string;
  quantity: number;
  /** Average cost per unit, in the instrument's own quote currency. */
  averageCost: number;
  /** Epoch millis of the first trade that opened this exposure. */
  openedAt: number;
  /** Share of your portfolio by market value, 0…1. */
  weight: number;
}

export interface RiskAction {
  /** Imperative and specific: "Reduce to 8% of your portfolio". */
  label: string;
  /** Fraction of *this position* to sell, 0…1. */
  sellFraction: number;
  /** Units implied, in the instrument's own quantity terms. */
  quantity: number;
  /** Book weight the position would be left at. */
  targetWeight: number;
  /** Why that size and not another. */
  note: string;
}

export interface RiskSignal {
  trigger: RiskTrigger;
  severity: RiskSeverity;
  /** One line carrying the number that fired it. */
  headline: string;
  /** What it means for this position, in plain English. */
  detail: string;
  action: RiskAction;
  citation: Citation;
  /** 0…1. Ranks risk signals against each other and against opportunities. */
  urgency: number;
}

/* ── Citations ─────────────────────────────────────────────────────────────
   Same rule as the strategies: if it can't be cited, it doesn't ship. These
   are the sources for the *risk* rules specifically — the thesis-decay signal
   borrows the citation of whichever strategy actually flipped, because that is
   the claim which stopped holding. */

const WILDER: Citation = {
  authors: "Wilder, J. W.",
  year: 1978,
  title: "New Concepts in Technical Trading Systems",
  where: "Trend Research",
  claim:
    "Average true range measures a security's own normal daily movement, so a stop placed a fixed number of ATRs away risks the same amount across instruments of wildly different volatility.",
};

const ODEAN: Citation = {
  authors: "Odean, T.",
  year: 1998,
  title: "Are Investors Reluctant to Realize Their Losses?",
  where: "The Journal of Finance 53(5)",
  claim:
    "Individual investors sell winners at a far higher rate than losers, and the losers they keep go on to underperform the winners they sold.",
};

const ANG_BEKAERT: Citation = {
  authors: "Ang, A. & Bekaert, G.",
  year: 2002,
  title: "International Asset Allocation With Regime Shifts",
  where: "The Review of Financial Studies 15(4)",
  claim:
    "Markets switch between a calm regime and a volatile bear regime in which volatility and correlations both rise, so diversification weakens exactly when it is needed most.",
};

const KELLY: Citation = {
  authors: "Kelly, J. L.",
  year: 1956,
  title: "A New Interpretation of Information Rate",
  where: "Bell System Technical Journal 35(4)",
  claim:
    "There is a position size that maximises long-run growth, and betting above it lowers growth even when the edge is real: over-sizing a good idea is still a mistake.",
};

const SAVOR_WILSON: Citation = {
  authors: "Savor, P. & Wilson, M.",
  year: 2016,
  title: "Earnings Announcements and Systematic Risk",
  where: "Journal of Financial Economics 121(2)",
  claim:
    "Announcement days carry markedly higher return variance and a distinct risk premium, so exposure held into one is a different bet from exposure held around it.",
};

/* ── Sizing the response ───────────────────────────────────────────────── */

/**
 * The one sizing rule behind every signal here: reduce to what ember would
 * hold today.
 *
 * Anything else would be invented. "Halve it" is a number with no derivation;
 * "sell" ignores that a weakened thesis is not always a dead one. The target
 * comes from the same `sizePosition` output the opportunity side uses, so the
 * two halves of the product agree about how big this position should be.
 */
function reduceTo(
  position: HeldExposure,
  targetWeight: number,
  note: string,
): RiskAction {
  const target = clamp(targetWeight, 0, position.weight);
  const sellFraction =
    position.weight <= 0 ? 1 : clamp(1 - target / position.weight, 0, 1);

  return {
    label:
      target <= 0
        ? "Close the position"
        : `Reduce to ${(target * 100).toFixed(1)}% of your portfolio`,
    sellFraction,
    quantity: position.quantity * sellFraction,
    targetWeight: target,
    note,
  };
}

/**
 * The weight ember's *current* read supports for this position.
 *
 * Zero when today's read is a reduce, a sell, or a hold — a hold means the
 * evidence no longer justifies the exposure, not that the exposure is fine.
 * That is a deliberately strict reading and it is the conservative direction
 * to be strict in.
 */
function supportedWeight(assessment: Assessment): number {
  if (assessment.score <= 0 || !assessment.sizing) return 0;
  return assessment.sizing.weight;
}

/* ── The evaluation ────────────────────────────────────────────────────── */

export interface ExposureInput {
  position: HeldExposure;
  /**
   * The instrument, for its currency and quoting precision.
   *
   * A price level printed into prose has to look like a price. The first cut
   * of this derived decimals from magnitude and printed "a stop at 40.64",
   * which in a sentence reads as a ratio rather than as forty dollars sixty
   * — and it would have rendered a JPY cross to five places. `Instrument`
   * already travels with every `StrategyContext`, so carrying it here is no
   * new coupling, and `formatQuotePrice` is the same pinned-locale formatter
   * every screen uses (ADR 0016).
   */
  instrument: Instrument;
  /** Today's read on the instrument. */
  assessment: Assessment;
  /** Daily bars, oldest first — the same slice `assess()` saw. */
  candles: readonly Candle[];
  /**
   * The read as it stood when the position was opened, if it can be
   * reconstructed.
   *
   * Optional because a position bought before ember existed, or one whose
   * entry predates the available history, has no entry read — and refusing to
   * evaluate those would mean the risk engine ignored the oldest positions,
   * which are the ones most likely to have drifted. Every trigger below works
   * without it; two of them get sharper wording when it's there.
   */
  entryAssessment?: Assessment | null;
  riskProfile: RiskProfile;
  events?: readonly MarketEvent[];
  now: number;
}

/**
 * Every way this position is currently exposed, worst first.
 *
 * Returns an empty array for a healthy position, which is the common case and
 * must stay cheap to say — a risk engine that always finds something is a
 * scaremonger, and the user learns to ignore it within a week.
 */
export function evaluateExposure({
  position,
  instrument,
  assessment,
  candles,
  entryAssessment = null,
  riskProfile,
  events = [],
  now,
}: ExposureInput): RiskSignal[] {
  const signals: RiskSignal[] = [];

  // A closed or nonsensical position has no exposure to evaluate. `averageCost`
  // of zero happens on a fully-clamped imported ledger (CLAUDE.md §8) and would
  // turn every percentage below into a division by zero.
  if (position.quantity <= 0 || position.averageCost <= 0) return signals;

  const profile = RISK_PROFILES[riskProfile];
  const price = assessment.price;
  const pnl = (price - position.averageCost) / position.averageCost;
  const supported = supportedWeight(assessment);

  /* ── 1. The stop, measured from the entry the user actually has ──────────
     This is the signal v1 could not produce. `sizing.stopPrice` is anchored to
     last close for a hypothetical new position; the only stop that means
     anything to someone already holding is one measured from what they paid. */

  const range = latest(atr(candles, 20));
  const stopMultiple = assessment.sizing?.stopMultiple ?? 2.5;
  const stopPrice = range === null ? null : position.averageCost - stopMultiple * range;
  const stopBreached = stopPrice !== null && price <= stopPrice;

  if (stopBreached && stopPrice !== null && range !== null) {
    const through = (stopPrice - price) / range;
    signals.push({
      trigger: "stop-breached",
      severity: "critical",
      headline: `Through its stop, ${formatSigned(pnl)} from an average cost of ${formatQuotePrice(instrument, position.averageCost)}`,
      detail: `Your ${stopMultiple.toFixed(1)} ATR stop is at ${formatQuotePrice(instrument, stopPrice)} and the price is ${through < 0.25 ? "just " : ""}below it. The position now risks more than it was sized for.`,
      action: reduceTo(
        position,
        0,
        "Holding past the stop turns a planned loss into an open-ended one.",
      ),
      citation: WILDER,
      urgency: clamp(0.9 + through * 0.05, 0.9, 1),
    });
  }

  /* ── 2. Thesis decay ─────────────────────────────────────────────────────
     The rules that argued for this position have stopped arguing for it. With
     an entry read we can name which ones flipped; without one, a qualifying
     reduce-or-sell on something held is the same finding stated more coarsely,
     and it would be perverse to withhold it for want of history. */

  const flipped = entryAssessment
    ? flippedContributions(entryAssessment.contributions, assessment.contributions)
    : [];
  const flippedShare = flipped.reduce((acc, c) => acc + c.entryWeight, 0);

  if (flipped.length > 0 && (flipped.length >= 2 || flippedShare >= 0.35)) {
    const names = flipped.slice(0, 2).map((c) => c.name);
    signals.push({
      trigger: "thesis-decay",
      severity: flippedShare >= 0.6 ? "critical" : "warning",
      headline: `${names.join(" and ")} ${names.length > 1 ? "have" : "has"} turned against this since you opened it`,
      // The rule's own working (R², an annualised slope) goes behind Details
      // with the sizing note. In the visible line it was jargon on the row a
      // reader acts from.
      detail: `${(flippedShare * 100).toFixed(0)}% of the weight behind the original read now points the other way.`,
      action: reduceTo(
        position,
        supported,
        `${
          supported > 0
            ? "Sized on what still supports the position, not on what did when you bought it."
            : "Nothing in today's read supports holding this at any size."
        } ${flipped[0].rationale}`,
      ),
      citation: flipped[0].citation,
      urgency: clamp(0.6 + flippedShare * 0.25, 0.6, 0.88),
    });
  } else if (
    (assessment.action === "sell" || assessment.action === "reduce") &&
    Math.abs(assessment.score) >= profile.actionThreshold &&
    assessment.confidence >= profile.confidenceFloor
  ) {
    signals.push({
      trigger: "thesis-decay",
      severity: assessment.action === "sell" ? "critical" : "warning",
      headline: `Today's read on ${position.symbol} is ${assessment.action === "sell" ? "Sell" : "Reduce"}, and you hold it`,
      detail: `${assessment.summary} ${assessment.detail}`,
      action: reduceTo(
        position,
        supported,
        "Sized to what today's read supports, which on a negative score is nothing.",
      ),
      citation: assessment.contributions[0]?.citation ?? ODEAN,
      urgency: clamp(0.55 + Math.abs(assessment.score) * 0.3, 0.55, 0.85),
    });
  }

  /* ── 3. Regime flip ──────────────────────────────────────────────────── */

  const regime = assessment.regime;
  const hostile = regime.vol === "stressed" && regime.trend === "downtrend";
  const wasHostile =
    entryAssessment !== null &&
    entryAssessment.regime.vol === "stressed" &&
    entryAssessment.regime.trend === "downtrend";

  if (hostile && !wasHostile) {
    signals.push({
      trigger: "regime-flip",
      severity: "warning",
      headline: `${position.symbol} is in a stressed downtrend${entryAssessment ? `, which it wasn't when you opened this` : ""}`,
      detail: `${regime.summary} Most strategies struggle in this kind of market, so your reason for holding is under strain.`,
      action: reduceTo(
        position,
        supported,
        "The regime filter already damps what ember would size here; this brings the position you hold in line with it.",
      ),
      citation: ANG_BEKAERT,
      urgency: 0.62,
    });
  }

  /* ── 4. Drawdown from entry ──────────────────────────────────────────────
     Skipped when the stop already fired. Both would be describing the same
     loss, and the stop is the sharper statement of it — a second row saying
     "also, you are down" is noise on a card that needs to be acted on. */

  const band = drawdownBand(riskProfile);

  if (!stopBreached && pnl <= -band) {
    const depth = clamp(-pnl / band - 1, 0, 1);
    signals.push({
      trigger: "drawdown",
      severity: -pnl >= band * 2 ? "critical" : "warning",
      headline: `Down ${formatSigned(pnl)} from your entry`,
      detail: `Your ${profile.label.toLowerCase()} profile treats a ${(band * 100).toFixed(0)}% loss as the point to decide again. ember isn't saying the position is wrong, only that keeping it should be a choice, not a default.`,
      action: reduceTo(
        position,
        supported,
        supported > 0
          ? "Today's read still supports part of this. The rest is exposure the evidence has stopped paying for."
          : "Today's read supports none of this position at its current size.",
      ),
      citation: ODEAN,
      urgency: clamp(0.45 + depth * 0.3, 0.45, 0.75),
    });
  }

  /* ── 5. Concentration ────────────────────────────────────────────────── */

  if (position.weight > profile.maxWeight * 1.25) {
    const overshoot = position.weight / profile.maxWeight - 1;
    signals.push({
      trigger: "concentration",
      severity: position.weight > profile.maxWeight * 2 ? "warning" : "watch",
      headline: `${(position.weight * 100).toFixed(1)}% of your portfolio, against a ${(profile.maxWeight * 100).toFixed(0)}% cap`,
      detail: `Your ${profile.label.toLowerCase()} profile caps a single position at ${(profile.maxWeight * 100).toFixed(0)}%. ${pnl > 0 ? `This one has run ${formatSigned(pnl)} and grown past it on its own` : "This one is over the cap"}: a large position you never chose to size that way.`,
      action: reduceTo(
        position,
        profile.maxWeight,
        `Back to your profile's cap. The position may be right, but ${(position.weight * 100).toFixed(1)}% of your portfolio in one name is a risk of its own.`,
      ),
      citation: KELLY,
      urgency: clamp(0.35 + overshoot * 0.2, 0.35, 0.6),
    });
  }

  /* ── 6. Event risk ───────────────────────────────────────────────────── */

  const horizonEvents = eventsWithin(
    now,
    now + assessment.window.to - assessment.window.from,
    position.symbol,
    assessment.market,
    events,
  );

  if (horizonEvents.length > 0 && position.weight > profile.maxWeight * 0.75) {
    const next = horizonEvents[0];
    signals.push({
      trigger: "event-risk",
      severity: "watch",
      headline: `${EVENT_LABELS[next.kind]} inside ${describeHorizon(assessment.window)}, on ${(position.weight * 100).toFixed(1)}% of your portfolio`,
      detail: `No ember strategy predicts scheduled announcements, so trade windows avoid them. You can hold through one, but no signal here supports it.`,
      action: reduceTo(
        position,
        profile.maxWeight * 0.75,
        "Trims below your profile's cap so the announcement can't do outsized damage.",
      ),
      citation: SAVOR_WILSON,
      urgency: 0.3,
    });
  }

  return signals.sort((a, b) => b.urgency - a.urgency);
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

/**
 * How far a position may fall from entry before it is worth re-deciding.
 *
 * A judgement call, stated openly rather than buried, and scaled the way the
 * rest of the profile is: a conservative investor asked for a shorter leash.
 * These are not fitted parameters and must never be presented as estimated.
 */
function drawdownBand(riskProfile: RiskProfile): number {
  switch (riskProfile) {
    case "conservative":
      return 0.08;
    case "balanced":
      return 0.12;
    case "aggressive":
      return 0.18;
  }
}

interface FlippedContribution {
  strategyId: string;
  name: string;
  rationale: string;
  citation: Citation;
  /** The share of the *entry* blend this rule carried. */
  entryWeight: number;
}

/**
 * Rules that argued for the position at entry and argue against it now.
 *
 * Matched by `strategyId`, and it has to be: the contribution lists are sorted
 * by weight and a strategy that fell from first to fifth would otherwise be
 * compared against a different rule entirely.
 */
function flippedContributions(
  entry: readonly Contribution[],
  current: readonly Contribution[],
): FlippedContribution[] {
  const now = new Map(current.map((c) => [c.strategyId, c]));

  return entry
    .filter((before) => before.score >= 0.1)
    .map((before) => ({ before, after: now.get(before.strategyId) }))
    .filter((pair) => pair.after !== undefined && pair.after.score <= -0.1)
    .map(({ before, after }) => ({
      strategyId: before.strategyId,
      name: before.name,
      rationale: after!.rationale,
      citation: before.citation,
      entryWeight: before.weight,
    }))
    .sort((a, b) => b.entryWeight - a.entryWeight);
}

function formatSigned(fraction: number): string {
  return `${fraction >= 0 ? "+" : "−"}${Math.abs(fraction * 100).toFixed(1)}%`;
}
