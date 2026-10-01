"use client";

import { useState } from "react";
import { Sparkle } from "@/components/common/icon";
import { Button } from "@/components/ui/button";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { PlanComparison } from "@/components/plan/pricing";
import { UPSELL, type Feature } from "@/lib/plan";
import { cn } from "@/lib/utils";

/**
 * The three ways ember is allowed to mention Pro, and nothing else.
 *
 * One vocabulary, stated once, because an upsell pattern that grows organically
 * ends up with six shapes and one of them shouting. The rules, from ADR 0038:
 *
 * **Sentence case, names its outcome, no urgency.** No countdowns, no "limited
 * time", no counts of what other people are doing, no red, no exclamation marks.
 * The phase 14–16 review proposed a blurred timer reading "Pro users exited this
 * trade 11 minutes ago with a +2.4% peak gain" — manufactured anxiety pointed at
 * ember's own users, and permanently out.
 *
 * **At most one per screen, and only where a limit has actually bitten.** Never
 * pre-emptively, never on a surface the user did not hit a limit on. An app that
 * asks everywhere is an app whose free tier is an advert.
 *
 * **Brand, not `up`/`down`.** The direction colours mean money moved. A commercial
 * prompt tinted like a gain is the app blurring the one distinction its palette
 * exists to keep (§5).
 */

/* ── The chip ────────────────────────────────────────────────────────────── */

/**
 * An inline marker on something a free plan cannot reach.
 *
 * Says what the thing *is* rather than what you are missing — "Pro", not "Locked",
 * and certainly not "Upgrade to unlock". A padlock on a feature is the visual
 * language of a paywall; a quiet label is the language of a tier.
 */
export function PlanChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-brand-tint px-1.5 py-0.5",
        "text-micro font-medium text-brand-text",
        className,
      )}
    >
      <Sparkle weight="fill" className="size-3" />
      Pro
    </span>
  );
}

/* ── The card ────────────────────────────────────────────────────────────── */

/**
 * A section-level pitch, used at the point a limit was reached.
 *
 * Not a `Card`: on light `ground` and `surface` are the same value, so a card
 * cannot lift off the page by value and has to earn its edges (ADR 0024). This is
 * a filled well with a hairline, which is what the rest of the app uses for a
 * block that is beside the content rather than above it.
 */
export function PlanCard({
  feature,
  className,
}: {
  feature: Feature;
  className?: string;
}) {
  const { title, body } = UPSELL[feature];
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface-2 p-4",
        className,
      )}
    >
      <h3 className="flex items-center gap-2 text-caption font-semibold text-ink">
        <Sparkle weight="fill" className="size-4 text-brand" />
        {title}
      </h3>
      <p className="mt-1.5 text-caption text-stone">{body}</p>
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={() => setOpen(true)}
      >
        See plans
      </Button>
      <PlanInterstitial feature={feature} open={open} onOpenChange={setOpen} />
    </div>
  );
}

/* ── The interstitial ────────────────────────────────────────────────────── */

/**
 * One modal, and only from a deliberate press.
 *
 * Never opened by a timer, a scroll position, an exit intent or a visit count. A
 * modal that appears because you did something is a response; one that appears
 * because time passed is an interruption, and this app has exactly one
 * interruption budget which the alerts already spend.
 *
 * The body is `PlanComparison` — the same two columns the Plan tab shows — so
 * the modal and the settings page cannot describe different plans.
 */
export function PlanInterstitial({
  feature,
  open,
  onOpenChange,
}: {
  /**
   * The limit that was hit, which titles the modal and is lit in Pro's list.
   * Omitted when opened from somewhere no limit bit — the rail card, the Plan tab.
   */
  feature?: Feature;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={feature ? UPSELL[feature].title : "Plans"}
      description={
        feature
          ? UPSELL[feature].body
          : "Both plans get the same analysis. Pro shows you more of it."
      }
      className="sm:max-w-2xl"
    >
      <div className="min-h-0 overflow-y-auto p-4 md:p-5">
        <PlanComparison feature={feature} />
      </div>
    </ResponsiveModal>
  );
}
