import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAction } from "@/lib/admin";

/**
 * Append one line to `admin_log`.
 *
 * **Every admin write goes through here, and the append is deliberately not
 * wrapped in a transaction with the write it describes** — which is a choice
 * worth stating rather than an oversight. PostgREST gives the browser one
 * statement at a time, so the honest options are a stored procedure per action or
 * a best-effort append. A procedure per action would put the composer's logic in
 * SQL and gain, in exchange, atomicity between two rows that no one reads
 * together.
 *
 * The failure it leaves open is a broadcast published with no log line, if the
 * second request fails between the two. That is visible — a notice nobody can
 * account for — and it is the direction to fail in. The reverse, a log line for
 * an action that did not happen, is the one that would make the log worse than
 * useless, and this ordering cannot produce it: the log is written *after* the
 * action succeeds.
 *
 * Errors are swallowed on purpose. An admin who has just published something to
 * every user should not be shown "publish failed" because the audit line did not
 * land — the publish did land, and telling them otherwise would invite them to
 * publish again.
 */
export async function recordAdminAction(
  supabase: SupabaseClient,
  actor: string,
  action: AdminAction,
  target: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  // `actor` is pinned by the table's with-check to `auth.uid()` as well, so this
  // argument cannot be used to write an entry under somebody else's name — it is
  // passed rather than derived only so the caller does not need a second round
  // trip to `getUser()`.
  await supabase.from("admin_log").insert({ actor, action, target, detail });
}
