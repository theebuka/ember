"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Bell } from "@/components/common/icon";
import { PageBody } from "@/components/common/page-body";
import { Section } from "@/components/common/section";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { NoticeRow, NoticeSkeleton } from "@/components/notifications/notice-row";
import { useInbox } from "@/components/notifications/use-inbox";
import { useSession } from "@/hooks/use-session";
import { useNow } from "@/hooks/use-now";
import type { Broadcast } from "@/lib/notifications/inbox";
import { useNotifications } from "@/store/use-notifications";

/**
 * Everything ember has said, and everything it wants you to know.
 *
 * Three sources in two sections, and the split is the design: **conditions
 * first, events second.** A standing warning — prices are generated, your
 * ledger is only on this device — is true right now and will be true when you
 * close the page, so it belongs at the top where it is read as context for
 * everything below. An alert is a moment that has passed; it belongs in a
 * history, newest first, and it is the only kind of thing that can be unread.
 *
 * Opening the screen marks the history read. Not a "mark all as read" button:
 * a button for that is an admission that opening the inbox didn't count, and
 * the only thing it buys is a badge you can clear without looking.
 */
export function NotificationsScreen({
  /**
   * Read on the server by the page wrapper, so the stored broadcasts are in the
   * first paint rather than arriving a round trip later and pushing the history
   * down — see `app/notifications/page.tsx`.
   */
  initialNotices,
}: {
  initialNotices?: Broadcast[];
}) {
  const { warnings, history, unread, loading } = useInbox(initialNotices);
  const { available: authAvailable } = useSession();
  const now = useNow(60_000);
  const markRead = useNotifications((s) => s.markRead);
  const clear = useNotifications((s) => s.clear);

  /**
   * Marked on mount, with the count captured before it changes.
   *
   * Running on every render would fight the store; running on `unread`
   * changing would mark read the instant a new alert arrived while the screen
   * was open, which is right — you are looking at it.
   */
  useEffect(() => {
    if (unread > 0) markRead();
  }, [unread, markRead]);

  return (
    <>
      <PageHeader narrow title="Notifications" back />

      <PageBody narrow className="space-y-8 pb-12">
        {/* ── Worth knowing ─────────────────────────────────────────────
            Every input to a warning is client-only — the data-source flag,
            the session, the browser's notification permission — so this
            block cannot exist in server HTML, and inserting it above the
            history at hydration pushed the whole page down: 0.39 of layout
            shift, by a distance, the worst in the app.

            So the section is always rendered and the *rows* are reserved
            while it is unknowable. Two, because two is the common case: a
            signed-out user on generated prices with alerts off sees three,
            and a signed-in one with alerts on and live data sees none.
            Neither of those is where most sessions sit, and reserving for
            the maximum leaves an empty screen for everyone else. This is
            the ADR 0019 pattern applied to a count rather than a line. */}
        {loading ? (
          <Section title="Worth knowing" >
            <div className="divide-y divide-line border-y border-line">
              {Array.from({ length: authAvailable ? 3 : 2 }, (_, i) => (
                <NoticeSkeleton key={i} />
              ))}
            </div>
          </Section>
        ) : (
          warnings.length > 0 && (
            <Section title="Worth knowing" >
              <div className="divide-y divide-line border-y border-line">
                {warnings.map((notice) => (
                  <NoticeRow key={notice.id} notice={notice} now={null} />
                ))}
              </div>
            </Section>
          )
        )}

        <Section
          title="History"
          
          action={
            history.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-stone"
                onClick={clear}
              >
                Clear
              </Button>
            ) : undefined
          }
        >
          {loading ? (
            <div className="divide-y divide-line border-y border-line">
              {Array.from({ length: 3 }, (_, i) => (
                <NoticeSkeleton key={i} />
              ))}
            </div>
          ) : history.length === 0 ? (
            <Quiet />
          ) : (
            <div className="divide-y divide-line border-y border-line">
              {history.map((notice) => (
                <NoticeRow key={notice.id} notice={notice} now={now} />
              ))}
            </div>
          )}
        </Section>

        <p className="text-micro text-stone">
          In-app alerts arrive while ember is open. Turn on push to get them
          when it&apos;s closed.{" "}
          <Link
            href="/settings"
            className="underline underline-offset-2 hover:text-graphite"
          >
            Alert settings
          </Link>
          .
        </p>
      </PageBody>
    </>
  );
}

function Quiet() {
  return (
    <div className="flex flex-col items-start border-t border-line py-8">
      <div className="mb-4 grid size-11 place-items-center rounded-xl bg-surface-2 text-stone">
        <Bell className="size-5" />
      </div>
      <h3 className="text-heading font-semibold text-ink">No alerts yet</h3>
      <p className="mt-1.5 max-w-md text-body text-stone">
        When ember alerts you, it&apos;s saved here.
      </p>
      <Button variant="outline" size="lg" className="mt-5" asChild>
        <Link href="/settings">Alert settings</Link>
      </Button>
    </div>
  );
}
