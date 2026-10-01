"use client";

import { Segmented } from "@/components/common/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useRiskPreview } from "@/hooks/use-market-data";
import type { RiskProfilePreview } from "@/lib/api/types";
import { RISK_PROFILES, type RiskProfile } from "@/lib/api/types";
import { formatPercent, formatRatio } from "@/lib/market/format";
import { cn } from "@/lib/utils";

const OPTIONS = (Object.keys(RISK_PROFILES) as RiskProfile[]).map((value) => ({
  value,
  label: RISK_PROFILES[value].label,
}));

/**
 * The one setting that changes the product rather than its presentation.
 *
 * It moves the family weights, the volatility target, the position cap and the
 * bar a call has to clear to reach the feed — so a control offering three
 * words and no consequence would be asking the user to pick a personality for
 * an engine they can't see.
 *
 * Two things are shown instead of that. The profile's own plain-language
 * consequence, which is authored and lives beside the numbers it describes in
 * `RISK_PROFILES`. And a comparison **measured on today's market**: how many
 * instruments actually clear each profile's bar, from `/api/risk-preview`,
 * which runs the same ensemble three times. That second half is the whole
 * argument of the app applied to a settings row — the figure is the engine's
 * output, not an illustration of it.
 *
 * It also tells the truth about restraint. On the current universe a
 * Conservative profile surfaces a handful of calls out of the universe, and a
 * user who picks it and then finds a near-empty feed should have been told
 * that here rather than left to conclude the app is broken.
 *
 * Building this is what exposed the profiles not actually differing — see
 * `isActionable`, and ADR 0013.
 */
export function RiskProfileSetting({
  value,
  onChange,
  bleed = false,
  className,
}: {
  value: RiskProfile;
  onChange: (value: RiskProfile) => void;
  /**
   * Let the comparison span a card's full width.
   *
   * Four columns and a row label need every pixel: inside a card the 20px of
   * padding either side is the difference between one-line row labels and
   * three-line ones on a 375px screen. Set by the settings screen, which puts
   * this in a card; onboarding is already full-bleed and leaves it off.
   */
  bleed?: boolean;
  className?: string;
}) {
  const preview = useRiskPreview();
  const profiles = preview.data?.profiles;

  return (
    <div className={className}>
      <Segmented
        aria-label="Risk profile"
        value={value}
        onChange={onChange}
        options={OPTIONS}
        className="flex w-full [&>button]:flex-1"
      />

      <p className="mt-3 text-caption text-stone">
        {RISK_PROFILES[value].consequence}
      </p>

      <div
        className={cn(
          "mt-4 border-line",
          // -mx-5 tracks `--card-spacing`; the two move together.
          // Tracks `PageBody`'s padding, which steps to 16px below 360px so
          // the header's four controls fit at 320. A fixed `-mx-5` there
          // hangs 4px off each edge and scrolls the page sideways.
          bleed ? "-mx-4 border-y min-[360px]:-mx-5" : "rounded-xl border",
        )}
      >
        {preview.isPending ? (
          <ComparisonSkeleton />
        ) : profiles ? (
          <Comparison profiles={profiles} selected={value} />
        ) : (
          <p className="p-3.5 text-caption text-stone">
            Today&apos;s comparison didn&apos;t load, so these are the profile settings only.
            {" "}
            {STATIC_SUMMARY[value]}
          </p>
        )}
      </div>
    </div>
  );
}

/** The fallback when the preview request fails — never a blank panel. */
const STATIC_SUMMARY: Record<RiskProfile, string> = {
  conservative: "Conservative caps a position at 8% and targets 8% annual volatility.",
  balanced: "Balanced caps a position at 15% and targets 14% annual volatility.",
  aggressive: "Aggressive caps a position at 25% and targets 22% annual volatility.",
};

function Comparison({
  profiles,
  selected,
}: {
  profiles: RiskProfilePreview[];
  selected: RiskProfile;
}) {
  const assessed = profiles[0]?.assessed ?? 0;

  const rows: {
    label: string;
    hint: string;
    render: (p: RiskProfilePreview) => string;
  }[] = [
    // Labels are single words wherever possible: the row header column has to
    // fit inside a third of a 375px screen, and a two-word label there wraps
    // to three lines once its hint wraps too.
    {
      label: "In the feed",
      hint: `of ${assessed} assessed`,
      render: (p) => String(p.actionable),
    },
    {
      label: "Conviction",
      hint: "score, 0–1",
      render: (p) => formatRatio(p.actionThreshold),
    },
    {
      label: "Evidence",
      hint: "confidence, 0–100",
      render: (p) => String(p.confidenceFloor),
    },
    {
      label: "Typical size",
      hint: "of the book",
      // An em dash rather than 0%: a profile recommending nothing has no
      // typical size, and printing zero would say it recommends nothing-sized
      // positions.
      render: (p) =>
        p.typicalSize === null ? "—" : formatPercent(p.typicalSize, { decimals: 1 }),
    },
    {
      label: "Position cap",
      hint: "hard limit",
      render: (p) => formatPercent(p.maxWeight, { decimals: 0 }),
    },
    {
      label: "Volatility",
      hint: "target, a year",
      render: (p) => formatPercent(p.volTarget, { decimals: 0 }),
    },
  ];

  return (
    <>
      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">
          What each risk profile would recommend on today&apos;s market
        </caption>
        <thead>
          <tr>
            <th scope="col" className="w-[30%] px-3 pt-3 pb-2 text-left">
              <span className="eyebrow">Profile</span>
            </th>
            {profiles.map((p) => (
              <th
                key={p.profile}
                scope="col"
                aria-current={p.profile === selected ? "true" : undefined}
                className={cn(
                  "px-1 pt-3 pb-2 text-center font-medium",
                  // v1 condensed these on the `wdth` axis, which was the right
                  // answer while the brand face had one. Satoshi doesn't, so
                  // the fix moves to size: 12px on phones, where three column
                  // headings and a row label share 335px and "Conservative" is
                  // twelve characters, releasing to the full micro step as
                  // soon as there is room.
                  "text-[0.75rem] sm:text-micro",
                  // Even at 12px "Conservative" is over a 70px column, so it
                  // hyphenates. That is the honest answer: truncating to
                  // "Conse…" hides which profile the column is, and an
                  // abbreviation would be a legend to learn.
                  "hyphens-auto break-words leading-tight",
                  p.profile === selected ? "text-brand-text" : "text-stone",
                )}
              >
                {p.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.label} className={index > 0 ? "border-t border-line" : ""}>
              <th scope="row" className="px-3 py-2 text-left align-middle font-normal">
                <span className="block text-caption text-graphite">{row.label}</span>
                <span className="block text-micro text-stone">{row.hint}</span>
              </th>
              {profiles.map((p) => (
                <td
                  key={p.profile}
                  className={cn(
                    "num px-1 py-2 text-center text-caption align-middle",
                    p.profile === selected
                      ? "bg-brand-tint font-semibold text-brand-text"
                      : "text-stone",
                  )}
                >
                  {row.render(p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

    </>
  );
}

/**
 * The same table, with the figures blanked.
 *
 * Reusing the markup rather than approximating it with divs is the only way
 * the heights genuinely match — a six-row table whose skeleton is 20px short
 * moves everything below it when the request lands, and the zero-layout-shift
 * rule doesn't have an "almost" setting.
 */
function ComparisonSkeleton() {
  return (
    <div aria-hidden>
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            <th className="w-[30%] px-3 pt-3 pb-2 text-left">
              <span className="eyebrow">Profile</span>
            </th>
            {[0, 1, 2].map((i) => (
              <th key={i} className="px-1 pt-3 pb-2">
                <Skeleton className="mx-auto h-3 w-14" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }, (_, row) => (
            <tr key={row} className={row > 0 ? "border-t border-line" : ""}>
              {/* The invisible text inside each bar is what makes the row the
                  exact height it will be once the figures arrive. */}
              <th className="px-3 py-2 text-left font-normal">
                <Skeleton className="w-28">
                  <span className="block text-caption text-transparent">Label</span>
                </Skeleton>
                <Skeleton className="w-16">
                  <span className="block text-micro text-transparent">hint</span>
                </Skeleton>
              </th>
              {[0, 1, 2].map((i) => (
                <td key={i} className="px-1 py-2">
                  <Skeleton className="mx-auto h-3.5 w-10" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
