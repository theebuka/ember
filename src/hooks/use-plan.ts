"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/hooks/use-session";
import { planFrom, subscriptionFrom, type EntitlementRow, type Plan, type Subscription } from "@/lib/plan";
import { PLAN_PREVIEW_ENABLED, previewed, usePlanPreview } from "@/lib/plan-preview";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AUTH_CONFIGURED } from "@/lib/supabase/config";

/**
 * Which plan the current user is on.
 *
 * **Free is the answer to every uncertainty**, and it is the right default in all
 * three of the cases that produce one: no Supabase project configured, no session,
 * or the entitlements read still in flight. ember has always worked with no
 * account (ADR 0031), so free is a normal state rather than a degraded one — and
 * defaulting the other way would flash Pro features at a free user for a frame,
 * which is the one direction of wrong that matters.
 *
 * `entitlements` has a select-only policy and no write policy at all, so this read
 * is the whole story: the client learns what it is entitled to and cannot change
 * it. That is why the plan is not a column on `profiles`, where the existing
 * self-update policy would have made it writable — see ADR 0038.
 */
export function usePlan(): {
  plan: Plan;
  ready: boolean;
  subscription: Subscription;
  /** Read the entitlement again — the success screen polls while a payment lands. */
  refresh: () => void;
} {
  const { user, ready: sessionReady } = useSession();
  /**
   * **Keyed by the account it was read for.** It was a bare `Plan`, never
   * cleared, so signing out of a Pro account left `entitled` at "pro" — and the
   * signed-out branch below returns `entitled ?? "free"`, so the app went on
   * treating a stranger as a customer until reload: no sponsor row, uncapped
   * findings. A second account signing in on the same device inherited the
   * first one's plan, reported as `ready`, for the length of its own read.
   * Answering only for the id it was fetched for makes both impossible.
   */
  const [entitled, setEntitled] = useState<{
    userId: string;
    plan: Plan;
    subscription: Subscription;
  } | null>(null);
  const [reads, setReads] = useState(0);
  const refresh = useCallback(() => setReads((n) => n + 1), []);
  const preview = usePlanPreview();

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    void (async () => {
      const supabase = await supabaseBrowser();
      if (!supabase || cancelled) return;
      // `*` rather than named columns: PostgREST refuses a select naming a
      // column that doesn't exist, so naming 0010's would fail outright on a
      // project that hasn't applied it.
      const { data } = await supabase
        .from("entitlements")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle<EntitlementRow>();
      if (!cancelled) {
        setEntitled({
          userId: user.id,
          plan: planFrom(data),
          subscription: subscriptionFrom(data),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, reads]);

  /**
   * Derived, so there is one source of truth for "settled" rather than a flag
   * that has to be written from three branches.
   *
   * A visitor with no session, or a deployment with no backend, is **definitively**
   * free rather than pending — nothing is going to arrive and change the answer.
   * Leaving them pending would park every gated surface in a loading state that
   * never resolves, which is a worse failure than being briefly wrong.
   */
  if (PLAN_PREVIEW_ENABLED && preview !== "off") {
    return { ...previewed(preview), ready: true, refresh };
  }

  const nothingToRead = !user || !AUTH_CONFIGURED;
  const mine = user && entitled?.userId === user.id ? entitled : null;
  return {
    plan: nothingToRead ? "free" : (mine?.plan ?? "free"),
    ready: nothingToRead ? sessionReady : mine !== null,
    subscription: mine?.subscription ?? { status: "none" },
    refresh,
  };
}
