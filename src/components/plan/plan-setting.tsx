"use client";

import { PlanComparison } from "@/components/plan/pricing";
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
export function PlanSetting() {
  // No backend, no plan concept. Same treatment as every other account control:
  // absent rather than disabled, because a disabled control is a claim about a
  // setting and this one would be a claim about a setting that does not exist.
  if (!AUTH_CONFIGURED) return null;

  return (
    <section className="space-y-4">
      <PlanComparison />
    </section>
  );
}
