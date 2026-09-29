"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Megaphone, X } from "@/components/common/icon";
import { useBroadcasts } from "@/components/notifications/use-inbox";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  BAR_HINT_KEY,
  pinnedFrom,
  writeDismissedCookie,
} from "@/lib/notifications/pinned";
import { useNotifications } from "@/store/use-notifications";

/**
 * A strip across the top of every screen — the loudest thing ember does.
 *
 * ── When this rather than the card ─────────────────────────────────────────
 *
 * The card on Home is for something a reader should see next time they look at
 * their balance. This is for something they need to know *whatever* they came to
 * do: an outage, a change to what ember stores, a figure that moved. It sits
 * above the app's own chrome on all sixteen screens, so it is the one
 * announcement nobody can navigate away from — which is exactly why it is a
 * separate, deliberate choice in the composer rather than a louder pin.
 *
 * One line, one at a time, and the title only. The body is in the notification
 * centre; a bar that wrapped to three lines on a phone would push the entire app
 * down the page to say something a sentence could.
 *
 * ── Why the height is reserved by an inline script ─────────────────────────
 *
 * The card banner solved its layout shift by having the server resolve it (ADR
 * 0014's cookie, `lib/notifications/pinned.ts`). That is not available here. This
 * lives in the root shell, so reading a cookie for it would make **every** route
 * dynamic — including the 214 prerendered asset pages and the static public
 * argument pages — which is a large, permanent cost to avoid a shift on a rare
 * event.
 *
 * So the *presence* of a bar is cached in `localStorage`, and a blocking inline
 * script (`BarSlotScript`) reads it and sets `--bar-h` before first paint. The
 * slot is then the right height in the very first frame and React fills it. It is
 * the same trick that stops a theme flashing, and the same shape as every other
 * mirror in this app: the server is the source of truth, the client keeps a hint
 * so it can act before the truth arrives.
 *
 * The cost is honest and small: **the first load after a bar is published shifts
 * once**, by exactly 40px, because that device has not learned yet. Every load
 * after it is clean, and so is the load after a dismissal.
 */

export function AnnouncementBar() {
  const hydrated = useHydrated();
  const { data, answered } = useBroadcasts();
  const dismissed = useNotifications((s) => s.dismissed);
  const dismiss = useNotifications((s) => s.dismiss);

  const notice = pinnedFrom(data ?? [], dismissed, "bar")[0];

  /**
   * Teach this device what to reserve next time.
   *
   * After render, never during — writing storage in the render pass is the
   * impurity React's own lint rule refuses, and the value is only needed on the
   * *next* load anyway.
   */
  useEffect(() => {
    /**
     * **Only once a fetch has actually happened.**
     *
     * `useBroadcasts` starts with the release notes compiled into the build, and
     * none of them is a bar — so running on that seed meant every load did this:
     * the inline script reserved 40px, hydration immediately concluded "no bar"
     * and collapsed it, and the fetch then put it back. Two shifts, on every
     * screen, from the mechanism that exists to prevent one.
     *
     * Holding the reservation until the answer is real costs an empty 40px band
     * for the length of one request, on a device that has seen a bar before —
     * and that band is exactly where the bar is about to be.
     */
    if (!hydrated || !answered) return;

    /**
     * Keep the *live* reservation honest as well as the stored hint.
     *
     * Without this, a device that has seen a bar keeps a 40px reservation
     * forever: the script sets `--bar-h` before paint, and if the bar has since
     * been withdrawn there is no content to fill it and the app renders an empty
     * band across the top of every screen. Syncing it here collapses that at
     * hydration — a shift, but only in the case where the hint has gone stale.
     */
    document.documentElement.style.setProperty("--bar-h", notice ? "2.5rem" : "0px");

    try {
      if (notice) localStorage.setItem(BAR_HINT_KEY, notice.id);
      else localStorage.removeItem(BAR_HINT_KEY);
    } catch {
      // Restricted storage. The bar still works; it just shifts on every load
      // for this reader, which is the same trade the dismissal cookie makes.
    }
  }, [hydrated, answered, notice]);

  if (!hydrated || !notice) return null;

  return (
    <div
      role="status"
      className="relative flex h-10 items-center justify-center border-b border-line bg-surface-2 pr-10 pl-3"
    >
      {/* The whole strip is the link, not just the label at the end.
          Structured the other way round the action label was `shrink-0` and ate
          the width at 375px, truncating the title to "Announcements c…" — the
          message losing to the button that points at it. Now the title takes
          what is left, the label only appears where there is room for it, and
          on a phone the target is the full width of the screen. */}
      <Link
        href={notice.href ?? "/notifications"}
        className="flex min-w-0 items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Megaphone className="size-4 shrink-0 text-brand" />

        {/* One line, truncated. The composer refuses a title longer than fits
            (`BAR_TITLE_LIMIT`), so this is a backstop for rows written straight
            into the database. */}
        <span className="truncate text-caption text-graphite">{notice.title}</span>

        <span className="hidden shrink-0 text-caption font-medium text-brand-text underline underline-offset-4 sm:inline">
          {notice.href ? (notice.action ?? "View") : "Read"}
        </span>
      </Link>

      <button
        type="button"
        onClick={() => {
          const next = [...dismissed, notice.id];
          dismiss(notice.id);
          writeDismissedCookie(next);
          document.documentElement.style.setProperty("--bar-h", "0px");
          try {
            localStorage.removeItem(BAR_HINT_KEY);
          } catch {
            /* see above */
          }
        }}
        aria-label="Dismiss this announcement"
        className="absolute right-1 grid size-9 place-items-center rounded-full text-stone transition-colors hover:bg-surface hover:text-graphite focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
