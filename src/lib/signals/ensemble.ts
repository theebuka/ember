import type { AdviceAction, MarketKind, RiskProfile } from "@/lib/api/types";
import { RISK_PROFILES } from "@/lib/api/types";
import type { MarketEvent } from "@/lib/market/calendar";
import { clamp, latest } from "./indicators/stats";
import { atr } from "./indicators/volatility";
import { detectRegime, regimeWeight, type Regime } from "./regime";
import { sizePosition, type PositionSize } from "./sizing";
import { strategiesFor } from "./strategies";
import { annualisedVol } from "./strategies/shared";
import type {
  Citation,
  Strategy,
  StrategyContext,
  StrategyFamily,
  StrategyId,
  StrategySignal,
} from "./types";
import { computeWindow, type ExecutionWindow } from "./window";

// The action vocabulary itself lives in lib/api/types so the UI can read it
// without importing the engine. Re-exported here because this is where the
// action is decided, and callers of `assess` expect to find it alongside.
export { ACTION_LABELS } from "@/lib/api/types";
export type { AdviceAction } from "@/lib/api/types";

export type Stance = "agrees" | "dissents" | "neutral";

export interface Contribution {
  strategyId: StrategyId;
  name: string;
  family: StrategyFamily;
  /** The strategy's own −1…1 read. */
  score: number;
  /** The strategy's own 0…1 confidence. */
  confidence: number;
  /** Its final share of the blend, 0…1. */
  weight: number;
  rationale: string;
  stance: Stance;
  /**
   * Carried through to the UI so the advice card can show where the rule came
   * from, right beside the number it produced.
   *
   * It travels on the contribution rather than being looked up client-side
   * because components cannot import the engine (CLAUDE.md §4) — and a
   * citation the reader has to go hunting for on another page is most of the
   * way to not having one.
   */
  citation: Citation;
}

export interface Assessment {
  symbol: string;
  market: MarketKind;
  action: AdviceAction;
  /** Blended conviction, −1…1. */
  score: number;
  /** 0…100. */
  confidence: number;
  confidenceLabel: "Low" | "Moderate" | "High";
  /** One sentence naming the agreement structure. */
  summary: string;
  /** The leading contributor's reasoning, verbatim. */
  detail: string;
  contributions: Contribution[];
  agreement: { agrees: number; dissents: number; neutral: number; silent: number };
  regime: Regime;
  sizing: PositionSize | null;
  window: ExecutionWindow;
  /** Weighted holding period implied by the strategies driving the call. */
  horizonDays: number;
  /**
   * Weighted half-life of the driving strategies' edge, in days.
   *
   * Exposed because it is what actually shapes the execution window and nothing
   * outside this function could see it — a band whose steepness comes from a
   * number the rest of the app cannot read is a band nobody can check.
   */
  halfLifeDays: number;
  price: number;
  createdAt: number;
}

/**
 * How much each risk profile leans on each family.
 *
 * A profile that only changed position size would be a label, not a setting.
 * Conservative genuinely prefers slow, fundamentally anchored signals and
 * distrusts dip-buying; aggressive does the opposite. The two produce
 * different books from the same market, which is what the setting promises.
 */
export const PROFILE_WEIGHTS: Record<
  RiskProfile,
  Partial<Record<StrategyFamily, number>>
> = {
  conservative: {
    trend: 1.0,
    momentum: 0.85,
    "mean-reversion": 0.55,
    carry: 0.7,
    value: 1.2,
    quality: 1.25,
    valuation: 1.0,
    // The strongest preference either profile expresses, and the most obviously
    // correct one: a conservative investor asking for less risk per unit of
    // return is asking for precisely the thing this family measures.
    defensive: 1.35,
  },
  balanced: {},
  aggressive: {
    trend: 1.15,
    momentum: 1.2,
    "mean-reversion": 1.15,
    carry: 1.1,
    value: 0.85,
    quality: 0.8,
    valuation: 0.95,
    // Not zero. An aggressive profile takes more risk on purpose; it does not
    // get to pretend the low-beta evidence is absent.
    defensive: 0.6,
  },
};

/** Blended score thresholds. Deliberately wide around zero — see below. */
const THRESHOLDS = { buy: 0.5, accumulate: 0.2, reduce: -0.2, sell: -0.5 };

function actionFor(score: number): AdviceAction {
  if (score >= THRESHOLDS.buy) return "buy";
  if (score >= THRESHOLDS.accumulate) return "accumulate";
  if (score <= THRESHOLDS.sell) return "sell";
  if (score <= THRESHOLDS.reduce) return "reduce";
  return "hold";
}

/**
 * Bands calibrated to the readings this engine actually produces.
 *
 * Confidence here is a product of four terms, each below 1, so it lands in
 * roughly 10–55 in practice rather than spanning the full scale. Bands at
 * 40/70 would make "High" unreachable and label genuinely well-evidenced
 * calls "Low", which misreads the number rather than describing it. The raw
 * value is always shown alongside the word.
 *
 * **The bands are not the feed's thresholds and no longer coincide with them.**
 * They did while Balanced's floor was 35; phase 24's sixteen-rule ensemble
 * shifted the whole distribution down and the floors were re-derived from it
 * (see `RISK_PROFILES`), so every profile now surfaces some calls badged `Low`.
 * That is the honest reading — the label describes the evidence, the floor
 * describes what a profile asked to be shown, and conflating them is what let a
 * fixed floor quietly become the only filter twice.
 */
function confidenceLabel(confidence: number): "Low" | "Moderate" | "High" {
  if (confidence >= 55) return "High";
  if (confidence >= 35) return "Moderate";
  return "Low";
}

/**
 * Run every applicable strategy and combine them into one view.
 *
 * Three things make this an ensemble rather than an average:
 *
 *   - each strategy's weight is its own confidence, scaled by how much this
 *     regime and this risk profile should trust its family;
 *   - disagreement *reduces* the blended confidence rather than cancelling
 *     out silently, so a split verdict reads as a split verdict;
 *   - strategies that decline to speak are counted and reported, because
 *     "four of seven had no view" is information the user should have.
 *
 * Returns null only when the regime itself can't be established — below about
 * a year of history there is no honest read to give.
 */
export function assess({
  context,
  riskProfile,
  events = [],
  strategies,
}: {
  context: StrategyContext;
  riskProfile: RiskProfile;
  events?: readonly MarketEvent[];
  /**
   * Overrides the market's strategy set. Only tests pass this — it exists so
   * the blending, agreement and coverage maths can be verified against known
   * inputs rather than inferred from whatever the real strategies happen to
   * say on a given day.
   */
  strategies?: readonly Strategy[];
}): Assessment | null {
  const { instrument, candles, periodsPerYear, now } = context;

  const regime = detectRegime(candles, periodsPerYear);
  if (!regime) return null;

  const applicable = strategies ?? strategiesFor(instrument.market);
  const profile = RISK_PROFILES[riskProfile];
  const profileWeights = PROFILE_WEIGHTS[riskProfile];

  const scored: {
    signal: StrategySignal;
    family: StrategyFamily;
    name: string;
    citation: Citation;
    weight: number;
  }[] = [];
  let silent = 0;

  for (const strategy of applicable) {
    if (candles.length < strategy.minBars) {
      silent++;
      continue;
    }

    const signal = strategy.evaluate(context);
    if (!signal) {
      silent++;
      continue;
    }

    const weight =
      signal.confidence *
      regimeWeight(strategy.family, regime) *
      (profileWeights[strategy.family] ?? 1);

    scored.push({
      signal,
      family: strategy.family,
      name: strategy.name,
      citation: strategy.citation,
      weight,
    });
  }

  if (scored.length === 0) return null;

  const totalWeight = scored.reduce((acc, s) => acc + s.weight, 0);
  if (totalWeight === 0) return null;

  const blended = scored.reduce((acc, s) => acc + s.signal.score * s.weight, 0) / totalWeight;

  // Weighted dispersion of views. High dispersion means the strategies are
  // genuinely split, and the output should say so rather than presenting the
  // midpoint as a confident answer.
  const variance =
    scored.reduce((acc, s) => acc + s.weight * (s.signal.score - blended) ** 2, 0) /
    totalWeight;
  const dispersion = Math.sqrt(variance);
  const agreementFactor = clamp(1 - dispersion, 0.25, 1);

  /**
   * Confidence is measured over the strategies that actually have a view.
   *
   * A strategy reporting "inside its range, nothing to trade" carries a low
   * confidence by design, and averaging that into a call the others are
   * making would penalise the call for the abstention — with eight strategies
   * on an equity, a handful of abstentions used to drag every reading toward
   * the floor. Abstaining still costs coverage below, which is the right
   * place for it to count.
   */
  const voting = scored.filter((s) => Math.abs(s.signal.score) >= 0.1);
  const votingWeight = voting.reduce((acc, s) => acc + s.weight, 0);

  const meanConfidence =
    votingWeight > 0
      ? voting.reduce((acc, s) => acc + s.weight * s.signal.confidence, 0) / votingWeight
      : scored.reduce((acc, s) => acc + s.weight * s.signal.confidence, 0) / totalWeight;

  const coverage = (voting.length || scored.length) / applicable.length;
  const coverageFactor = 0.6 + 0.4 * coverage;

  /**
   * How much this regime and profile back the strategies that spoke.
   *
   * Regime weighting alone only changes strategies' influence *relative to
   * each other* — it cancels out of a weighted mean, so a lone mean-reversion
   * signal in a crash would otherwise carry exactly the confidence it would
   * in a calm uptrend. The filter has to be able to damp absolute conviction,
   * not just reorder opinions.
   *
   * Clamped at 1 so it can only ever veto. A favourable regime is not
   * evidence, and shouldn't manufacture confidence a strategy didn't claim.
   */
  const rawConfidence = scored.reduce((acc, s) => acc + s.signal.confidence, 0);
  const regimeSupport =
    rawConfidence === 0 ? 1 : clamp(totalWeight / rawConfidence, 0.4, 1);

  const confidence = Math.round(
    clamp(meanConfidence * agreementFactor * coverageFactor * regimeSupport, 0, 1) * 100,
  );

  const action = actionFor(blended);

  const contributions: Contribution[] = scored
    .map(({ signal, family, name, citation, weight }) => ({
      strategyId: signal.strategyId,
      name,
      family,
      score: signal.score,
      confidence: signal.confidence,
      weight: weight / totalWeight,
      rationale: signal.rationale,
      stance: stanceOf(signal.score, blended, action),
      citation,
    }))
    .sort((a, b) => b.weight - a.weight);

  const agreement = {
    agrees: contributions.filter((c) => c.stance === "agrees").length,
    dissents: contributions.filter((c) => c.stance === "dissents").length,
    neutral: contributions.filter((c) => c.stance === "neutral").length,
    silent,
  };

  // Urgency comes from the strategies actually driving the call, not from an
  // average across everything including the ones sitting it out. A two-day
  // mean-reversion edge and a six-month trend signal must not produce the
  // same window.
  const drivers = scored.filter((s) => Math.sign(s.signal.score) === Math.sign(blended));
  const driverWeight = drivers.reduce((acc, s) => acc + s.weight * Math.abs(s.signal.score), 0);
  const halfLifeDays =
    driverWeight > 0
      ? drivers.reduce(
          (acc, s) => acc + s.signal.halfLifeDays * s.weight * Math.abs(s.signal.score),
          0,
        ) / driverWeight
      : 30;
  const horizonDays =
    driverWeight > 0
      ? drivers.reduce(
          (acc, s) => acc + s.signal.horizonDays * s.weight * Math.abs(s.signal.score),
          0,
        ) / driverWeight
      : 60;

  /**
   * How split the rules are, as a share of those with a view either way.
   *
   * Measured over `agrees + dissents` rather than over everything, because a
   * strategy sitting the call out is not evidence against it — that already costs
   * coverage, which is the right place for it to count. Zero when nobody spoke
   * either way, since a window cannot be narrowed by an argument nobody had.
   */
  const voices = agreement.agrees + agreement.dissents;
  const dissentRatio = voices > 0 ? agreement.dissents / voices : 0;

  const window = computeWindow({
    now,
    symbol: instrument.symbol,
    market: instrument.market,
    exchange: instrument.exchange,
    halfLifeDays: Math.max(1, halfLifeDays),
    dissentRatio,
    events,
  });

  const price = candles[candles.length - 1].c;
  const range = latest(atr(candles, 20));
  const instrumentVol = annualisedVol(candles, periodsPerYear);

  const sizing =
    action === "hold" || range === null || instrumentVol === null
      ? null
      : sizePosition({
          conviction: Math.abs(blended) * (confidence / 100),
          direction: blended >= 0 ? 1 : -1,
          price,
          atr: range,
          instrumentVol,
          volTarget: profile.volTarget,
          maxWeight: profile.maxWeight,
          horizonDays,
        });

  return {
    symbol: instrument.symbol,
    market: instrument.market,
    action,
    score: blended,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    summary: buildSummary(contributions, agreement, action),
    detail: contributions[0]?.rationale ?? "",
    contributions,
    agreement,
    regime,
    sizing,
    window,
    horizonDays,
    halfLifeDays,
    price,
    createdAt: now,
  };
}

/**
 * Agreement is measured against the *recommended action*, not the raw blend.
 *
 * On a hold there is no direction to agree with, so nobody is dissenting —
 * the split itself is the finding, and `buildSummary` reports it from the raw
 * scores instead.
 */
function stanceOf(score: number, blended: number, action: AdviceAction): Stance {
  if (Math.abs(score) < 0.1) return "neutral";
  if (action === "hold") return "neutral";
  return Math.sign(score) === Math.sign(blended) ? "agrees" : "dissents";
}

/**
 * Up to two strategy names, and whether that reads as singular or plural.
 *
 * The count is the number of names *shown*, not the number that exist — the
 * verb has to agree with the visible subject, so three agreeing strategies
 * rendered as two names still takes a plural verb.
 *
 * Names keep their authored capitalisation. Lower-casing them read fine for
 * "time-series momentum" and mangled everything else: half the set is named
 * after a person or an acronym, and "piotroski f-score" and "connors RSI(2)"
 * in the middle of a sentence read as typos — which is corrosive on a screen
 * whose entire claim is that these are real, citable methods.
 */
function nameList(contributions: readonly Contribution[]): {
  text: string;
  plural: boolean;
} {
  const shown = contributions.slice(0, 2);
  return {
    text: shown.map((c) => c.name).join(" and "),
    plural: shown.length > 1,
  };
}

/**
 * The headline sentence.
 *
 * Names who agrees and who doesn't, because fake unanimity is the tell of a
 * gimmick. The case that matters most is a hold produced *by* disagreement —
 * a genuine standoff between strategies is far more useful to see than
 * "nothing to report", and reading it off the raw scores rather than the
 * stances is what makes that visible.
 */
function buildSummary(
  contributions: readonly Contribution[],
  agreement: Assessment["agreement"],
  action: AdviceAction,
): string {
  if (action === "hold") {
    const up = nameList(contributions.filter((c) => c.score >= 0.1));
    const down = nameList(contributions.filter((c) => c.score <= -0.1));

    if (up.text && down.text) {
      return `${capitalise(up.text)} ${up.plural ? "point" : "points"} up, ${down.text} down. Nothing decisive either way.`;
    }
    return "Nothing here meets the bar in either direction.";
  }

  const agreeing = contributions.filter((c) => c.stance === "agrees");
  const dissenting = contributions.filter((c) => c.stance === "dissents");
  const lead = nameList(agreeing);
  const subject = lead.text || "the blend";

  if (dissenting.length === 0) {
    const others = agreeing.length - 2;
    return others > 0
      ? `${capitalise(subject)} ${lead.plural ? "agree" : "agrees"}, with ${others} more in the same direction.`
      : `${capitalise(subject)} ${lead.plural ? "carry" : "carries"} the call.`;
  }

  const objectors = nameList(dissenting);
  return `${capitalise(subject)} ${lead.plural ? "point" : "points"} this way; ${objectors.text} ${objectors.plural ? "dissent" : "dissents"}.`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Whether the *evidence* clears the user's bar. Nothing about timing.
 *
 * The bar is conviction *and* confidence: a strong score from strategies that
 * barely trust themselves is not a recommendation, and neither is a confident
 * shrug. Everything else stays available on the asset page, where a "hold" is
 * a useful answer to a question the user asked.
 *
 * **Both halves of the bar move with the profile.** The confidence floor was a
 * fixed 35 until the settings screen started showing the counts side by side,
 * at which point all three profiles turned out to surface the identical
 * calls — confidence tops out around 55 in practice, so a shared floor was
 * doing all the filtering and the conviction threshold almost never bit.
 */
export function qualifies(
  assessment: Assessment,
  riskProfile: RiskProfile,
): boolean {
  const { actionThreshold, confidenceFloor } = RISK_PROFILES[riskProfile];
  return (
    assessment.action !== "hold" &&
    Math.abs(assessment.score) >= actionThreshold &&
    assessment.confidence >= confidenceFloor
  );
}

/**
 * Whether the moment to act is *now*. Nothing about conviction.
 *
 * These were one predicate until phase 15, and conflating them was quietly
 * costing the product its differentiator. A finding whose window opens on
 * Thursday is exactly the thing ember exists to tell you — "found it, don't
 * act yet, here's when" — and the old `isActionable` suppressed it by
 * requiring `hasWindow` before a call could surface at all. Worse, `hasWindow`
 * is false only when the market is shut for the entire 72-hour horizon, so the
 * check read as a timing gate while behaving as a market-closed gate: it
 * neither surfaced early findings nor withheld premature ones.
 *
 * Split, each says one true thing. `qualifies` decides what reaches you;
 * `isReady` decides whether the card says *act now* or *opens Thursday*.
 */
export function isReady(assessment: Assessment, now: number): boolean {
  const { hasWindow, opensAt, closesAt } = assessment.window;
  return hasWindow && now >= opensAt && now <= closesAt;
}

