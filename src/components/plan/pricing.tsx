"use client";

import { useState } from "react";
import { Check, Sparkle } from "@/components/common/icon";
import { Segmented } from "@/components/common/segmented";
import { Button } from "@/components/ui/button";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useHydrated } from "@/hooks/use-hydrated";
import { useRates } from "@/hooks/use-market-data";
import { usePlan } from "@/hooks/use-plan";
import { formatMoney } from "@/lib/market/format";
import {
  PLAN_RULES,
  yearlySaving,
  type Billing,
  type Feature,
} from "@/lib/plan";
import { proPrice, type Price } from "@/lib/pricing";
import { usePreferences } from "@/store/use-preferences";
import { cn } from "@/lib/utils";

/**
 * The plan comparison — Free beside Pro, with a monthly/yearly switch.
 *
 * The shape is the category's: two columns with the current plan marked, a
 * billing switch whose saving is computed rather than typed, and a checklist
 * per plan (Linear, Vercel, Monarch, Copilot). What ember keeps from ADR 0038
 * is the register — no countdown, no trial clock, no count of other customers,
 * and brand rather than `up`, because a commercial prompt tinted like a gain is
 * the palette lying.
 *
 * **The button does not pretend.** There is no checkout (§7), so "Get Pro" is
 * visibly unavailable and the line under it says why. Wiring a merchant of
 * record later is `onGetPro` and nothing else.
 *
 * Every figure comes from `PLAN_RULES` and `PRO_PRICE_USD`; nothing on this card
 * is transcribed (ADR 0012's rule, applied to a pricing table).
 */
export function PlanComparison({
  feature,
  onGetPro,
  className,
}: {
  /** The limit that was hit, lit in Pro's list. */
  feature?: Feature;
  /** A checkout, once one exists. Absent, the button is honestly unavailable. */
  onGetPro?: (billing: Billing) => void;
  className?: string;
}) {
  const [billing, setBilling] = useState<Billing>("yearly");
  const { plan } = usePlan();
  const price = useProPrice(billing);
  const free = PLAN_RULES.free;
  const saving = Math.round(yearlySaving() * 100);

  const freeItems = [
    `The ${free.findings} most urgent findings`,
    `${free.alertsPerDay} push alerts a day`,
    "Every in-app alert, uncapped",
    "The full engine — windows, sizing, stops",
  ];
  const proItems: { text: string; feature: Feature }[] = [
    { text: "Every finding, ranked by urgency", feature: "unlimited-findings" },
    { text: "Push alerts with no daily cap", feature: "unlimited-alerts" },
    { text: "The digest by email, daily or weekly", feature: "email-digest" },
    { text: "No sponsor slots", feature: "no-sponsors" },
  ];

  return (
    <div className={cn("space-y-5", className)}>
      <div className="flex justify-center">
        <Segmented
          aria-label="Billing"
          size="sm"
          value={billing}
          onChange={setBilling}
          options={[
            { value: "monthly", label: "Monthly" },
            {
              value: "yearly",
              label: (
                <span className="flex items-center gap-1.5">
                  Yearly
                  <span className="rounded-full bg-brand-tint px-1.5 text-micro font-semibold text-brand-text">
                    −{saving}%
                  </span>
                </span>
              ),
            },
          ]}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Pro first on a phone, where the columns stack: it is what the reader
            opened this to look at. Free first beside it, where left-to-right is
            the order a comparison is read in. */}
        <PlanColumn
          className="max-sm:order-2"
          name="Free"
          amount={formatWhole(0, price.currency)}
          cadence="/mo"
          sub="No account needed"
          lead="Always included"
          items={freeItems.map((text) => ({ text, lit: false }))}
          action={plan === "free" ? <CurrentPlan /> : <CurrentPlan hidden />}
        />

        <PlanColumn
          highlighted
          name="Pro"
          amount={formatWhole(price.perMonth, price.currency)}
          cadence="/mo"
          sub={
            billing === "yearly"
              ? `${formatWhole(price.charged, price.currency)} billed yearly`
              : "Billed monthly"
          }
          lead="Everything in Free, plus"
          items={proItems.map((item) => ({
            text: item.text,
            lit: item.feature === feature,
          }))}
          action={
            plan === "pro" ? (
              <CurrentPlan />
            ) : (
              <div>
                <Button
                  size="lg"
                  // Unavailable, but crisp: a 40%-opacity brand fill read as a
                  // broken button rather than a closed one.
                  className="w-full disabled:bg-brand-tint disabled:text-brand-text disabled:opacity-100"
                  disabled={!onGetPro}
                  onClick={onGetPro ? () => onGetPro(billing) : undefined}
                >
                  <Sparkle weight="fill" />
                  Get Pro
                </Button>
                {!onGetPro && (
                  <p className="mt-2 text-center text-micro text-stone">
                    Checkout isn&apos;t open yet.
                  </p>
                )}
              </div>
            )
          }
        />
      </div>
    </div>
  );
}

/**
 * The plan you are on, as a label shaped like the button beside it — not a
 * disabled button, which reads as something broken. `hidden` keeps its height
 * on the column that has no action, so the two lists still start level.
 */
function CurrentPlan({ hidden = false }: { hidden?: boolean }) {
  return (
    <div
      aria-hidden={hidden}
      className={cn(
        "flex h-12 items-center justify-center rounded-full border border-line text-caption font-medium text-stone",
        hidden && "invisible",
      )}
    >
      Your current plan
    </div>
  );
}

function PlanColumn({
  name,
  highlighted = false,
  amount,
  cadence,
  sub,
  lead,
  items,
  action,
  className,
}: {
  name: string;
  highlighted?: boolean;
  amount: string;
  cadence: string;
  sub: string;
  lead: string;
  items: { text: string; lit: boolean }[];
  action: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={`${name} plan`}
      className={cn(
        "flex flex-col rounded-xl border p-5",
        highlighted
          ? "border-brand/35 bg-gradient-to-b from-brand-tint to-ground to-60%"
          : "border-line bg-ground",
        className,
      )}
    >
      <h3 className="flex items-center gap-1.5 text-body font-semibold text-ink">
        {highlighted && <Sparkle weight="fill" className="size-4 text-brand" />}
        {name}
      </h3>

      <p className="mt-4 flex items-baseline gap-1">
        <span className="figure text-display text-ink">{amount}</span>
        <span className="text-caption text-stone">{cadence}</span>
      </p>
      <p className="mt-1 text-micro text-stone">{sub}</p>

      <div className="mt-5">{action}</div>

      <div className="mt-5 border-t border-line pt-4">
        {/* Both columns carry a lead, so the two lists start on one line. */}
        <p className="mb-2.5 text-micro font-medium text-graphite">{lead}</p>
        <ul className="space-y-2.5">
          {items.map((item) => (
            <li key={item.text} className="flex gap-2.5">
              <Check
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  highlighted ? "text-brand" : "text-stone",
                )}
              />
              <span
                className={cn(
                  "text-caption",
                  item.lit ? "font-semibold text-ink" : "text-graphite",
                )}
              >
                {item.text}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Pro's price in the reader's base currency, or in dollars.
 *
 * Dollars until hydration: the base currency lives in `localStorage` and a warm
 * rates cache can answer before React has finished hydrating, so a server
 * render in anything else is a mismatch (decisions 224, 250). Dollars also when
 * an admin has switched local pricing off (`app_settings`, 0009).
 */
export function useProPrice(billing: Billing): Price {
  const hydrated = useHydrated();
  const base = usePreferences((s) => s.baseCurrency);
  const { pricing_local_currency: local } = useAppSettings();
  const rates = useRates().data?.rates;
  const currency = hydrated && local ? base : "USD";
  return proPrice(billing, currency, hydrated ? rates : undefined);
}

/**
 * A price, without cents when it has none — `$12`, `£9.50`, `₦16,000`.
 *
 * The narrow symbol, because on a price tag the reader's own currency is the
 * only one on screen and `NGN 16,000` reads as a ledger entry. Except for the
 * other dollars: a Canadian price as a bare `$10` is indistinguishable from the
 * US one beside it, so those keep `CA$`, `A$`, `NT$`.
 */
export function formatWhole(
  value: number,
  currency: Price["currency"],
): string {
  const decimals = Number.isInteger(value) ? 0 : 2;
  const narrow = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  return narrow.startsWith("$") && currency !== "USD"
    ? formatMoney(value, currency, { decimals })
    : narrow;
}
