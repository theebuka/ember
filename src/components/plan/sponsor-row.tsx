"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "@/components/common/icon";
import { usePlan } from "@/hooks/use-plan";
import { showsSponsors } from "@/lib/plan";
import { AUTH_CONFIGURED } from "@/lib/supabase/config";
import { publicRows } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Slot = "news" | "signals" | "portfolio";

interface Sponsor {
  id: string;
  sponsor: string;
  copy: string;
  href: string;
}

/**
 * The one advertisement ember will show, and it serves it itself.
 *
 * **No third-party script, no iframe, no pixel, no remote origin.** A network tag
 * would learn which instruments a reader looks at — for a finance app that is a
 * list of what somebody is thinking about doing with their money — and it would
 * learn it from the one product whose argument is that it does not watch you. So a
 * sponsor is four fields in a Postgres row, rendered in ember's own type, and there
 * is nothing to block, nothing to leak and nothing to load from anywhere else.
 *
 * The consequence is commercial and worth stating: **ember cannot tell a sponsor
 * how many people saw this.** There is no impression count and no click count. The
 * answer when somebody asks is aggregate server-side counting, which needs
 * designing rather than reaching for — recorded in §8 rather than solved with the
 * pixel that would solve it in ten minutes.
 *
 * At most one per screen, absent entirely for Pro, and absent for everyone when
 * there is no backend — which is what makes "no ads" a thing to sell rather than a
 * promise about volume.
 */
export function SponsorRow({ slot, className }: { slot: Slot; className?: string }) {
  const { plan, ready } = usePlan();
  const [sponsor, setSponsor] = useState<Sponsor | null>(null);

  const wanted = AUTH_CONFIGURED && ready && showsSponsors(plan);

  useEffect(() => {
    // Only asked for when it would be drawn: a Pro reader never sees a sponsor,
    // so they never fetch one.
    if (!wanted) return;
    const controller = new AbortController();
    // The active-window filter is in the RLS policy, not here: an expired
    // sponsor is invisible to every reader rather than to the readers whose
    // client happened to filter correctly.
    void publicRows<Sponsor>(
      `sponsors?select=id,sponsor,copy,href&slot=eq.${slot}&order=starts_at.desc&limit=1`,
      controller.signal,
    ).then((rows) => {
      if (!controller.signal.aborted) setSponsor(rows?.[0] ?? null);
    });
    return () => controller.abort();
  }, [slot, wanted]);

  // Nothing to show, or nothing that should be shown. Rendering an empty
  // placeholder would reserve space for an advertisement that does not exist,
  // which is the one kind of layout shift that annoys everybody.
  if (!wanted || !sponsor) return null;

  return (
    <a
      href={sponsor.href}
      target="_blank"
      // `noopener` for the obvious reason, and `noreferrer` because ember has no
      // business telling a sponsor which page a reader came from.
      rel="noopener noreferrer sponsored"
      className={cn(
        "tap-target flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3.5",
        "transition-colors hover:bg-surface-2/70",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {/* Labelled before it is read, not after. A sponsored row a reader works
            out afterwards is a row that borrowed the app's credibility first. */}
        <p className="eyebrow text-stone">Sponsored · {sponsor.sponsor}</p>
        <p className="mt-1 text-caption text-graphite">{sponsor.copy}</p>
      </div>
      <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-stone" />
    </a>
  );
}
