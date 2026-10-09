import type { BroadcastPlacement } from "@/lib/admin";
import type { Broadcast } from "@/lib/notifications/inbox";

/**
 * Which pinned broadcasts this device has closed — mirrored into a cookie.
 *
 * ── Why a cookie, when the store already knows ─────────────────────────────
 *
 * Exactly ADR 0014's argument, one screen over. The authoritative list lives in
 * `use-notifications`, which is `localStorage`, which the server cannot read —
 * so a banner driven by it can only appear *after* hydration. That insert was
 * measured at **0.157 of layout shift on Home** even with the copy clamped
 * (0.253 before), against a gate of 0.1, on the screen with the tightest budget
 * in the app.
 *
 * Shrinking the banner was not enough and never could be: the problem is not how
 * big the insert is, it is that there is an insert at all. With the dismissals in
 * a cookie the server knows what to draw, the banner is in the first HTML, and
 * nothing moves.
 *
 * **The cookie is a cache of the store, never the source of truth** — the same
 * relationship `ember_onboarded` has with `hasOnboarded`, and for the same
 * reason: `document.cookie =` is a silent no-op under restricted storage, and a
 * feature that breaks entirely in an in-app webview is worse than one that
 * degrades. If the write fails, the server renders a banner the reader already
 * closed and the client removes it at hydration — back to the old behaviour, for
 * the small number of people whose browser refuses cookies, rather than for
 * everybody.
 *
 * Dismissing still is not reading. The notice stays in the notification centre,
 * unread, still counted by the badge.
 */

export const PIN_COOKIE = "ember_pins";

/**
 * Where a device remembers that a bar is live, so the pre-paint script can
 * reserve its height.
 *
 * **Here rather than beside the component, and that is not tidiness.** It lived
 * in `announcement-bar.tsx`, which is `"use client"` — so the server component
 * emitting the script imported a *client reference* rather than the string, and
 * the inline script shipped as `localStorage.getItem(undefined)`. It silently
 * never matched, the reservation never applied, and the bar shifted the page on
 * every load exactly as if the mechanism did not exist. The gate caught it as an
 * unmoved 0.123; nothing else would have.
 */
export const BAR_HINT_KEY = "ember:bar";

/** A year, like the onboarding cookie. Expiry is a rounding error against churn. */
const MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Only the most recent handful are kept.
 *
 * A cookie rides on every request to this origin, so an unbounded list of every
 * broadcast anyone ever closed would be permanent upload on every navigation.
 * Twelve covers far more pins than ember will plausibly send, and the store —
 * which is uncapped — is what remembers the rest. Dropping the oldest id can only
 * re-show a banner from long ago, and the client filters that out on hydration.
 */
const KEEP = 12;

export function parseDismissed(value: string | undefined | null): string[] {
  if (!value) return [];
  return value.split(".").filter((id) => id.length > 0);
}

export function serialiseDismissed(ids: readonly string[]): string {
  // Ids are uuids, so `.` cannot appear in one and needs no escaping — unlike
  // the obvious comma, which a cookie value is not allowed to carry unquoted.
  return ids.slice(-KEEP).join(".");
}

/** Client-side write. Silently a no-op where cookies are refused; see above. */
export function writeDismissedCookie(ids: readonly string[]): void {
  if (typeof document === "undefined") return;
  document.cookie = `${PIN_COOKIE}=${serialiseDismissed(ids)}; path=/; max-age=${MAX_AGE}; samesite=lax`;
}

/**
 * The promoted broadcasts still worth showing for one placement, newest first.
 *
 * Pure, and shared by the server wrapper and the banner so the two cannot
 * disagree about what should be on screen — which is the whole failure mode
 * server-rendering introduces.
 */
export function pinnedFrom(
  notices: readonly Broadcast[],
  dismissed: readonly string[],
  placement: BroadcastPlacement,
): Broadcast[] {
  const closed = new Set(dismissed);
  // One promoted broadcast on screen at a time. A live bar holds back the
  // card until it is dismissed: with both, Home opened ~250pt further down.
  if (
    placement === "card" &&
    notices.some((notice) => notice.placement === "bar" && !closed.has(notice.id))
  ) {
    return [];
  }
  return notices
    .filter((notice) => notice.placement === placement && !closed.has(notice.id))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}
