import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { AUTH_CONFIGURED, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/**
 * Refresh the session at the edge, and hand back a response carrying the new
 * cookies.
 *
 * A Supabase access token lives about an hour and the refresh happens in
 * whichever context notices first. Server Components **cannot set cookies**,
 * so if the refresh happens there the new token is computed and then thrown
 * away — every server render revalidates, and a user who leaves a tab open
 * overnight comes back signed out despite holding a perfectly good refresh
 * token. The proxy is the one place that both runs on every request and is
 * allowed to write cookies, which is why the refresh belongs here.
 *
 * Returns `null` when there is no project configured, so the caller can skip
 * the whole thing rather than construct a client that has nothing to talk to.
 */
const REFRESH_BUDGET_MS = 1500;

export async function refreshSession(
  request: NextRequest,
): Promise<NextResponse | null> {
  if (!AUTH_CONFIGURED) return null;

  /**
   * No auth cookie, nothing to refresh — and that is most requests. `@supabase/ssr`
   * names its cookies `sb-<ref>-auth-token`, split into `.0`, `.1` chunks when
   * large, so a prefix match covers both.
   */
  const hasSession = request.cookies
    .getAll()
    .some(({ name }) => name.startsWith("sb-") && name.includes("-auth-token"));
  if (!hasSession) return null;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) {
          request.cookies.set(name, value);
        }
        // A fresh response, built from the mutated request, so the cookies are
        // visible to the render *and* set on the way back out. Mutating the
        // old one would update the browser and leave this request's render
        // reading the stale jar.
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Required, not incidental: `getUser()` is what triggers the refresh. Drop
  // this call and the cookie handler above never fires.
  /**
   * **Bounded, because every page waits on it.** `getUser()` is a round trip to
   * Supabase on every navigation by a signed-in reader — measured at 757ms in
   * development — and a free-tier project that has paused does not refuse, it
   * hangs. ADR 0031 made accounts optional precisely so a sleeping project could
   * not take the app down; an unbounded await here quietly undid that for
   * everybody who had ever signed in.
   *
   * Losing the race is safe. The browser client refreshes its own session, the
   * page renders as it would have, and the only cost is that this request did
   * not rotate the cookie — the next one will try again.
   */
  const refreshed = await Promise.race([
    supabase.auth.getUser().then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), REFRESH_BUDGET_MS)),
  ]).catch(() => false);

  return refreshed ? response : null;
}
