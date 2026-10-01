/**
 * The notification inbox — three sources, one list, one unread count.
 *
 * Pure, so the rules that decide what counts as unread can be tested without a
 * browser. Nothing here reaches for a store or a clock it wasn't handed.
 *
 * **Three sources, and they are not the same kind of thing.**
 *
 * An **alert** is an event: ember interrupted you at a moment, about a
 * finding, and that moment is over. It is written by the alert watcher as it
 * fires, so the inbox is a record of what was actually delivered rather than a
 * re-derivation of what might have been — which matters, because the watcher
 * only runs while the app is open and a re-derivation would invent alerts that
 * were never sent.
 *
 * A **broadcast** is a message from us: a release note, a change to the
 * methodology, an outage. It comes from the server so it can reach someone
 * without an app update.
 *
 * A **warning** is neither. It is a *condition* — prices are generated, the
 * ledger is only on this device, alerts are switched off — and conditions
 * cannot be read away. They are true until the thing changes.
 *
 * That distinction is the whole reason the unread count exists in the shape it
 * does: **warnings never count toward it.** A badge that includes a standing
 * condition can never reach zero, and a badge that can never reach zero is one
 * the user learns to ignore within a week — at which point the badge no longer
 * works for the alerts either, which are the ones that expire.
 */

import type { BroadcastPlacement } from "@/lib/admin";

export type NoticeKind = "alert" | "broadcast" | "warning";

/**
 * Only `critical` is tinted, and only ever on an alert.
 *
 * Same rule as the findings inbox (decision 077): a list where everything is
 * coloured says nothing about which item matters, and three coloured levels
 * turn a notification centre into a traffic light.
 */
export type NoticeTone = "neutral" | "critical";

export interface Notice {
  id: string;
  kind: NoticeKind;
  tone: NoticeTone;
  title: string;
  body: string;
  /**
   * Epoch millis — and **0 on a warning**, which is not a placeholder.
   *
   * A warning is a condition rather than an event: "prices are generated" did
   * not happen at a moment, it is simply true, and stamping it with the time
   * the page loaded would put "2 minutes ago" beside a fact that has been true
   * for a year. Nothing renders a time for a warning, nothing sorts them by
   * one, and they are excluded from the unread count — so there is no field
   * here that wants a real value.
   */
  at: number;
  /** Where acting on this leads. Every notice that can be acted on has one. */
  href?: string;
  /** The action's label, when "View" would be vague. */
  action?: string;
}

/** What the watcher writes when it delivers something. */
export interface StoredAlert {
  id: string;
  tone: NoticeTone;
  title: string;
  body: string;
  at: number;
  href?: string;
}

/** What `/api/notices` serves. */
export interface Broadcast {
  id: string;
  title: string;
  body: string;
  /** ISO 8601 — these are authored or stored, never derived from a local clock. */
  publishedAt: string;
  href?: string;
  action?: string;
  /**
   * Where this one shows up besides the notification centre.
   *
   * A placement does not change what the notice *is* — same row, same list, same
   * body. It changes only whether ember interrupts somebody who came to do
   * something else: `card` above the greeting on Home, `bar` across the top of
   * every screen. Both render one at a time, and `inbox` is the default because
   * interrupting is the exception.
   */
  placement?: BroadcastPlacement;
}

export interface Inbox {
  /** Standing conditions, newest first. Never unread, never dismissible. */
  warnings: Notice[];
  /** Events and messages, newest first. */
  history: Notice[];
  /** Events and messages newer than the last time the inbox was opened. */
  unread: number;
}

export function buildInbox({
  alerts,
  broadcasts,
  warnings,
  readAt,
}: {
  alerts: readonly StoredAlert[];
  broadcasts: readonly Broadcast[];
  warnings: readonly Notice[];
  /** Epoch millis of the last visit. 0 for someone who has never opened it. */
  readAt: number;
}): Inbox {
  const history: Notice[] = [
    ...alerts.map(
      (alert): Notice => ({
        id: alert.id,
        kind: "alert",
        tone: alert.tone,
        title: alert.title,
        body: alert.body,
        at: alert.at,
        href: alert.href,
      }),
    ),
    ...broadcasts.map(
      (broadcast): Notice => ({
        id: broadcast.id,
        kind: "broadcast",
        tone: "neutral",
        title: broadcast.title,
        body: broadcast.body,
        at: Date.parse(broadcast.publishedAt),
        href: broadcast.href,
        action: broadcast.action,
      }),
    ),
  ]
    // A broadcast with an unparseable date would sort to the top of the list
    // as `NaN`, which is the one place a bad timestamp is loudest.
    .filter((notice) => Number.isFinite(notice.at))
    .sort((a, b) => b.at - a.at);

  return {
    warnings: [...warnings],
    history,
    unread: history.filter((notice) => notice.at > readAt).length,
  };
}

/**
 * The conditions worth surfacing, derived from state rather than stored.
 *
 * Every one of these is something CLAUDE.md §8 already says out loud somewhere
 * in the product. Collecting them in one place is not a new disclosure — it is
 * the difference between disclosures scattered across four screens and a
 * single answer to "what should I know about what I'm looking at".
 */
export function standingWarnings({
  synthetic,
  signedIn,
  authAvailable,
  alertsArmed,
  suspension,
}: {
  synthetic: boolean;
  signedIn: boolean;
  /** False when no Supabase project is configured — then there is nothing to sign in to. */
  authAvailable: boolean;
  /** At least one alert switch on *and* browser permission granted. */
  alertsArmed: boolean;
  /** The reason, if this account's sync and delivery have been suspended. */
  suspension?: { reason: string | null } | null;
}): Notice[] {
  const warnings: Notice[] = [];

  /**
   * First, and it is the only warning that comes from a decision somebody made
   * about this account rather than from a setting or a mode.
   *
   * A suspended account's writes are refused by RLS, which on the device is
   * indistinguishable from sync being broken. Saying so is not a courtesy — an
   * unexplained failure is the version of this that costs somebody a day.
   *
   * The body says what still works, because for a local-first app that is almost
   * everything, and a warning that implies more was taken than was taken is its
   * own kind of dishonesty.
   */
  if (suspension) {
    warnings.push({
      id: "warning:suspended",
      kind: "warning",
      // Neutral, though it is the most consequential thing in this list. The
      // `critical` tint is `down`, and `down` means money moved — borrowing it
      // for an account state blurs the one distinction the palette exists to
      // keep. It leads the list, which is the hierarchy that costs nothing.
      tone: "neutral",
      title: "Sync and delivery are paused",
      body: suspension.reason
        ? `${suspension.reason} Your data is safe and still readable. New changes won't sync, and email and push are paused.`
        : "Your data is safe and still readable. New changes won't sync, and email and push are paused.",
      at: 0,
      href: "/settings",
      action: "Your data",
    });
  }

  if (synthetic) {
    warnings.push({
      id: "warning:generated-prices",
      kind: "warning",
      tone: "neutral",
      title: "Prices are generated",
      body: "The engine and track record are real. The prices they run on are simulated.",
      at: 0,
      href: "/signals/methodology",
      action: "What's modelled",
    });
  }

  if (authAvailable && !signedIn) {
    warnings.push({
      id: "warning:local-only",
      kind: "warning",
      tone: "neutral",
      title: "Your data is only on this device",
      body: "Sign in to back it up.",
      at: 0,
      href: "/settings",
      action: "Sign in",
    });
  }

  if (!alertsArmed) {
    warnings.push({
      id: "warning:alerts-off",
      kind: "warning",
      tone: "neutral",
      title: "Alerts are off",
      body: "ember won't tell you when a window opens or a position turns against you.",
      at: 0,
      href: "/settings",
      action: "Turn on",
    });
  }

  return warnings;
}
