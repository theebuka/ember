import { NotificationsScreen } from "@/components/notifications/notifications-screen";
import { getBroadcasts } from "@/lib/notifications/server";

export const metadata = {
  title: "Notifications",
  description: "Your alerts and announcements from ember.",
};

/**
 * Dynamic, and it buys a measurement.
 *
 * The broadcasts are read here rather than left to the client query, so the
 * real rows are in the first paint. While the client query silently never ran
 * they were the same thing; the moment stored rows started arriving a round
 * trip later, this screen grew by two notices mid-page and measured 0.103 of
 * layout shift against a gate of 0.1, having previously measured 0.002.
 *
 * The cost is that this route is server-rendered on demand instead of
 * prerendered. It is a destination somebody navigates to deliberately, not a
 * landing page, and it was already client-rendering everything below the fold
 * from `localStorage`.
 */
export default async function NotificationsPage() {
  return <NotificationsScreen initialNotices={await getBroadcasts()} />;
}
