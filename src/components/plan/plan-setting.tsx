"use client";

import { useState } from "react";
import { Sparkle } from "@/components/common/icon";
import { PlanInterstitial } from "@/components/plan/upsell";
import { SettingGroup, SettingRow } from "@/components/settings/setting-row";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/hooks/use-plan";
import { PLAN_LABELS, PLAN_RULES } from "@/lib/plan";
import { AUTH_CONFIGURED } from "@/lib/supabase/config";

/**
 * Which plan you are on, and what each one actually does.
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
  const { plan, ready } = usePlan();
  const [open, setOpen] = useState(false);

  // No backend, no plan concept. Same treatment as every other account control:
  // absent rather than disabled, because a disabled control is a claim about a
  // setting and this one would be a claim about a setting that does not exist.
  if (!AUTH_CONFIGURED) return null;

  const rules = PLAN_RULES[plan];

  const rows: { label: string; value: string }[] = [
    {
      label: "Findings shown",
      value: rules.findings === null ? "All of them" : `The ${rules.findings} most urgent`,
    },
    {
      label: "Push a day",
      value: rules.alertsPerDay === null ? "Uncapped" : String(rules.alertsPerDay),
    },
    { label: "Email digest", value: rules.emailDigest ? "Included" : "Not included" },
    { label: "Sponsor slots", value: rules.sponsors ? "Shown" : "None" },
  ];

  return (
    <section>
      <SettingGroup>
        <SettingRow
          label="Your plan"
          description={
            plan === "pro"
              ? "Everything is included."
              : "The engine answers the same on either plan. Only how much of it reaches you differs."
          }
          control={
            <span className="flex items-center gap-2">
              <span className="text-caption font-semibold text-ink">
                {ready ? PLAN_LABELS[plan] : "—"}
              </span>
              {plan === "pro" && (
                <Sparkle weight="fill" className="size-4 text-brand" />
              )}
            </span>
          }
        >
          <dl className="mt-3.5 divide-y divide-line border-t border-line">
            {rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between py-2">
                <dt className="text-caption text-stone">{row.label}</dt>
                <dd className="num text-caption font-medium text-graphite">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>

          <Button
            variant="outline"
            size="sm"
            className="mt-3.5"
            onClick={() => setOpen(true)}
          >
            Compare the plans
          </Button>

          <p className="mt-3.5 text-micro text-stone">
            The methodology and the track record are open to everyone on every plan,
            without an account. They&apos;re how you check whether any of this works,
            and that isn&apos;t something to sell.
          </p>
        </SettingRow>
      </SettingGroup>

      <PlanInterstitial open={open} onOpenChange={setOpen} />
    </section>
  );
}
