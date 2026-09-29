import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTH_CONFIGURED, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/**
 * The server client, or `null` when there is no project configured.
 *
 * `server-only` for the same reason `lib/api/server.ts` has it: pulling this
 * into a client component is a build error rather than a runtime surprise. The
 * two files enforce different boundaries — that one keeps the engine out of
 * the browser bundle, this one keeps cookie access out of it — but the
 * argument is identical, and a rule the compiler checks is worth more than one
 * a reviewer might.
 *
 * Not memoised, unlike the browser client. A server client is bound to one
 * request's cookie jar; caching it across requests would hand one user's
 * session to the next.
 */
export async function supabaseServer(): Promise<SupabaseClient | null> {
  if (!AUTH_CONFIGURED) return null;

  const store = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            store.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies, and this is called from both
          // them and route handlers. Swallowing here is the documented
          // pattern: the refreshed token is written by the proxy on the next
          // request, which *can* set them, so nothing is lost.
        }
      },
    },
  });
}

/**
 * The signed-in user, or `null` — for a project that isn't configured, a
 * visitor who isn't signed in, or a token that no longer validates.
 *
 * `getUser()` rather than `getSession()`, always. `getSession` reads the
 * cookie and trusts it; `getUser` revalidates the JWT with the auth server.
 * On a page that decides what to render from identity, trusting an unverified
 * cookie is the difference between an authorisation check and a suggestion.
 */
export async function currentUser() {
  const supabase = await supabaseServer();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}
