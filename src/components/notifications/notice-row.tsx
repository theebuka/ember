"use client";

import Link from "next/link";
import { BellRinging, Megaphone, Warning } from "@/components/common/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelative } from "@/lib/market/format";
import type { Notice } from "@/lib/notifications/inbox";
import { cn } from "@/lib/utils";

/**
 * One line of the notification centre — and, since phase 28, the broadcast
 * composer's preview.
 *
 * **It moved out of `notifications-screen.tsx` to be shared, and sharing it is
 * the point rather than a tidy-up.** An admin about to send a message to every
 * user should be looking at the message as every user will see it: the same
 * icon, the same wrap, the same truncation, the same "→" on the action. A preview
 * built out of a second set of components is a preview that is right until one of
 * them changes, and the change that breaks it will not announce itself.
 */

const ICONS = {
  alert: BellRinging,
  broadcast: Megaphone,
  warning: Warning,
} as const;

export function NoticeRow({ notice, now }: { notice: Notice; now: number | null }) {
  const Icon = ICONS[notice.kind];
  const critical = notice.tone === "critical";

  const body = (
    <div className="flex gap-3.5 py-4">
      <span
        className={cn(
          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl",
          // Only `critical` is tinted, and only ever on an alert. Same rule as
          // the findings inbox (decision 077) — a list where every row is
          // coloured has said nothing about which one matters.
          critical ? "bg-down-tint text-down" : "bg-surface-2 text-stone",
        )}
      >
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-body font-medium text-ink">{notice.title}</p>
          {/* Relative times are the canonical hydration mismatch (ADR 0017),
              so they wait for a mounted clock. Warnings get none at all —
              "3 minutes ago" on a condition that is simply true would be
              measuring when the page loaded. */}
          {now !== null && notice.kind !== "warning" && (
            <time
              dateTime={new Date(notice.at).toISOString()}
              className="text-micro text-stone"
            >
              {formatRelative(notice.at, now)}
            </time>
          )}
        </div>

        <p className="mt-1 text-caption text-stone text-pretty">{notice.body}</p>

        {notice.href && (
          <span className="mt-2 inline-block text-caption font-medium text-brand-text">
            {notice.action ?? "View"} →
          </span>
        )}
      </div>
    </div>
  );

  if (!notice.href) return body;

  return (
    <Link
      href={notice.href}
      className="block rounded-sm transition-colors hover:bg-surface-2/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {body}
    </Link>
  );
}

/**
 * Sized against a real row, line for line: the same icon, a title in
 * `text-body`, one line of `text-caption` and the action link under it. Every
 * height is `h-[1lh]` in the class it stands in for, so it is the font's line
 * box rather than a number anybody chose (ADR 0019).
 */
export function NoticeSkeleton() {
  return (
    <div className="flex gap-3.5 py-4" aria-hidden>
      <Skeleton className="size-8 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-[1lh] w-40 text-body" />
        {/* Two body lines, not one. Measured: every warning body wraps to two
            at 335px, and reserving one left the history 66px high — 0.47 of
            layout shift, which was worse than the 0.39 the first attempt at
            this was trying to fix. */}
        <Skeleton className="mt-1 h-[1lh] w-full text-caption" />
        <Skeleton className="mt-0.5 h-[1lh] w-3/5 text-caption" />
        <Skeleton className="mt-2 h-[1lh] w-28 text-caption" />
      </div>
    </div>
  );
}
