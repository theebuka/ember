"use client";

import { EmberPoint } from "@/components/common/ember-point";
import { useNow } from "@/hooks/use-now";
import type { ExecutionWindow } from "@/lib/api/client";
import {
  describeHorizon,
  formatDuration,
  formatWindowTime,
  timeZoneLabel,
} from "@/lib/market/format";
import { cn } from "@/lib/utils";

/**
 * ★ The signature component — the 72-hour execution window.
 *
 * This is the product's core claim rendered directly. Every competitor ships a
 * BUY badge; almost none say *when*. What's drawn here is not a decoration
 * around a number, it is the actual output of `computeWindow` — the hourly
 * product of market liquidity, scheduled-event avoidance and the signal's own
 * decay (see docs/methodology.md).
 *
 * Three deliberate choices:
 *
 *   **A density ramp, not a rectangle.** The intensity curve rises to a crest
 *   and falls away. "Thursday late morning" is a genuinely soft-shouldered
 *   claim, and drawing it as a fence with hard edges would assert a precision
 *   the model does not have.
 *
 *   **Hourly columns, not a smooth gradient.** The model's resolution is one
 *   hour. Rendering it as a continuous wash would imply it can tell 11:04 from
 *   11:26. The columns are the resolution, shown honestly.
 *
 *   **One ember point, at the crest.** The single saturated pixel in the
 *   component, and the same shape as the brand mark — the logo and the core
 *   product primitive are one object: the moment the system is pointing at.
 */

const SIZES = {
  sm: { track: 24, point: 13, gap: false },
  md: { track: 40, point: 16, gap: true },
  lg: { track: 56, point: 20, gap: true },
} as const;

export function WindowBand({
  window: execution,
  size = "md",
  /** Time labels and the duration summary beneath the track. */
  showScale = true,
  className,
}: {
  window: ExecutionWindow;
  size?: keyof typeof SIZES;
  showScale?: boolean;
  className?: string;
}) {
  const { track, point, gap } = SIZES[size];
  // A minute is the finest movement worth re-rendering for: across 72 hours
  // the marker travels roughly a fifth of a pixel per minute.
  const now = useNow(60_000);

  const span = execution.to - execution.from;
  const positionOf = (t: number) => ((t - execution.from) / span) * 100;

  const peakLeft = positionOf(execution.peakAt);
  // Before hydration `now` is null and the marker isn't drawn — the server has
  // no way to know the viewer's clock, and guessing produces a marker that
  // visibly jumps on hydration.
  const nowLeft = now === null ? null : Math.min(Math.max(positionOf(now), 0), 100);

  const label = execution.hasWindow
    ? `Execution window ${formatWindowTime(execution.opensAt)} to ${formatWindowTime(execution.closesAt)}, best at ${formatWindowTime(execution.peakAt)}`
    : `No tradeable execution window in the next ${describeHorizon(execution)}`;

  return (
    <div className={cn("w-full", className)}>
      <div
        className="relative w-full overflow-hidden rounded-md bg-surface-2"
        style={{ height: track }}
        role="img"
        aria-label={label}
      >
        {/* The curve itself. */}
        <div className={cn("flex h-full w-full", gap && "gap-px")} aria-hidden>
          {execution.curve.map((sample) => (
            <div
              key={sample.t}
              className="h-full flex-1 bg-graphite"
              // Raised to a power so the crest separates from its shoulders;
              // a linear map made the whole band read as one flat block.
              style={{ opacity: 0.06 + sample.intensity ** 1.7 * 0.62 }}
            />
          ))}
        </div>

        {/* Midnight boundaries — three days is long enough to lose track.
            Gated on `now` because "midnight" is a local-time question and the
            server would answer it in a different zone. */}
        {now !== null &&
          dayBoundaries(execution.from, execution.to).map((t) => (
            <div
              key={t}
              aria-hidden
              className="absolute inset-y-0 w-px bg-ground/50"
              style={{ left: `${positionOf(t)}%` }}
            />
          ))}

        {/* The peak. */}
        {execution.hasWindow && (
          <EmberPoint
            size={point}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${peakLeft}%` }}
          />
        )}

        {/* Now — a hairline that advances in real time. */}
        {nowLeft !== null && (
          <div
            aria-hidden
            className="absolute inset-y-0 w-px bg-ink transition-[left] duration-1000 ease-linear"
            style={{ left: `${nowLeft}%` }}
          >
            <span className="absolute -top-px left-1/2 size-1 -translate-x-1/2 rounded-full bg-ink" />
          </div>
        )}
      </div>

      {showScale && <WindowScale window={execution} size={size} />}
    </div>
  );
}

function WindowScale({
  window: execution,
  size,
}: {
  window: ExecutionWindow;
  size: keyof typeof SIZES;
}) {
  // Rendered only after mount: `formatWindowTime` and the timezone label both
  // resolve against the viewer's clock, which the server cannot know.
  const now = useNow(60_000);

  if (now === null) {
    // Reserves the exact height the real scale will occupy, so nothing below
    // it moves when the times land. Zero layout shift is a hard requirement.
    return <div className="mt-2 h-4" aria-hidden />;
  }

  if (!execution.hasWindow) {
    return (
      <p className="mt-2 text-caption text-stone">
        No tradeable window in the next {describeHorizon(execution)}.
      </p>
    );
  }

  const open = execution.opensAt <= now;

  return (
    <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-caption text-stone">
      <span className="num text-ink">
        {open ? "Open now" : formatWindowTime(execution.opensAt)}
        {" → "}
        {formatWindowTime(execution.closesAt)}
      </span>
      <span className="text-stone">·</span>
      <span className="num">
        peak {formatWindowTime(execution.peakAt)}
      </span>
      {size !== "sm" && (
        <>
          <span className="text-stone">·</span>
          <span className="num">
            {formatDuration(execution.closesAt - execution.opensAt)}
          </span>
          <span className="mono-label text-micro text-stone">{timeZoneLabel(now)}</span>
        </>
      )}
    </div>
  );
}

/** Local midnights inside the horizon. */
function dayBoundaries(from: number, to: number): number[] {
  const boundaries: number[] = [];
  const cursor = new Date(from);
  cursor.setHours(24, 0, 0, 0);

  while (cursor.getTime() < to) {
    boundaries.push(cursor.getTime());
    cursor.setDate(cursor.getDate() + 1);
  }
  return boundaries;
}
