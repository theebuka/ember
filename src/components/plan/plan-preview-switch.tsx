"use client";

import Link from "next/link";
import { Segmented } from "@/components/common/segmented";
import { useHydrated } from "@/hooks/use-hydrated";
import { PLAN_PREVIEWS, setPlanPreview, usePlanPreview } from "@/lib/plan-preview";
import { cn } from "@/lib/utils";

/** Development only: see each subscriber state without a checkout. */
export function PlanPreviewSwitch({ className }: { className?: string }) {
  const preview = usePlanPreview();
  const hydrated = useHydrated();
  if (!hydrated) return null;
  return (
    <section className={cn("space-y-3 rounded-xl border border-dashed border-line p-4", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-caption font-medium text-graphite">Preview a plan state</h3>
        <span className="text-micro text-stone">Development only</span>
      </div>
      <div className="no-scrollbar -mx-1 overflow-x-auto px-1">
        <Segmented
          aria-label="Preview a plan state"
          size="sm"
          value={preview}
          onChange={setPlanPreview}
          options={PLAN_PREVIEWS.map((p) => ({ value: p.value, label: p.label }))}
        />
      </div>
      <Link
        href="/pro/welcome"
        className="inline-block text-caption text-brand-text underline-offset-4 hover:underline"
      >
        Open the success screen
      </Link>
    </section>
  );
}
