"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * A single hairline with a faint tint beneath it.
 *
 * **Never coloured by direction.** A grid of small green and red charts is the
 * strongest casino signal a trading interface can send, and the brief rules
 * that feeling out — direction lives in chips and badges, where it reads
 * calmly. See CLAUDE.md §5.
 *
 * Drawn by hand rather than through a charting library: a sparkline is one
 * path and one polygon, and pulling a runtime chart dependency onto the
 * dashboard's critical path to draw it would cost far more than it saves.
 *
 * The viewBox is normalised and stretched, with `non-scaling-stroke` keeping
 * the line exactly 1px at any container width — the usual failure of a
 * stretched SVG is a stroke that thickens as the card grows.
 */
export function Sparkline({
  values,
  height = 40,
  tone = "graphite",
  fill = true,
  className,
  "aria-label": ariaLabel,
}: {
  values: readonly number[];
  height?: number;
  /** `ember` is reserved for the series a recommendation is about. */
  tone?: "graphite" | "ember" | "mist";
  fill?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const gradientId = useId();

  if (values.length < 2) {
    return (
      <div
        className={cn("w-full", className)}
        style={{ height }}
        aria-hidden
      />
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  // A dead-flat series would divide by zero; draw it down the middle instead.
  const span = max - min || 1;
  const step = 100 / (values.length - 1);

  const points = values.map((value, i) => {
    const x = i * step;
    // Inset by 1 unit top and bottom so the stroke isn't clipped at extremes.
    const y = 1 + (1 - (value - min) / span) * 98;
    return `${x.toFixed(3)},${y.toFixed(3)}`;
  });

  const line = `M${points.join("L")}`;
  const area = `${line}L100,100L0,100Z`;
  const stroke = tone === "ember" ? "var(--brand)" : tone === "mist" ? "var(--faint)" : "var(--graphite)";

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={cn("w-full overflow-visible", className)}
      style={{ height }}
      role={ariaLabel ? "img" : "presentation"}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.10" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
        </>
      )}
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
