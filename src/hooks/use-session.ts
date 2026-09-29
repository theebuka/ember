"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
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
    const supabase = supabaseBrowser();
    if (!supabase) return;

    let alive = true;

    supabase.auth.getUser().then(({ data }) => {
      if (alive) setState({ user: data.user ?? null, ready: true, available: true });
    });

    // Covers sign-in, sign-out, token refresh and — the one that matters most
    // — a session established in *another tab*. Without this, signing in on
    // one tab leaves every other tab convinced it is a stranger until reload.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setState({ user: session?.user ?? null, ready: true, available: true });
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
