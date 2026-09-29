import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Dashboard } from "@/components/dashboard/dashboard";
import { getBroadcasts } from "@/lib/notifications/server";
import { PIN_COOKIE, parseDismissed, pinnedFrom } from "@/lib/notifications/pinned";

export const metadata: Metadata = {
  // The root layout appends " · ember" via its title template.
  title: "Home",
  description:
    "What you're worth, what to do about it, and the window to act in.",
};

/**
 * The dashboard is a client component: it reads the local transaction log and
 * polls quotes, neither of which the server can do. This wrapper exists so the
 * route still owns its metadata rather than losing it to "use client".
 *
 * **It also resolves the pinned banner, and that is what makes the banner free.**
 * Reading the cookie makes this route server-rendered on demand rather than
 * prerendered, which is the cost; what it buys is that a live pin is painted with
 * the page instead of inserted at hydration. Measured, that insert was 0.157 of
 * layout shift on the screen with the tightest budget in the app, and no amount
 * of shrinking the banner was going to reach zero. ADR 0014's pattern, applied to
 * the second thing that needed it.
 *
 * The table read is memoised for thirty seconds inside `getBroadcasts`, so this
 * is not a database round trip on every visit to Home.
 */
export default async function DashboardPage() {
  const [notices, store] = await Promise.all([getBroadcasts(), cookies()]);
  const pinned = pinnedFrom(
    notices,
    parseDismissed(store.get(PIN_COOKIE)?.value),
    // Only the card placement. The bar is mounted in the shell and rendered on
    // the client, because reading a cookie for it in the root layout would make
    // every route in the app dynamic.
    "card",
  );

  return <Dashboard pinned={pinned} />;
}
