import type { Finding, FindingKind } from "@/lib/api/client";
import { handlingFor, type HandledCall } from "@/store/use-advice-actions";
import { alertedFor, type AlertRecord } from "@/store/use-alert-log";

/**
 * Deciding what to alert on, and when — as pure functions.
 *
 * The timing rules are the interesting part of this feature and the part most
 * likely to be wrong in a way nobody notices, so they live here rather than
 * inside a `useEffect` where they can only be tested by waiting.
 */

/** How late an alert may still fire. */
export const GRACE_MS = 10 * 60_000;

/**
 * The longest a single timer is allowed to run before re-evaluating.
 *
 * A window can be up to 72 hours out, and `setTimeout` will happily accept
 * that — but a laptop that sleeps for six hours wakes with its timers wrong,
 * background tabs are throttled to roughly one tick a minute, and a machine
 * whose clock is corrected mid-wait drifts silently. Re-arming every couple of
 * minutes means the worst case is a short delay rather than a missed alert,
 * and an idle tab costs one comparison a minute.
 */
export const MAX_TIMER_MS = 2 * 60_000;

/**
 * How long a risk alert suppresses a repeat of itself.
 *
 * A risk has no window to expire with — a breached stop is still breached
 * tomorrow — so without a ceiling the user is told once and never again, and
 * a position could sit through a week of deterioration in silence. Twelve
 * hours means at most one reminder a day about the same unresolved thing,
 * which is roughly how often someone would want to be nudged and is well short
 * of nagging.
 */
export const RISK_REPEAT_MS = 12 * 3_600_000;

export interface PendingAlert {
  /** The finding's own id — `kind:symbol`. The log's key. */
  id: string;
  kind: FindingKind;
  symbol: string;
  /** The action, or the risk trigger. What a change in it re-alerts on. */
  signature: string;
  /** The moment being alerted about. `createdAt` for a risk. */
  at: number;
  /** When this stops mattering: the window's close, or a day for a risk. */
  until: number;
}

export interface AlertPlan {
  /** Windows that open later. The soonest of these arms the timer. */
  upcoming: PendingAlert[];
  /** Live now, recently enough to be worth saying. Fire these. */
  due: PendingAlert[];
  /**
   * Open for longer than the grace period.
   *
   * Recorded as seen and never fired. Opening ember at nine in the morning
   * should not produce four notifications about windows that opened
   * overnight — the feed is right there, and a notification's whole claim is
   * that it is telling you something *now*.
   */
  stale: PendingAlert[];
}

/**
 * What to interrupt the user about.
 *
 * **Risk fires on detection, not on a window.** That is the structural change
 * phase 15 needed: a breached stop has no `opensAt` to wait for and no
 * liquidity crest to route into, because there is nothing to enter — the
 * position is already on. Treating it like an opportunity would have delayed
 * every loss warning until the market's deepest hour, which is precisely
 * backwards.
 *
 * The two kinds are also independently switchable. Someone who wants to be
 * told when a position turns against them, and not to be pitched new ideas,
 * is asking for something coherent, and the settings screen offers it.
 */
export function planAlerts({
  findings,
  handled,
  notified,
  now,
  opportunities = true,
  risks = true,
  graceMs = GRACE_MS,
}: {
  findings: readonly Finding[];
  handled: Record<string, HandledCall>;
  notified: Record<string, AlertRecord>;
  now: number;
  /** `notifications.windowOpen`. */
  opportunities?: boolean;
  /** `notifications.riskAlerts`. */
  risks?: boolean;
  graceMs?: number;
}): AlertPlan {
  const plan: AlertPlan = { upcoming: [], due: [], stale: [] };

  for (const finding of findings) {
    const isRisk = finding.kind === "risk";
    if (isRisk ? !risks : !opportunities) continue;

    const signature = isRisk
      ? (finding.risk?.trigger ?? "risk")
      : finding.assessment.action;

    const alert: PendingAlert = isRisk
      ? {
          id: finding.id,
          kind: finding.kind,
          symbol: finding.symbol,
          signature,
          at: finding.createdAt,
          until: now + RISK_REPEAT_MS,
        }
      : {
          id: finding.id,
          kind: finding.kind,
          symbol: finding.symbol,
          signature,
          at: finding.assessment.window.opensAt,
          until: finding.assessment.window.closesAt,
        };

    // An opportunity whose window is over has nothing to say. A risk has no
    // window at all, and `until` is a repeat interval rather than an expiry,
    // so this check would be false for it by construction — guarded anyway
    // rather than relying on that.
    if (!isRisk) {
      if (!finding.assessment.window.hasWindow) continue;
      if (finding.assessment.window.closesAt <= now) continue;
    }

    // Already executed or dismissed. Alerting about a finding the user has
    // dealt with is the fastest way to have notifications switched off.
    if (handlingFor(handled, finding.id, signature, now)) continue;

    // Already told them, and it hasn't changed.
    if (alertedFor(notified, finding.id, signature, now)) continue;

    if (alert.at > now) plan.upcoming.push(alert);
    else if (now - alert.at <= graceMs) plan.due.push(alert);
    else plan.stale.push(alert);
  }

  // Risk before opportunity when both are due, so a stop breach is the first
  // notification the user sees rather than the third. Within a kind, soonest
  // first.
  const byUrgency = (a: PendingAlert, b: PendingAlert) =>
    a.kind !== b.kind ? (a.kind === "risk" ? -1 : 1) : a.at - b.at;

  plan.upcoming.sort((a, b) => a.at - b.at);
  plan.due.sort(byUrgency);

  return plan;
}

/**
 * How long to wait before looking again.
 *
 * One timer for the whole inbox, not one per finding — a hundred instruments
 * would mean a hundred timers to cancel correctly on every refetch, and the
 * one that leaks is the one that fires after the user turned alerts off.
 */
export function timerDelay(
  plan: AlertPlan,
  now: number,
  maxMs = MAX_TIMER_MS,
): number | null {
  const next = plan.upcoming[0];
  if (!next) return null;
  return Math.min(Math.max(next.at - now, 0), maxMs);
}
