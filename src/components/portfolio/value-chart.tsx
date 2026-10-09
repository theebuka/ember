"use client";

import { useId, useState } from "react";
import { LockSimple } from "@/components/common/icon";
import { PlanInterstitial } from "@/components/plan/upsell";
import { ChangeText } from "@/components/market/change-chip";
import { Segmented } from "@/components/common/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import type { BaseCurrency, Range } from "@/lib/api/types";
import { formatMoney, formatShortDate } from "@/lib/market/format";
import type { ValuePoint } from "@/lib/portfolio/derive";
import { cn } from "@/lib/utils";

/**
 * Portfolio value over time, with what it cost underneath.
 *
 * Two series on one scale, because the gap between them *is* the unrealized
 * P&L — showing value alone leaves the user to remember what they paid. The
 * cost line is dashed mist so it reads as a reference, not as a competing
 * measurement.
 *
 * No candlesticks and no red/green fill, here or anywhere (CLAUDE.md §5). The
 * value line is a single graphite hairline over a 10% tint whether the
 * portfolio is up or down; the direction is stated in the chip above it.
 */

/** 1D is omitted: the portfolio is valued on daily closes, so it has no intraday. */
const RANGES: { value: Range; label: string }[] = [
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "1Y", label: "1Y" },
  { value: "ALL", label: "All" },
];

/** The label under the change, in words rather than the control's shorthand. */
const PERIOD: Record<Range, string> = {
  "1D": "today",
  "1W": "past week",
  "1M": "past month",
  "3M": "past 3 months",
  "1Y": "past year",
  ALL: "since your first trade",
};

const CHART_HEIGHT = 132;

export function ValueChart({
  points,
  range,
  onRangeChange,
  lockedRanges = [],
  base,
  className,
}: {
  points: readonly ValuePoint[];
  range: Range;
  onRangeChange: (range: Range) => void;
  /** Ranges the reader's plan doesn't chart. Pressing one opens the plans. */
  lockedRanges?: readonly Range[];
  base: BaseCurrency;
  className?: string;
}) {
  const gradientId = useId();
  const [upsell, setUpsell] = useState(false);
  const options = RANGES.map((r) =>
    lockedRanges.includes(r.value)
      ? {
          value: r.value,
          ariaLabel: `${r.label}, part of Pro`,
          label: (
            <>
              <LockSimple weight="fill" className="size-3 text-faint" />
              {r.label}
            </>
          ),
        }
      : r,
  );

  const first = points[0];
  const last = points[points.length - 1];

  /**
   * The change in *gain*, not the change in value.
   *
   * Value rises when you buy more, and a chip reading "+$56,411 over 3m" on a
   * book that received $25,000 of contributions in that window would be
   * reporting deposits as profit. Subtracting cost at both ends leaves the
   * part the market actually moved — which is the number the user thinks
   * they're being shown.
   */
  const change =
    first && last ? last.value - last.cost - (first.value - first.cost) : 0;

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Below md the range control takes its own row. Beside it, the label
          had ~90px and broke as "unrealize / d" (a word fragment, §5). */}
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <ChangeText value={change} className="text-caption font-medium">
            {formatMoney(change, base, { signed: true })}
          </ChangeText>
          {/* "From the market", not "Unrealized": the figure leaves out money you
              added, so it can be red under a line that rose because you added
              it (ADR 0007). The label has to say which of the two it is. */}
          <p className="mt-1 text-micro text-stone">From the market, {PERIOD[range]}</p>
        </div>

        <Segmented
          value={range}
          onChange={(next) => (lockedRanges.includes(next) ? setUpsell(true) : onRangeChange(next))}
          options={options}
          size="sm"
          aria-label="Chart range"
          className="self-start md:shrink-0"
        />
        <PlanInterstitial feature="chart-history" open={upsell} onOpenChange={setUpsell} />
      </div>

      {points.length < 2 ? (
        // One point is a position opened today. Saying so beats drawing a dot
        // and letting the user wonder whether the chart is broken.
        <div
          className="flex items-center justify-center rounded-lg bg-surface-2 text-caption text-stone"
          style={{ height: CHART_HEIGHT }}
        >
          Not enough history yet. The line starts a day after your first trade.
        </div>
      ) : (
        <Plot points={points} gradientId={gradientId} change={change} base={base} />
      )}

      <div className="mt-2 flex items-baseline justify-between text-micro text-stone">
        <span>{first ? formatShortDate(first.t) : ""}</span>
        <span className="flex items-center gap-3">
          <Legend tone="graphite">Value</Legend>
          <Legend tone="mist" dashed>
            Invested
          </Legend>
        </span>
        <span>{last ? formatShortDate(last.t) : ""}</span>
      </div>
    </div>
  );
}

function Plot({
  points,
  gradientId,
  change,
  base,
}: {
  points: readonly ValuePoint[];
  gradientId: string;
  change: number;
  base: BaseCurrency;
}) {
  // Both series share one scale — plotting them independently would put the
  // cost line above the value line whenever the portfolio was down, which is
  // exactly backwards.
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    min = Math.min(min, p.value, p.cost);
    max = Math.max(max, p.value, p.cost);
  }
  const span = max - min || 1;
  const step = 100 / (points.length - 1);

  const project = (pick: (p: ValuePoint) => number) =>
    points
      .map((p, i) => `${(i * step).toFixed(3)},${(2 + (1 - (pick(p) - min) / span) * 96).toFixed(3)}`)
      .join("L");

  const valueLine = `M${project((p) => p.value)}`;
  const costLine = `M${project((p) => p.cost)}`;

  const last = points[points.length - 1];
  const lastY = 2 + (1 - (last.value - min) / span) * 96;

  return (
    <div className="relative w-full" style={{ height: CHART_HEIGHT }}>
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-full w-full overflow-visible"
      role="img"
      // Stated as an amount, not a percentage. A percentage needs a
      // denominator, and every candidate is wrong on a book that received
      // contributions during the range — dividing by the starting cost read
      // 224% on a portfolio that grew by deposits.
      aria-label={`Portfolio value ${formatMoney(last.value, base)}. ${formatMoney(change, base, { signed: true })} from the market over the selected range, leaving out money you added.`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--graphite)" stopOpacity="0.10" />
          <stop offset="100%" stopColor="var(--graphite)" stopOpacity="0" />
        </linearGradient>
      </defs>

      <path d={`${valueLine}L100,100L0,100Z`} fill={`url(#${gradientId})`} />

      <path
        d={costLine}
        fill="none"
        stroke="var(--faint)"
        strokeWidth="1"
        strokeDasharray="3 3"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={valueLine}
        fill="none"
        stroke="var(--graphite)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

    </svg>

      {/*
        The current value, marked. A line that just stops looks truncated.

        Positioned in CSS rather than drawn as an `<svg:circle>`, because the
        plot is `preserveAspectRatio="none"` — a 100×100 viewBox stretched to
        whatever width it lands in. Anything round inside that space renders as
        an ellipse, stretched by however wide the chart happens to be, and the
        wider desktop column made it obvious. `vectorEffect` fixes the stroke,
        not the geometry.
      */}
      <span
        aria-hidden
        className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-graphite bg-surface"
        style={{ left: "100%", top: `${lastY}%` }}
      />
    </div>
  );
}

function Legend({
  tone,
  dashed = false,
  children,
}: {
  tone: "graphite" | "mist";
  dashed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn(
          "h-px w-3.5",
          tone === "graphite" ? "bg-graphite" : "bg-faint",
          // Explicitly mist, matching the dashed cost line in the chart above.
          // This is a graphic, not text, which is the one place mist belongs.
          dashed &&
            "[background-image:repeating-linear-gradient(90deg,currentColor_0_3px,transparent_3px_6px)] bg-transparent [color:var(--faint)]",
        )}
      />
      {children}
    </span>
  );
}

export function ValueChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col", className)} aria-hidden>
      {/* Mirrors the real header exactly, chip *and* the label beneath it.
          Reserving only the chip left an 11px gap that the whole page below
          absorbed when the series landed. */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <Skeleton className="h-5 w-28 rounded-md" />
          <Skeleton className="mt-1 w-32">
            <span className="block text-micro text-transparent">label</span>
          </Skeleton>
        </div>
        <Skeleton className="h-7 w-44 shrink-0 rounded-xl" />
      </div>
      <Skeleton className="w-full rounded-lg" style={{ height: CHART_HEIGHT }} />
      {/* Sized by the same text metrics as the real row rather than by a
          guessed `h-3`. Reserving 12px where 15px lands is three pixels the
          whole page below has to absorb. */}
      <div className="mt-2 flex items-baseline justify-between text-micro">
        <Skeleton className="w-12">
          <span className="block text-micro text-transparent">date</span>
        </Skeleton>
        <Skeleton className="w-28">
          <span className="block text-micro text-transparent">legend</span>
        </Skeleton>
        <Skeleton className="w-12">
          <span className="block text-micro text-transparent">date</span>
        </Skeleton>
      </div>
    </div>
  );
}
