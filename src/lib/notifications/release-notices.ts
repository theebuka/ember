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
    title: "Announcements can now reach every screen",
    body: "Broadcasts used to land in the notification centre and, if pinned, on Home. There is now a third option: a single line across the top of every screen, for the things a card is too quiet for — an outage, or a change to what ember stores. It is dismissible, and dismissing it never removes the message from here.",
    publishedAt: "2026-08-18T09:00:00.000Z",
    // No link. It pointed at `/notifications` — the screen it is read on — so
    // its one action was a button that reloaded the page you were looking at.
    placement: "inbox",
  },
  {
    id: "release:accounts",
    title: "Accounts, and what they store",
    body: "You can now sign in to keep your transaction log, risk profile and watchlist across devices. It stores your transaction log, watchlist and settings, the profile fields you fill in, and your email — not your positions, not your P&L, not anything the engine works out. Signing in is optional and everything still works without it.",
    publishedAt: "2026-08-14T09:00:00.000Z",
    href: "/settings",
    action: "Account settings",
  },
  {
    id: "release:findings-request",
    title: "One request now carries what you own",
    body: "Loss prevention needs the engine to know your positions, so ember sends four derived numbers per open position — symbol, quantity, average cost, opened-at — to its own server when it looks for findings. Never the ledger, never fees or accounts, and nothing is stored server-side.",
    publishedAt: "2026-08-12T09:00:00.000Z",
    href: "/settings",
    action: "Read the detail",
  },
  {
    id: "release:track-record-remeasured",
    title: "The track record was re-measured",
    body: "ember now watches 110 instruments instead of 13, and the price model changed, so every figure on the track record page was recomputed rather than carried over. The old numbers described something that no longer exists.",
    publishedAt: "2026-08-14T08:00:00.000Z",
    href: "/signals/track-record",
    action: "See the record",
  },
  {
    id: "release:news",
    title: "News is here, and it never enters the engine",
    body: "A headlines tab, with a trending strip counted from the feed rather than chosen. Nothing on it feeds the signal engine — ember scores instruments from published, citable rules, and sentiment is not one of them. There is a test that fails if that ever stops being true.",
    publishedAt: "2026-08-13T09:00:00.000Z",
    href: "/signals/methodology",
    action: "What is a signal",
  },
];
