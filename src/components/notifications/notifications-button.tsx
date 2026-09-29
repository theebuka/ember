"use client";

import Link from "next/link";
import { Bell } from "@/components/common/icon";
import { useInbox } from "@/components/notifications/use-inbox";
import { cn } from "@/lib/utils";

/**
 * The bell, beside the data-source chip.
 *
 * **A dot, not a count.** A number on a badge asks you to decide whether nine
 * is worse than three, which is a judgement the inbox has already made and
 * shows properly with severity. The dot answers the only question a header
 * icon can honestly answer: is there anything new. The count still goes to
 * assistive tech, where there is no dot to see and the number is the whole
 * signal.
 *
 * **Warnings never light it.** They are standing conditions — generated
 * prices, a local-only ledger — and a badge that includes them can never reach
 * zero. A badge that can never reach zero is one the user stops seeing within
 * a week, at which point it has stopped working for the alerts too, which are
 * the ones that expire. Reasoned through in `lib/notifications/inbox.ts`.
 */
export function NotificationsButton({ className }: { className?: string }) {
  const { unread } = useInbox();

  return (
    <Link
      href="/notifications"
      aria-label={
        unread === 0
          ? "Notifications"
          : `Notifications, ${unread} unread`
      }
      className={cn(
        "tap-target relative grid size-9 place-items-center rounded-full",
        "text-stone transition-colors hover:bg-surface-2 hover:text-ink",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <Bell className="size-[1.125rem]" />
      {unread > 0 && (
        <span
          aria-hidden
          // Ringed in `ground` so the dot reads as a separate object sitting on
          // the icon rather than a stray pixel of it, at any header background.
          className="absolute top-1.5 right-1.5 size-2 rounded-full bg-brand ring-2 ring-ground"
        />
      )}
    </Link>
  );
}
