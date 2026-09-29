import "server-only";

import { isBroadcastLink, type BroadcastPlacement } from "@/lib/admin";
import { RELEASE_NOTICES } from "@/lib/notifications/release-notices";
import { supabaseServer } from "@/lib/supabase/server";
import type { Broadcast } from "@/lib/notifications/inbox";

/**
 * Every broadcast a reader should see, read on the server.
 *
 * **Extracted from `/api/notices` so a page can render the real answer in its
 * first paint rather than the build's copy of it**, which is what the route
 * alone could never do. Both callers go through here, so the two cannot drift.
 *
 * The reason is layout shift, measured rather than guessed. While the client
 * query silently never ran (see `use-inbox`), the seeded release notes *were*
 * the whole answer and nothing ever moved. The moment stored rows started
 * arriving a round trip after paint, the notification centre grew by two rows
 * mid-page — 0.103 against a gate of 0.1, on a screen that had measured 0.002.
 * Serving them in the HTML removes the arrival entirely.
 */
/**
 * Thirty seconds, in module scope, because Home reads this on every request.
 *
 * Without it, resolving the pinned banner puts a Postgres round trip in the
 * critical path of the app's landing page — for a feature that renders nothing
 * on almost every visit, which is the worst possible ratio. A broadcast arriving
 * up to half a minute late is not a cost anybody can perceive.
 *
 * Per server instance, evaporating on redeploy, exactly like the advice memo in
 * `lib/api/server.ts`. **The admin composer deliberately does not read through
 * here** — it queries `notices` directly, so an admin never watches their own
 * broadcast take thirty seconds to appear, which is precisely the symptom that
 * made the phase-28 bug so confusing.
 */
const TTL = 30_000;
let cached: { at: number; notices: Broadcast[] } | null = null;

export async function getBroadcasts(): Promise<Broadcast[]> {
  if (cached && Date.now() - cached.at < TTL) return cached.notices;

  const supabase = await supabaseServer();
  if (!supabase) return RELEASE_NOTICES;


  const { data, error } = await supabase
    .from("notices")
    /**
     * `*`, not a column list, and the reason was measured rather than reasoned
     * about. Naming `pinned` explicitly returns **400** against a project that
     * has not run `0006` yet — PostgREST refuses a select for a column that does
     * not exist rather than omitting it — which would take this down on every
     * deployment mid-migration.
     *
     * Safe here in a way it would not be on most tables: `notices` is the one
     * table whose every column is public broadcast copy, and rows are mapped to
     * an explicit shape below, so a column added later cannot leak by accident.
     */
    .select("*")
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(50);

  // Not cached on failure: a transient error should not pin the fallback in
  // place for the next thirty seconds of visitors.
  if (error || !data) return RELEASE_NOTICES;

  const stored: Broadcast[] = data.map((row) => {
    /**
     * A link ember cannot resolve is dropped, and the notice is served without
     * one.
     *
     * The composer picks destinations from a list now, so it cannot produce a
     * bad one — but a row can also arrive from the Supabase dashboard, and two
     * already have: the first broadcasts ever published pointed at
     * `/announcements/first-ever`, and every reader who followed that link got a
     * 404 from the product telling them something mattered.
     *
     * Checking here covers the banner, the bell and the notification centre in
     * one place, and it fixes rows already in the table without anybody editing
     * them. The title and body still render — the message is the point.
     */
    const href = row.href as string | null;
    const resolvable = href !== null && isBroadcastLink(href);

    return {
      id: row.id as string,
      title: row.title as string,
      body: row.body as string,
      href: resolvable ? href : undefined,
      action: resolvable ? ((row.action as string | null) ?? undefined) : undefined,
      publishedAt: row.published_at as string,
      /**
       * Falls back to `0006`'s boolean, not to `inbox`.
       *
       * A project that has not run `0007` has no `placement` column, and reading
       * the absence as "inbox" would silently un-pin every banner already live —
       * the app would look like it had lost a feature, mid-deploy, for exactly as
       * long as it took somebody to notice. `pinned` still carries the answer for
       * those rows, and a pinned row was pinned *as a card*, because a card was
       * the only pin that existed when it was written.
       *
       * This is the same reason `0007` leaves the `pinned` column in place rather
       * than dropping it: for one release the two schemas both have to work.
       */
      placement:
        (row.placement as BroadcastPlacement | null | undefined) ??
        (row.pinned ? "card" : "inbox"),
    };
  });

  // The table is additive, not a replacement: a fresh project has no rows and
  // the reader would otherwise see nothing at all, which looks like a broken
  // screen rather than an empty one. Ids are distinct by construction — stored
  // rows are uuids, release notes are `release:`.
  const notices = [...stored, ...RELEASE_NOTICES];
  cached = { at: Date.now(), notices };
  return notices;
}
