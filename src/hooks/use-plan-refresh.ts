"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePlan } from "@/hooks/use-plan";
import { setPlanHint } from "@/lib/api/client";
import type { Plan } from "@/lib/plan";

/**
 * Refetches what a plan locks when the plan changes — signing in or out, a
 * redeemed code, a payment landing.
 *
 * The server decides what each response holds (decision 288), so nothing here
 * unlocks anything; it only stops the screens showing an answer given to the
 * plan this browser used to be on. Mounted once, in `AppShell`.
 */
export function usePlanRefresh(): void {
  const { plan, ready } = usePlan();
  const queryClient = useQueryClient();
  const last = useRef<Plan | null>(null);

  useEffect(() => {
    if (!ready) return;
    setPlanHint(plan);
    if (last.current !== null && last.current !== plan) {
      for (const key of ["advice", "findings", "asset", "track-record"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    }
    last.current = plan;
  }, [plan, ready, queryClient]);
}
