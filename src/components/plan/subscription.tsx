"use client";

import { Check, Sparkle } from "@/components/common/icon";
import { formatWhole, PRO_INCLUDES, useProPrice } from "@/components/plan/pricing";
import { Tag } from "@/components/signals/call-parts";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { usePlan } from "@/hooks/use-plan";
import { formatDate } from "@/lib/market/format";
import type { Billing, Subscription } from "@/lib/plan";


type Active = Extract<Subscription, { status: "active" }>;

/** "$12 a month", "$120 a year", in the reader's currency. */
export function usePriceLine(billing: Billing | null): string | null {
  const price = useProPrice(billing ?? "monthly");
  if (!billing) return null;
  return `${formatWhole(price.charged, price.currency)} a ${billing === "yearly" ? "year" : "month"}`;
}

/** One line: what happens next, and what it costs. */
export function renewalLine(sub: Active, price: string | null): string {
  if (sub.periodEnd === null) return "Added to this account, with nothing to renew";
  const date = formatDate(sub.periodEnd);
  if (!sub.renews) return `Ends ${date} and won't renew`;
  return price ? `Renews ${date} · ${price}` : `Renews ${date}`;
}

/**
 * A subscriber's plan page: what they have, when it renews, and what it covers.
 *
 * Replaces the comparison for a Pro account. Showing a subscriber the sales
 * table, with a price switch for a plan they already pay for, answers a question
 * they didn't ask and hides the two they did — when it renews, and how to change it.
 *
 * **Manage billing does not pretend**, for the same reason Get Pro doesn't: there
 * is no merchant of record yet (§7). Wiring one is `onManageBilling`.
 */
export function ProSummary({
  subscription,
  onManageBilling,
}: {
  subscription: Active;
  onManageBilling?: () => void;
}) {
  const price = usePriceLine(subscription.billing);
  const bought = subscription.periodEnd !== null;

  return (
    <div className="space-y-10">
      <section
        aria-label="Your plan"
        className="relative overflow-hidden rounded-xl border border-brand/35 bg-gradient-to-b from-brand-tint to-ground to-70% p-5 sm:p-6"
      >
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
            <Sparkle weight="fill" className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-heading font-semibold text-ink">ember Pro</h3>
            <p className="mt-0.5 text-caption text-stone">
              {renewalLine(subscription, price)}
            </p>
          </div>
        </div>

        {!subscription.renews && bought && (
          <p className="mt-4 max-w-[48ch] text-caption text-graphite">
            Nothing is removed when Pro ends. Your trades, watchlist and settings stay as they are.
          </p>
        )}

        {bought && (
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button
              variant="outline"
              className="bg-ground"
              disabled={!onManageBilling}
              onClick={onManageBilling}
            >
              Manage billing
            </Button>
            {!onManageBilling && (
              <span className="text-micro text-stone">Billing opens when checkout does.</span>
            )}
          </div>
        )}
      </section>

      <section>
        <h3 className="eyebrow">What&apos;s included</h3>
        <ul className="mt-3 space-y-3">
          {PRO_INCLUDES.map((item) => (
            <li key={item.feature} className="flex gap-3">
              <Check className="mt-0.5 size-[1.125rem] shrink-0 text-brand" />
              <span className="text-body text-ink">{item.text}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Above the comparison once Pro has lapsed: when, and that nothing went (decision 185). */
export function LapsedNote({ endedAt }: { endedAt: number }) {
  return (
    <div className="rounded-xl bg-surface-2 p-4 sm:p-5">
      <p className="text-body font-medium text-ink">Pro ended on {formatDate(endedAt)}</p>
      <p className="mt-1 max-w-[48ch] text-caption text-stone">
        Nothing was removed. Your trades, watchlist and settings are as you left them.
      </p>
    </div>
  );
}

/**
 * "Pro" beside the account, once it is true.
 *
 * Absent until hydrated and the plan has answered, so it never appears and then
 * leaves, and absent on free: a "Free" label would be a standing reminder to pay.
 */
export function PlanBadge({ className }: { className?: string }) {
  const hydrated = useHydrated();
  const { plan, ready } = usePlan();
  if (!hydrated || !ready || plan !== "pro") return null;
  return (
    <Tag tone="brand" className={className}>
      <Sparkle weight="fill" className="size-3" />
      Pro
    </Tag>
  );
}
