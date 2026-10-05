"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { hasSessionCookie, supabaseBrowser } from "@/lib/supabase/client";
import { AUTH_CONFIGURED } from "@/lib/supabase/config";

export interface SessionState {
  /** Null while unknown, and null for a signed-out visitor. Check `ready`. */
  user: User | null;
  /** False until the first answer arrives, so nothing flashes signed-out. */
  ready: boolean;
  /** False when no Supabase project is configured — there is nothing to join. */
  available: boolean;
}

/**
 * Who is signed in, if anyone, if that is even a question here.
 *
 * **`ready` is separate from `user` on purpose.** Without it every consumer
 * has to treat "we don't know yet" as "signed out", and the visible result is
 * a Sign-in button that appears for a moment on every page load for someone
 * who is already signed in — the auth equivalent of the hydration flashes ADR
 * 0017 exists to prevent. The session is read from `localStorage` and then
 * revalidated, so the gap is short but it is never zero.
 *
 * **`available` is not the same as signed out.** With no project configured
 * there is nothing to sign in to, and the honest interface is to show no
 * account controls at all rather than a button that cannot work. That is the
 * same shape as `synthetic` on the data-source chip: the app says which mode
 * it is in rather than pretending there is only one.
 */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({
    user: null,
    ready: !AUTH_CONFIGURED,
    available: AUTH_CONFIGURED,
  });

  useEffect(() => {
    if (!AUTH_CONFIGURED) return;

    let alive = true;
    let unsubscribe: (() => void) | null = null;

    const connect = async () => {
      const supabase = await supabaseBrowser();
      if (!supabase || !alive || unsubscribe) return;

      // Covers sign-in, sign-out, token refresh and a session established in
      // another tab. Its first event carries the stored session, so it also
      // answers "who is this" — without `getUser()`'s round trip to Supabase on
      // every page load, which the findings inbox (through `usePlan`) was
      // waiting on. Postgres still checks the token on every query (RLS); this
      // is only who the screen says is signed in.
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        if (alive) setState({ user: session?.user ?? null, ready: true, available: true });
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    };

    /**
     * **No session cookie, no library.** Somebody who has never signed in —
     * most readers — is answered "signed out" without downloading the client
     * at all. A sign-in completes through `/auth/callback`, which sets the
     * cookie and reloads, so the next page connects. Coming back to the tab
     * re-checks, for a sign-in finished in another one.
     */
    const check = () => {
      if (hasSessionCookie()) {
        void connect();
      } else if (!unsubscribe) {
        void Promise.resolve().then(() => {
          if (alive) setState({ user: null, ready: true, available: true });
        });
      }
    };

    check();
    window.addEventListener("focus", check);
    return () => {
      alive = false;
      window.removeEventListener("focus", check);
      unsubscribe?.();
    };
  }, []);

  return state;
}
