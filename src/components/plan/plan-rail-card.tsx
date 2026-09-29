"use client";

import { useState } from "react";
import { Sparkle } from "@/components/common/icon";
import { PlanInterstitial } from "@/components/plan/upsell";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { usePlan } from "@/hooks/use-plan";

/**
 * The standing note about Pro, at the foot of the desktop rail.
 *
 * **This is the one upsell in the app that is not tied to a limit being hit**,
 * and that is worth saying plainly because ADR 0038's rule is "at most one per
 * screen, and only where a limit actually bit". Asked for directly, and the
 * reason it is defensible in this one place: the rail is *chrome*. It is not the
 * screen, it does not sit inside anything the reader came to do, and it is the
 * conventional home for exactly this. A card that appeared over a position or
 * beside a finding would be interrupting; a card in the navigation is a standing
 * fact about the account, in the place accounts live.
 *
 * What it is **not** allowed to become, and the rules it still keeps:
 *
 *   **No urgency.** No countdown, no trial ending, no "3 days left", no count of
 *   what other people are on. It says the same sentence on the first day and the
 *   thousandth.
 *
 *   **The button does not lie.** Every reference for this pattern says "Upgrade
 *   plan", and ember has no checkout — §7 has three unresolved blockers before it
 *   can take a payment. A button labelled Upgrade that opens an explainer is a
 *   dark pattern in miniature, so the button says what it does.
 *
 *   **Brand, never `up`.** The direction colours mean money moved (§5). A
 *   commercial prompt tinted like a gain blurs the one distinction the palette
 *   exists to keep — which is also why this is a filled well with a hairline
 *   rather than the black slab the pattern usually ships as. On light, `ground`
 *   and `surface` are the same white, so a card that wanted to lift off the page
 *   would have had to shout to do it (ADR 0024).
 *
 * Absent on Pro, absent while the entitlement read is in flight, and absent
 * before hydration — a card that appears a beat after the rail settles is the
 * layout shift this app measures, in the one component that is on every screen.
 */
export function PlanRailCard() {
  const hydrated = useHydrated();
  const { plan, ready } = usePlan();
  const [open, setOpen] = useState(false);

  if (!hydrated || !ready || plan !== "free") return null;

  return (
    <div className="px-3 pb-1">
      <div className="rounded-xl border border-line bg-ground p-3.5">
        <h2 className="flex items-center gap-2 text-caption font-semibold text-ink">
          <Sparkle weight="fill" className="size-4 shrink-0 text-brand" />
          ember Pro
        </h2>

        {/* One line. This sits above the profile control at the bottom of a
            240px column, and a paragraph here is decision 212's wall of text
            arriving in the chrome instead of on the page. */}
        <p className="mt-1 text-micro text-stone">
          Every finding, uncapped push, and the digest by email.
        </p>

        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          onClick={() => setOpen(true)}
        >
          What Pro includes
        </Button>
      </div>

      <PlanInterstitial open={open} onOpenChange={setOpen} />
    </div>
  );
}
