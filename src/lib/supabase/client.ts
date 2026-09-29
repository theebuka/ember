"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTH_CONFIGURED, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/**
 * The browser client, or `null` when there is no project configured.
 *
 * **Returning `null` rather than throwing is the whole design.** Every caller
 * has to handle "there is no backend", because that is a supported way to run
 * ember (see `config.ts`) rather than a misconfiguration. A client that throws
 * on construction would mean every sync call sat inside a try/catch that
 * silently swallowed real errors alongside the expected one, which is how a
 * broken sync goes unnoticed.
 *
 * Memoised because `createBrowserClient` sets up auth-state listeners and a
 * token refresh timer. One per tab; a second instance would refresh the same
 * session twice and race itself.
 */
let cached: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient | null {
  if (!AUTH_CONFIGURED) return null;
  cached ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return cached;
}
