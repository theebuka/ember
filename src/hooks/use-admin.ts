"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/hooks/use-session";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AUTH_CONFIGURED } from "@/lib/supabase/config";

/**
 * Whether the signed-in user may write broadcasts, and whether their own account
 * has been suspended.
 *
 * Both are one row keyed on the user id, both are select-only from the browser,
 * and both default to the safe answer while unknown — not an admin, not
 * suspended. The same shape as `use-plan`, for the same reason: the client learns
 * what it is allowed to do and cannot change the answer, because neither
 * `admins` nor `suspensions` has a write policy the anon key can reach.
 *
 * **This is a convenience, not a control.** Nothing here is a permission check —
 * hiding the admin screen from a non-admin is a courtesy, and the actual refusal
 * happens in Postgres when an insert into `notices` fails the `is_admin()`
 * with-check. A client-side gate on a screen whose buttons the server would
 * reject anyway is decoration; a client-side gate on a screen whose buttons the
 * server would *accept* is a hole. This is the first kind.
 */
export function useAdmin(): { isAdmin: boolean; ready: boolean } {
  const { user, ready: sessionReady } = useSession();
  const [state, setState] = useState<{ isAdmin: boolean; ready: boolean }>({
    isAdmin: false,
    ready: false,
  });

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    void (async () => {
      const supabase = await supabaseBrowser();
      if (!supabase || cancelled) return;
      const { data } = await supabase
        .from("admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) setState({ isAdmin: data !== null, ready: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Nobody signed in, or no backend at all, is a definitive answer rather than a
  // pending one — nothing is going to arrive and change it.
  const nothingToRead = !user || !AUTH_CONFIGURED;
  return nothingToRead ? { isAdmin: false, ready: sessionReady } : state;
}

export interface SuspensionState {
  suspended: boolean;
  /** Written by an admin to be read by this person, so it is shown verbatim. */
  reason: string | null;
  ready: boolean;
}

/**
 * Whether this account's sync and delivery have been switched off.
 *
 * **Read so it can be said out loud.** A suspended account's writes are refused
 * by RLS, which from the device looks exactly like a sync that is broken — and
 * somebody would reasonably spend a day believing it was. The row is readable by
 * its owner precisely so ember can tell them instead, with the reason and with
 * what is *not* affected, which for a local-first app is nearly everything.
 */
export function useSuspension(): SuspensionState {
  const { user, ready: sessionReady } = useSession();
  const [state, setState] = useState<SuspensionState>({
    suspended: false,
    reason: null,
    ready: false,
  });

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    void (async () => {
      const supabase = await supabaseBrowser();
      if (!supabase || cancelled) return;
      const { data } = await supabase
        .from("suspensions")
        .select("reason")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) {
        setState({
          suspended: data !== null,
          reason: (data?.reason as string | null) ?? null,
          ready: true,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const nothingToRead = !user || !AUTH_CONFIGURED;
  return nothingToRead
    ? { suspended: false, reason: null, ready: sessionReady }
    : state;
}
