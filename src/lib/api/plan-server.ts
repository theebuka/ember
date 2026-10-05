import "server-only";

import { timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { planFrom, type Plan } from "@/lib/plan";
import { supabaseServer } from "@/lib/supabase/server";
import { AUTH_CONFIGURED } from "@/lib/supabase/config";

/**
 * The plan of whoever sent this request — the server's answer, and the only one
 * a lock is decided by (decision 288).
 *
 * The browser's `usePlan()` is a courtesy for drawing chips; what a response
 * contains is decided here, from the session cookie, so a locked call is never
 * sent to be hidden.
 *
 * **Free is the answer to every uncertainty**: no project, no session cookie, a
 * token that does not verify, a failed read. The cost of being wrong that way is
 * a Pro reader seeing a lock for one refetch; the other way gives calls away.
 */

/** Development only: what the Plan tab's preview switch tells the server. */
export const PLAN_PREVIEW_COOKIE = "ember_plan_preview";

/**
 * Per access token, for a minute. Every screen asks two or three routes at
 * once, and each would otherwise pay its own round trip to Postgres for an
 * answer that changes only when somebody pays.
 */
const TTL = 60_000;
const MAX_ENTRIES = 500;
const memo = new Map<string, { plan: Plan; at: number }>();

/**
 * The digest sender's pass. It asks `/api/advice` over HTTP and only ever sends
 * to Pro accounts, so it needs Pro's answer; this token is that and nothing
 * else — it unlocks calls, which any subscriber can read, and no user's data.
 * Unset, there is no pass.
 */
const SENDER_TOKEN = process.env.EMBER_SENDER_TOKEN ?? "";

function isSender(value: string | null): boolean {
  if (!SENDER_TOKEN || !value) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(SENDER_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function requestPlan(): Promise<Plan> {
  const head = await headers();
  if (isSender(head.get("x-ember-sender"))) return "pro";
  // What the browser believes. Never the answer — only a sign the memo is stale.
  const hint = head.get("x-ember-plan");

  const store = await cookies();

  if (process.env.NODE_ENV !== "production") {
    const preview = store.get(PLAN_PREVIEW_COOKIE)?.value;
    if (preview === "pro" || preview === "free") return preview;
  }

  if (!AUTH_CONFIGURED) return "free";
  // Same test as `useSession` and the proxy: with no auth cookie there is
  // nobody to look up, and no reason to load a client to find that out.
  const auth = store.getAll().filter((c) => /^sb-.+-auth-token/.test(c.name));
  if (auth.length === 0) return "free";

  const key = auth.map((c) => c.value).join("|");
  const now = Date.now();
  const hit = memo.get(key);
  if (hit && now - hit.at < TTL && (hint === null || hint === hit.plan)) return hit.plan;

  const plan = await readPlan();
  if (memo.size >= MAX_ENTRIES) memo.clear();
  memo.set(key, { plan, at: now });
  return plan;
}

async function readPlan(): Promise<Plan> {
  try {
    const supabase = await supabaseServer();
    if (!supabase) return "free";
    // `getClaims` verifies the token's signature; `getSession` would trust
    // whatever the cookie says. The id it yields is then the only row asked
    // for, and Postgres checks the same token again under RLS.
    const { data, error } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub;
    if (error || !userId) return "free";

    const { data: row, error: readError } = await supabase
      .from("entitlements")
      .select("plan, period_end")
      .eq("user_id", userId)
      .maybeSingle<{ plan: string | null; period_end: string | null }>();
    if (readError) return "free";
    return planFrom(row);
  } catch {
    return "free";
  }
}
