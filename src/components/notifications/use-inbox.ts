"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useHydrated } from "@/hooks/use-hydrated";
import { useSynthetic } from "@/components/market/data-source";
import { useSuspension } from "@/hooks/use-admin";
import { useNotificationPermission } from "@/hooks/use-notification-permission";
import { useSession } from "@/hooks/use-session";
import { buildInbox, standingWarnings, type Broadcast, type Inbox } from "@/lib/notifications/inbox";
import { RELEASE_NOTICES } from "@/lib/notifications/release-notices";
import { useNotifications } from "@/store/use-notifications";
import { usePreferences } from "@/store/use-preferences";

/**
 * Just the broadcasts.
 *
 * Split out because the pinned banner on Home needs the same rows the bell needs
 * and must not fetch them a second time — one query key, so React Query serves
 * both from one request and they cannot disagree about what has been published.
 */
export function useBroadcasts() {
  const query = useQuery({
    queryKey: ["notices"],
    queryFn: async ({ signal }): Promise<Broadcast[]> => {
      const response = await fetch("/api/notices", { signal });
      if (!response.ok) throw new Error("Notices didn't load.");
      const json = (await response.json()) as { notices: Broadcast[] };
      return json.notices;
    },
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    /**
     * The build's own notices, rendered before the request finishes. A real
     * answer rather than a placeholder — `/api/notices` returns exactly these
     * plus whatever the table holds — which is what lets a screen skip a
     * skeleton, and with it the 0.39 of layout shift the notification centre
     * measured when four notices replaced three grey boxes.
     */
    initialData: RELEASE_NOTICES,
    /**
     * **Load-bearing, and its absence made this query never run.**
     *
     * `initialData` with no `initialDataUpdatedAt` is stamped as fetched *now*,
     * so with a ten-minute `staleTime` the query was fresh on arrival and
     * refused to fetch on mount. `/api/notices` was therefore never called on a
     * normal page load, and the app served the four notices compiled into the
     * build as if they were the whole table.
     *
     * That was true from decision 107 (phase 19) until phase 28 and nothing
     * caught it, because the `notices` table had never had a row in it — the
     * seeded answer and the real one were identical, so a query that never ran
     * was indistinguishable from one that did. The first real broadcast is what
     * exposed it: it appeared for the admin who published it, because publishing
     * invalidates this key and an invalidation ignores `staleTime`, and for
     * nobody else, and it vanished from the admin's own screen on the next
     * reload.
     *
     * `0` means "this data is from the epoch", so it is stale the moment it is
     * handed over and a background refetch runs on mount. The first paint is
     * unchanged — which is the entire point of `initialData` here — and the
     * stored rows land a moment later.
     */
    initialDataUpdatedAt: 0,
  });

  /**
   * True once a request has actually *succeeded* — not merely finished.
   *
   * `isFetched` was used for this and it is also true after a failure, when
   * `data` is still the compiled release notes. So a single failed request made
   * the notification centre throw away the stored broadcasts the server had
   * rendered, and made the announcement bar conclude there was no bar, collapse
   * its slot and forget the hint. `initialDataUpdatedAt: 0` above means
   * `dataUpdatedAt` stays 0 until real data lands, which is exactly the signal.
   */
  // Only the two fields anything reads. Spreading the whole result would touch
  // every property, and React Query re-renders a component for every property
  // it has touched — `isFetching` flipping twice per request, on every screen.
  return { data: query.data, answered: query.dataUpdatedAt > 0 };
}

/**
 * The assembled inbox, shared by the bell and the screen.
 *
 * One hook rather than two so the badge and the list cannot disagree about what
 * is unread — the class of bug where a badge says 3 and the screen shows
 * nothing, which teaches people to stop trusting the badge.
 *
 * The broadcasts query is deliberately slack: ten minutes stale, no refetch on
 * focus. A release note is not time-critical and this runs on every screen that
 * renders the bell.
 */
export function useInbox(seed?: Broadcast[]): Inbox & { loading: boolean } {
  const hydrated = useHydrated();

  const entries = useNotifications((s) => s.entries);
  const readAt = useNotifications((s) => s.readAt);

  // From the layout, not a query: a live build used to raise "Prices are
  // generated" as a standing warning until `/api/instruments` answered.
  const synthetic = useSynthetic();
  const { user, available } = useSession();
  const { suspended, reason: suspensionReason } = useSuspension();
  const permission = useNotificationPermission();
  const windowOpen = usePreferences((s) => s.notifications.windowOpen);
  const riskAlerts = usePreferences((s) => s.notifications.riskAlerts);

  const broadcasts = useBroadcasts();

  /**
   * The server's rows win until a fetch has actually happened, and this
   * deliberately does **not** go through `initialData`.
   *
   * It did, and it silently stopped working the moment the announcement bar
   * mounted in `AppShell`: the shell renders before the page, its seedless
   * `useBroadcasts()` created the `["notices"]` cache entry first, and React
   * Query only applies `initialData` to an *empty* cache — so the page's seed was
   * discarded and the stored broadcasts went back to arriving a round trip after
   * paint. The notification centre measured **0.337** on desktop, having measured
   * 0.000 the run before.
   *
   * Reading the seed here instead is order-independent. Nothing about which
   * component mounted first can change the answer.
   */
  const source = broadcasts.answered ? broadcasts.data : (seed ?? broadcasts.data);

  return useMemo(() => {
    // Before hydration none of the inputs are knowable — the stores are empty
    // and permission is unread — so an inbox built here would announce
    // warnings that aren't true and then take them back.
    if (!hydrated) {
      return { warnings: [], history: [], unread: 0, loading: true };
    }

    const inbox = buildInbox({
      alerts: entries,
      broadcasts: source ?? [],
      warnings: standingWarnings({
        synthetic,
        signedIn: user !== null,
        authAvailable: available,
        alertsArmed: (windowOpen || riskAlerts) && permission === "granted",
        suspension: suspended ? { reason: suspensionReason } : null,
      }),
      readAt,
    });

    return { ...inbox, loading: false };
  }, [
    hydrated,
    entries,
    readAt,
    source,
    synthetic,
    user,
    available,
    windowOpen,
    riskAlerts,
    permission,
    suspended,
    suspensionReason,
  ]);
}
