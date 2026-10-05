"use client";

import { PlanComparison } from "@/components/plan/pricing";
import dynamic from "next/dynamic";
import { LapsedNote, ProSummary } from "@/components/plan/subscription";
import { RedeemCode } from "@/components/plan/redeem-code";
import { usePlan } from "@/hooks/use-plan";
import { AUTH_CONFIGURED } from "@/lib/supabase/config";

/**
 * Which plan you are on, and what each one actually does — the same
 * `PlanComparison` the modal shows, inline.
 *
 * The table is generated from `PLAN_RULES`, not written out here, for the same
 * reason the methodology page is derived from the strategy registry (ADR 0012): a
 * pricing table transcribed by hand is a document that was true once, and on a
 * product whose argument is "you can check this", a stale limit is worse than no
 * table.
 *
 * **It says there is no checkout, plainly.** §7 has three unresolved blockers
 * before ember can charge anybody — no merchant of record with Nigerian payouts, a
 * host that forbids commercial use, and an unlicensed price feed. A "coming soon"
 * with an email field would be collecting addresses for a thing that does not
 * exist, and there is nothing to do with them yet.
 */
// Loaded only in development. `NODE_ENV` is written out here rather than read
// from `PLAN_PREVIEW_ENABLED`: an imported constant isn't folded at build time,
// so the import survived into production as a dead chunk.
const PlanPreviewSwitch = process.env.NODE_ENV !== "production"
  ? dynamic(() => import("@/components/plan/plan-preview-switch").then((m) => m.PlanPreviewSwitch))
  : () => null;

export function PlanSetting() {
  // No backend, no plan concept. Same treatment as every other account control:
  // absent rather than disabled, because a disabled control is a claim about a
  // setting and this one would be a claim about a setting that does not exist.
  const { subscription } = usePlan();
  if (!AUTH_CONFIGURED) return null;

  // A subscriber sees their plan, not the sales table; a lapsed one sees when it
  // ended above the table, so rejoining is one press and nothing reads as lost.
  return (
    <div className="space-y-10">
      {subscription.status === "active" ? (
        <ProSummary subscription={subscription} />
      ) : (
        <section className="space-y-5">
          {subscription.status === "lapsed" && <LapsedNote endedAt={subscription.endedAt} />}
          <PlanComparison />
        </section>
      )}
      <RedeemCode />
      <PlanPreviewSwitch />
    </div>
  );
}
