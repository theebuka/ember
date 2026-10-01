"use client";

import { useState } from "react";
import Link from "next/link";
import { Megaphone, X } from "@/components/common/icon";
import { useNotifications } from "@/store/use-notifications";
import type { Broadcast } from "@/lib/notifications/inbox";
import { pinnedFrom, writeDismissedCookie } from "@/lib/notifications/pinned";
import { cn } from "@/lib/utils";

/**
 * The one thing ember says at the top of Home without being asked.
 *
 * ── One at a time, above the greeting ──────────────────────────────────────
 *
 * A pinned broadcast is an interruption: the reader opened ember to look at a
 * balance and is being told something else first. That earns exactly one slot.
 * Stacking two would turn the top of Home into a queue, and decision 082 already
 * settled the shape of this screen — the balance is the focal point, and a fourth
 * element competing for the top is how a home screen stops having one.
 *
 * It sits above the greeting rather than below it because the greeting is the app
 * addressing *you* and this is the app talking about *itself*. Putting a service
 * announcement between "Good morning, Ebuka" and the balance would break a single
 * thought in half.
 *
 * ── It arrives in the server's HTML, and that took two attempts ────────────
 *
 * `notices` is resolved by the server wrapper and handed down, so the banner is
 * painted with the page and nothing is inserted at hydration.
 *
 * The first version read the store and the query on the client, which meant it
 * could only appear after mount. Measured on the first real broadcast, that cost
 * **0.253 of layout shift on Home** against a gate of 0.1 — the body was 230
 * characters of authored copy and the banner came out ~450px tall on a phone.
 * Clamping to two lines took it to 0.157, which is the lesson: the size of the
 * insert was never the problem, the insert was. Dismissals moved into a cookie so
 * the server can know what to draw (see `lib/notifications/pinned.ts`), and the
 * clamp stayed, because a pin is a summons rather than the message — the full
 * text is one tap away in the notification centre, where it is not competing with
 * a balance.
 *
 * ── What dismissing means ─────────────────────────────────────────────────
 *
 * Not "read". The notice stays in the notification centre, still unread, still
 * counted by the badge — closing a banner is "not now, and not here". A banner
 * that swallowed the message would make dismissing it the fastest way to lose it.
 */
export function PinnedBanner({
  /** Already filtered against the cookie by the server, newest first. */
  notices,
  className,
}: {
  notices: Broadcast[];
  className?: string;
}) {
  const dismissed = useNotifications((s) => s.dismissed);
  const dismiss = useNotifications((s) => s.dismiss);
  // Mirrors what this session has closed, so the banner goes at the moment it is
  // pressed rather than after a round trip. CLS ignores shifts within 500ms of an
  // input, so a dismissal costs nothing the gate measures — and nothing the
  // reader experiences as the page moving under them, because they moved it.
  const [closed, setClosed] = useState<string[]>([]);

  /**
   * Filtered against the store as well as the cookie, and the two normally
   * agree.
   *
   * They diverge only where `document.cookie` is refused — an in-app webview,
   * "block all cookies" — in which case the server sends a banner this device
   * already closed and it disappears at hydration. That is the old behaviour, for
   * the few browsers that cannot do better, instead of for everybody.
   */
  const notice = pinnedFrom(notices, [...dismissed, ...closed], "card")[0];
  if (!notice) return null;

  return (
    // `role="status"` rather than `alert`: this is not an emergency and an
    // assertive live region would cut across whatever a screen-reader user is
    // already listening to. `aria-live` is deliberately absent — the banner is
    // in the first paint rather than arriving during it, so announcing it as a
    // change would be announcing the page load.
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-4",
        className,
      )}
    >
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
        <Megaphone className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        {/* Two lines each, so the banner's height is a property of the layout
            rather than of how much somebody typed. */}
        <p className="line-clamp-2 text-body font-medium text-ink">{notice.title}</p>
        <p className="mt-1 line-clamp-2 text-caption text-stone text-pretty">
          {notice.body}
        </p>
        {/* Always a way through, even on a notice with no destination of its own
            — the clamp means there is usually more to read, and "Read it" going
            nowhere would be a 404 in a different costume. */}
        <Link
          href={notice.href ?? "/notifications"}
          className="mt-2 inline-block text-caption font-medium text-brand-text underline-offset-4 hover:underline"
        >
          {notice.href ? (notice.action ?? "View") : "Read it"} →
        </Link>
      </div>

      <button
        type="button"
        onClick={() => {
          const next = [...dismissed, ...closed, notice.id];
          setClosed((ids) => [...ids, notice.id]);
          dismiss(notice.id);
          writeDismissedCookie(next);
        }}
        // No undo toast, and this is the one place that is right: the notice is
        // still in the notification centre one tap away, so the action is not
        // destructive and a toast would be a second interruption apologising for
        // the first.
        aria-label="Dismiss this announcement"
        className="tap-target -m-1 grid size-8 shrink-0 place-items-center rounded-full text-stone transition-colors hover:bg-surface hover:text-graphite focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
