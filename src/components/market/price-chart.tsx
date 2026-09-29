"use client";

import { useId } from "react";
import type { Candle, Instrument } from "@/lib/api/types";
import { formatQuotePrice, formatShortDate } from "@/lib/market/format";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * An instrument's price over the selected range.
 *
 * **No candlesticks, and no red or green fill** (CLAUDE.md §5) — a single
 * graphite hairline over a faint tint whichever way the range went. This is
 * the screen where the temptation to ship a trading-terminal chart is
 * strongest, and it is exactly the casino signalling the brief rules out.
 * Direction is already stated, calmly, in the chip above.
 *
 * The high and low are labelled in place rather than as an axis. On a single
 * series the two numbers a person actually wants are the extremes and where
 * the line ended, and a full gridded axis spends a lot of ink to say less.
 */
export function PriceChart({
  candles,
  instrument,
  height = 168,
  className,
}: {
  candles: readonly Candle[];
  instrument: Instrument | null;
  height?: number;
  className?: string;
}) {
  const gradientId = useId();

  if (candles.length < 2 || !instrument) {
    return (
      <div
        className="flex items-center justify-center rounded-lg bg-surface-2 text-caption text-stone"
        style={{ height }}
      >
        Not enough history in this range.
      </div>
    );
  }

  const closes = candles.map((c) => c.c);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || min * 0.01 || 1;

  const step = 100 / (closes.length - 1);
  const y = (value: number) => 4 + (1 - (value - min) / span) * 92;

  const line = closes
    .map((value, i) => `${(i * step).toFixed(3)},${y(value).toFixed(3)}`)
    .join("L");

  const highIndex = closes.indexOf(max);
  const lowIndex = closes.indexOf(min);
  const last = closes[closes.length - 1];

  return (
    <div className={className}>
      <div className="relative">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="w-full overflow-visible"
          style={{ height }}
          role="img"
          aria-label={`${instrument.symbol} price, ${formatQuotePrice(instrument, min)} to ${formatQuotePrice(instrument, max)} over the selected range, ending at ${formatQuotePrice(instrument, last)}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--graphite)" stopOpacity="0.10" />
              <stop offset="100%" stopColor="var(--graphite)" stopOpacity="0" />
            </linearGradient>
          </defs>

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

        {/* The last close, marked in CSS rather than as an `<svg:circle>`: the
            plot is `preserveAspectRatio="none"`, so a circle in that space is
            stretched into an ellipse by the chart's width — decision 069, which
            fixed the value chart and never reached this one. */}
        <span
          aria-hidden
          className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-graphite bg-surface"
          style={{ left: "100%", top: `${y(last)}%` }}
        />

        {/* Extremes, pinned where they happened. Nudged inward at the edges so
            a high on the first or last bar doesn't hang off the chart. */}
        <Extreme
          value={formatQuotePrice(instrument, max)}
          left={(highIndex / (closes.length - 1)) * 100}
          top={y(max)}
          height={height}
          above
        />
        <Extreme
          value={formatQuotePrice(instrument, min)}
          left={(lowIndex / (closes.length - 1)) * 100}
          top={y(min)}
          height={height}
        />
      </div>

      <div className="mt-2 flex justify-between text-micro text-stone">
        <span className="num">{formatShortDate(candles[0].t)}</span>
        <span className="num">{formatShortDate(candles[candles.length - 1].t)}</span>
      </div>
    </div>
  );
}

/**
 * The chart's exact footprint, blank.
 *
 * The date row underneath is 23px that the old placeholder didn't reserve, and
 * on the asset page that was the whole of a 0.64 cumulative layout shift —
 * every section below the chart jumped when the series landed. Measured, not
 * eyeballed: `scripts/` drove the page with the API stalled and compared the
 * two heights.
 */
export function PriceChartSkeleton({
  height = 168,
  className,
}: {
  height?: number;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)} aria-hidden>
      <Skeleton className="w-full rounded-lg" style={{ height }} />
      <div className="mt-2 flex justify-between">
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-3 w-14" />
      </div>
    </div>
  );
}

function Extreme({
  value,
  left,
  top,
  height,
  above = false,
}: {
  value: string;
  /** Percentage across the chart. */
  left: number;
  /** Percentage down the 0–100 viewBox. */
  top: number;
  height: number;
  above?: boolean;
}) {
  const clamped = Math.min(Math.max(left, 6), 94);

  return (
    <span
      aria-hidden
      className={cn(
        "num pointer-events-none absolute -translate-x-1/2 text-micro whitespace-nowrap text-stone",
      )}
      style={{
        left: `${clamped}%`,
        top: (top / 100) * height + (above ? -16 : 6),
      }}
    >
      {value}
    </span>
  );
}
