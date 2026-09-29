import { NextResponse } from "next/server";
import { getBroadcasts } from "@/lib/notifications/server";

export const dynamic = "force-dynamic";

/**
 * Broadcasts — release notes, methodology changes, anything ember needs to
 * say to everyone.
 *
 * **Two sources, and the fallback is not a stub.** With a Supabase project
 * configured `getBroadcasts()` reads the `notices` table, which is what lets a
 * message reach users without shipping a build. Without one it serves the
 * release notes compiled into this build, which are real messages about real
 * changes — just ones that can only change when the app does.
 *
 * The reading lives in `lib/notifications/server.ts` rather than here, because
 * the notification centre now renders the same rows in its *first paint* and
 * two copies of this query would eventually disagree about what is published.
 *
 * No personalisation, no per-user targeting, and nothing about the reader goes
 * out with the request. A notice is the same for everyone, which is what makes
 * it cacheable and what keeps this route out of ADR 0025's territory.
 */
export async function GET() {
  const notices = await getBroadcasts();
  return NextResponse.json({ notices });
}
