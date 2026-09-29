"use client";

import { useId } from "react";
import { formatDate, formatPercent } from "@/lib/market/format";
import { cn } from "@/lib/utils";

/**
 * The simulated book, at the engine's own position sizes.
 *
 * A single graphite hairline whether the curve ends up or down — same rule as
 * every other chart here (CLAUDE.md §5). The one deviation is a hairline at
 * 1.00, because on a curve that spends its life within a few percent of break
 * even, "which side of flat is this" is the entire question and eyeballing it
 * against the axis is guesswork.
 */
export function EquityCurve({
  points,
  height = 160,
  className,
}: {
  points: readonly { t: number; value: number }[];
  height?: number;
  className?: string;
}) {
  const gradientId = useId();

  if (points.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-lg bg-surface-2 text-caption text-stone"
        style={{ height }}
      >
        Not enough calls to draw a curve.
      </div>
    );
  }

  const values = points.map((p) => p.value);
  // 1.0 is always in frame — a curve auto-scaled to its own range can look
  // like a catastrophe when it moved two percent.
  const min = Math.min(...values, 1);
  const max = Math.max(...values, 1);
  const pad = (max - min) * 0.1 || 0.02;
  const lo = min - pad;
  const hi = max + pad;
  const span = hi - lo;

  const y = (value: number) => ((hi - value) / span) * 100;
  const step = 100 / (points.length - 1);

  const line = points
    .map((p, i) => `${(i * step).toFixed(3)},${y(p.value).toFixed(3)}`)
    .join("L");

  const last = points[points.length - 1];
  const breakEven = y(1);

  return (
    <div className={className}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-full overflow-visible"
        style={{ height }}
        role="img"
        aria-label={`Simulated equity curve, ending at ${formatPercent(last.value - 1, { signed: true })} over ${points.length} calls`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--graphite)" stopOpacity="0.10" />
            <stop offset="100%" stopColor="var(--graphite)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <line
          x1="0"
          x2="100"
          y1={breakEven}
          y2={breakEven}
          stroke="var(--line-strong)"
          strokeWidth="1"
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />

        <path d={`M${line}L100,100L0,100Z`} fill={`url(#${gradientId})`} />
        <path
          d={`M${line}`}
          fill="none"
          stroke="var(--graphite)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="mt-2 flex items-baseline justify-between text-micro text-stone">
        {/* With the year. The backtest spans more than twelve months, and
            "Jul 26 → Aug 9" reads as a fortnight when it is really a year. */}
        <span className="num">{formatDate(points[0].t)}</span>
        <span className={cn("num", last.value >= 1 ? "text-up" : "text-down")}>
          {formatPercent(last.value - 1, { signed: true })} · break even dashed
        </span>
        <span className="num">{formatDate(last.t)}</span>
      </div>
    </div>
  );
}

/**
 * Where the individual calls landed.
 *
 * A histogram rather than a list, because the shape is the finding: a tight
 * cluster near zero with occasional tails is what "no edge" looks like, and it
 * is much harder to argue with than a single average.
 */
export function ReturnDistribution({
  returns,
  className,
}: {
  returns: readonly number[];
  className?: string;
}) {
  if (returns.length === 0) return null;

  /**
   * Bounds taken from the data, not mirrored around zero.
   *
   * A symmetric axis is tidier and, on this distribution, useless: one call
   * returned +90% against a worst of −43%, so half the chart was empty and
   * every real bar was squeezed into a few pixels. Clipping the outlier
   * instead would be tidier still and would hide the finding.
   */
  const lo = Math.min(...returns, 0);
  const hi = Math.max(...returns, 0);
  const span = hi - lo || 0.04;
  const BINS = 15;
  const width = span / BINS;

  const counts = new Array<number>(BINS).fill(0);
  for (const r of returns) {
    counts[Math.min(BINS - 1, Math.floor((r - lo) / width))]++;
  }
  const tallest = Math.max(...counts);

  // Break even sits wherever it falls, which is the point of an honest axis.
  const zeroAt = ((0 - lo) / span) * 100;

  return (
    <div className={className}>
      <div className="relative">
        <div className="flex h-24 items-end gap-px" aria-hidden>
          {counts.map((count, i) => {
            const centre = lo + (i + 0.5) * width;
            return (
              <div
                key={i}
                className={cn(
                  "flex-1 rounded-t-[2px]",
                  centre >= 0 ? "bg-graphite" : "bg-faint",
                )}
                style={{ height: `${tallest === 0 ? 0 : (count / tallest) * 100}%` }}
                title={`${count} ${count === 1 ? "call" : "calls"} near ${formatPercent(centre, { signed: true, decimals: 1 })}`}
              />
            );
          })}
        </div>
        <div
          aria-hidden
          className="absolute inset-y-0 w-px bg-line-strong"
          style={{ left: `${zeroAt}%` }}
        />
      </div>
      <div className="relative mt-1.5 h-4 text-micro text-stone">
        <span className="num absolute left-0">
          {formatPercent(lo, { signed: true, decimals: 0 })}
        </span>
        <span
          className="absolute -translate-x-1/2 whitespace-nowrap"
          style={{ left: `${zeroAt}%` }}
        >
          break even
        </span>
        <span className="num absolute right-0">
          {formatPercent(hi, { signed: true, decimals: 0 })}
        </span>
      </div>
      <p className="sr-only">
        Distribution of {returns.length} call returns, ranging from{" "}
        {formatPercent(Math.min(...returns), { signed: true })} to{" "}
        {formatPercent(Math.max(...returns), { signed: true })}.
      </p>
    </div>
  );
}
