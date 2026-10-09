import type { Broadcast } from "./inbox";

/**
 * Broadcasts compiled into the build.
 *
 * Every one of these is a change a user could otherwise only discover by
 * noticing it — a number that moved, a rule that changed, a property that was
 * spent. That is the bar for adding one: not "we shipped a thing", but "you
 * would want to be told, and you would be annoyed to find out by accident".
 *
 * Ids are prefixed `release:` and are permanent. The inbox tracks what you
 * have read by timestamp, but the id is what stops the same note appearing
 * twice if it ever also lands in the `notices` table.
 *
 * Dates are the day the change shipped, not the day it was written up.
 */
export const RELEASE_NOTICES: Broadcast[] = [
  {
    id: "release:announcement-bar",
    title: "Notices can now appear on every screen",
    body: "Important notices, like an outage, can now appear as a bar across the top of every screen. Dismissing the bar keeps the message here.",
    publishedAt: "2026-08-18T09:00:00.000Z",
    // No link. It pointed at `/notifications` — the screen it is read on — so
    // its one action was a button that reloaded the page you were looking at.
    placement: "inbox",
  },
  {
    id: "release:accounts",
    title: "Accounts, and what they store",
    body: "Sign in to keep your trades, watchlist, settings and profile across devices. ember stores those and your email, but never your positions or P&L. Signing in is optional.",
    publishedAt: "2026-08-14T09:00:00.000Z",
    href: "/settings",
    action: "Account settings",
  },
  {
    id: "release:findings-request",
    title: "What ember sends to warn you",
    body: "To warn you about positions, ember now sends its server four numbers per open position: symbol, quantity, average cost and opening date. Nothing else is sent, and nothing is stored.",
    publishedAt: "2026-08-12T09:00:00.000Z",
    href: "/settings",
    action: "See details",
  },
  {
    id: "release:track-record-remeasured",
    title: "The track record was re-measured",
    body: "ember now covers far more instruments and uses a new price model, so every figure on the track record was recalculated from scratch.",
    publishedAt: "2026-08-14T08:00:00.000Z",
    href: "/signals/track-record",
    action: "See the record",
  },
  {
    id: "release:news",
    title: "News is here",
    body: "A new News tab, with trending topics counted from the feed. News never feeds ember's signals, which come only from published, cited rules.",
    publishedAt: "2026-08-13T09:00:00.000Z",
    href: "/signals/methodology",
    action: "What is a signal",
  },
];
