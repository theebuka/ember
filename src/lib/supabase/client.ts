"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTH_CONFIGURED, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

let loading: Promise<SupabaseClient | null> | null = null;

/**
 * The browser's Supabase client, loaded the first time something asks.
 *
 * **Asynchronous on purpose.** The library is ~245 KB of script (auth, the
 * query builder, realtime and storage) and it sat in every page's first load —
 * including for somebody with no account, who never uses it. A dynamic import
 * moves it out of the bundle the page waits for; the first caller pays one
 * chunk download, and every caller after shares the same promise — one client
 * per tab, since a second would refresh the same session twice and race itself.
 *
 * `null` when no project is configured, rather than a throw: running with no
 * backend is supported (`config.ts`), so every caller handles it.
 */
export function supabaseBrowser(): Promise<SupabaseClient | null> {
  if (!AUTH_CONFIGURED) return Promise.resolve(null);
  loading ??= import("@supabase/ssr").then(({ createBrowserClient }) =>
    createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY),
  );
  return loading;
}

/**
 * Whether this browser holds a session at all, without loading the client.
 *
 * `@supabase/ssr` keeps the session in `sb-<ref>-auth-token` cookies (chunked
 * as `.0`, `.1`). No such cookie means nobody is signed in, which lets a
 * signed-out reader — most of them — skip the library entirely.
 */
export function hasSessionCookie(): boolean {
  return typeof document !== "undefined" && /(?:^|;\s*)sb-[^=]*-auth-token/.test(document.cookie);
}

/**
 * Rows from a table every reader may see (`sponsors`, `app_settings`), read
 * over PostgREST with the anon key and no client library — so a signed-out
 * page that shows a sponsor or a price does not load Supabase to do it. `null`
 * on any failure, which callers already treat as "nothing to show".
 */
export async function publicRows<T>(path: string, signal?: AbortSignal): Promise<T[] | null> {
  if (!AUTH_CONFIGURED) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      signal,
    });
    return response.ok ? ((await response.json()) as T[]) : null;
  } catch {
    return null;
  }
}
