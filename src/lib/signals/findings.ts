import type { Candle, Instrument, MarketKind, RiskProfile } from "@/lib/api/types";
import type { MarketEvent } from "@/lib/market/calendar";
import { clamp } from "./indicators/stats";
import { isReady, qualifies, type Assessment } from "./ensemble";
import { evaluateExposure, type HeldExposure, type RiskSignal } from "./exposure";

/**
 * A finding is the unit ember traffics in.
 *
 * v1's unit was an "actionable assessment", which could only ever be an
 * invitation to buy or sell — the product was a browser of engine output and
 * the noun matched. An alpha finder deals in two things and they are the same
 * kind of object: *here is something worth doing* and *here is something you
 * already hold that has stopped working*. Both come to you, both carry a size
 * and a stop, both can be dismissed, both can be alerted on.
 *
 * Opportunities come from the whole universe. Risks come only from what you
 * hold, because a "risk" on an instrument you don't own is just a sell signal
 * with no one to address it to.
 */

export type FindingKind = "opportunity" | "risk";

export interface Finding {
  /**
   * `kind:symbol` — stable across cycles, which matters because it is what the
   * alert log and the handled store key on.
   *
   * Deliberately not an id off the assessment: `assess()` restamps `createdAt`
   * every cycle, so there is no stable assessment identity to borrow (decision
   * 026). Deliberately *including* kind: a risk and an opportunity can be live
   * on the same symbol at once — a watch on an upcoming event while the read
   * still says accumulate — and one must not silently overwrite the other in
   * the log. (A risk that sells suppresses the opportunity; decision 306.)
   */
  id: string;
  kind: FindingKind;
  symbol: string;
  market: MarketKind;
  /** One line. The card's title and the notification's title. */
  headline: string;
  /** A sentence or two under it. */
  detail: string;
  /** 0…1, and the only thing the inbox sorts on. */
  urgency: number;
  /** The window is open at `createdAt`. */
  ready: boolean;
  /**
   * When the window opens, on an opportunity that isn't ready yet.
   *
   * This is the differentiator v1 suppressed: "found it — Thursday morning"
   * is the sentence no competitor writes, and the old actionability predicate
   * threw the call away rather than saying it.
   */
  opensAt: number | null;
  /** Whether the user holds it. Changes what a Buy means and is shown. */
  held: boolean;
  /** Whether it's on the watchlist. Nudges ranking; always shown. */
  watched: boolean;
  assessment: Assessment;
  /** Risk findings only. */
  risk: RiskSignal | null;
  createdAt: number;
}

export interface FindingsInput {
  assessments: readonly Assessment[];
  riskProfile: RiskProfile;
  /** Derived positions. Never the transaction log — see ADR 0025. */
  positions: readonly HeldExposure[];
  /** Null means "following everything" — the watchlist sentinel (decision 023). */
  watching: readonly string[] | null;
  /** Candles per symbol, for the ATR the entry stop is measured in. */
  candles: ReadonlyMap<string, readonly Candle[]>;
  /** Instruments by symbol, for quoting prices the risk copy prints. */
  instruments: ReadonlyMap<string, Instrument>;
  /** Reconstructed entry reads, per symbol, where history allowed one. */
  entryAssessments?: ReadonlyMap<string, Assessment>;
  events?: readonly MarketEvent[];
  now: number;
}

/**
 * Everything worth telling the user right now, worst and best first.
 *
 * Pure, so the whole ranking is testable without a server, a store or a clock.
 */
export function buildFindings({
  assessments,
  riskProfile,
  positions,
  watching,
  candles,
  instruments,
  entryAssessments,
  events = [],
  now,
}: FindingsInput): Finding[] {
  const held = new Map(positions.map((p) => [p.symbol, p]));
  const followed = watching === null ? null : new Set(watching);
  const findings: Finding[] = [];

  for (const assessment of assessments) {
    const { symbol } = assessment;
    const position = held.get(symbol) ?? null;
    const watched = followed === null || followed.has(symbol);

    /* ── Risk ────────────────────────────────────────────────────────────
       One finding per position, carrying its worst signal, not one per
       trigger. Three rows about the same holding is a wall rather than a
       warning, and the second-worst thing about a position is not a separate
       decision — the card lists the rest underneath. */

    const instrument = instruments.get(symbol);
    let overridden = false;

    if (position && instrument) {
      const signals = evaluateExposure({
        position,
        instrument,
        assessment,
        candles: candles.get(symbol) ?? [],
        entryAssessment: entryAssessments?.get(symbol) ?? null,
        riskProfile,
        events,
        now,
      });

      const worst = signals[0];
      if (worst) {
        // A risk that sells and a read that buys are one decision about one
        // position, so they are one row. Shown as two, Home told somebody to
        // close ETH directly above "Buy ETH", each with its own stop.
        overridden = worst.action.sellFraction > 0;
        const leansBuy = overridden && assessment.score > 0 && qualifies(assessment, riskProfile);
        findings.push({
          id: `risk:${symbol}`,
          kind: "risk",
          symbol,
          market: assessment.market,
          headline: worst.headline,
          detail: leansBuy
            ? `${worst.detail} ember's read on ${symbol} still leans buy, but this comes first, so it isn't suggesting you add to it.`
            : worst.detail,
          urgency: worst.urgency,
          // A risk is always ready. It is a statement about a position you
          // already have, not an invitation to open one — there is nothing to
          // route into a liquidity window and nothing to wait for.
          ready: true,
          opensAt: null,
          held: true,
          watched,
          assessment,
          risk: worst,
          createdAt: now,
        });
      }
    }

    /* ── Opportunity ─────────────────────────────────────────────────────
       A sell or reduce on something held is already the risk finding above —
       emitting it twice would put the same decision on the screen in two
       voices. On something *not* held it is still real information (don't buy
       this), and the feed keeps showing it; the inbox does not, because there
       is nothing for the user to do about an instrument they have never
       owned.

       A buy on a position ember has just told you to cut is not shown either:
       the risk row above says the read still leans buy, and that the position
       comes first. */

    if (overridden) continue;
    if (!qualifies(assessment, riskProfile)) continue;
    if (assessment.score <= 0) continue;

    const ready = isReady(assessment, now);

    findings.push({
      id: `opportunity:${symbol}`,
      kind: "opportunity",
      symbol,
      market: assessment.market,
      headline: `${assessment.action === "buy" ? "Buy" : "Accumulate"} ${symbol}${position ? ", adding to what you hold" : ""}`,
      detail: assessment.summary,
      urgency: opportunityUrgency(assessment, watched, followed !== null),
      ready,
      opensAt: ready || !assessment.window.hasWindow ? null : assessment.window.opensAt,
      held: position !== null,
      watched,
      assessment,
      risk: null,
      createdAt: now,
    });
  }

  return findings.sort(rank);
}

/**
 * Worst-and-best first, with risk winning a tie.
 *
 * Not "all risks, then all opportunities". A token-unlock watch on 12% of the
 * book does not belong above a high-conviction buy with the window open now,
 * and sorting by kind would put it there every time. Urgency is comparable
 * across both kinds by construction — that is the whole reason both sides
 * produce one.
 */
function rank(a: Finding, b: Finding): number {
  if (b.urgency !== a.urgency) return b.urgency - a.urgency;
  if (a.kind !== b.kind) return a.kind === "risk" ? -1 : 1;
  return a.symbol.localeCompare(b.symbol);
}

/**
 * How loudly an opportunity asks to be looked at.
 *
 * Conviction scaled by the engine's own confidence, which lands in roughly
 * 10–55 rather than 0–100 (CLAUDE.md §8) — hence the 0.4 floor on the
 * multiplier, so a well-evidenced 0.6 outranks a barely-trusted 0.9 without
 * the whole scale collapsing toward zero.
 *
 * A watched instrument gets a small nudge, and only when the user has actually
 * curated a list. While the watchlist holds its "following everything"
 * sentinel every instrument is watched, and a bonus applied to all of them is
 * a bonus applied to none.
 */
function opportunityUrgency(
  assessment: Assessment,
  watched: boolean,
  curated: boolean,
): number {
  const base = Math.abs(assessment.score) * (0.4 + assessment.confidence / 100);
  return clamp(base + (curated && watched ? 0.05 : 0), 0, 1);
}
