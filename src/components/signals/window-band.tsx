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
 *   **A density ramp, not a rectangle.** Column height is the hourly
 *   intensity and the window's hours are drawn in ink, so the crest reads as a
 *   chart rather than a barcode. The intensity curve rises to a crest
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
        // Room above the bars for the crest's point, which sits *on* the
        // tallest column rather than inside a filled box.
        className="relative w-full border-b border-line-strong"
        style={{ height: track, paddingTop: point / 2 }}
        role="img"
        aria-label={label}
      >
        {/* The curve itself — one column per hour, height is intensity.
            It was full-height columns varying only in opacity inside a grey
            box, which at 72 columns read as a barcode rather than a chart.
            Height carries the ramp now; tone carries the window: inside it
            the columns are ink, outside they are the hairline grey. */}
        <div className={cn("flex h-full w-full items-end", gap && "gap-px")} aria-hidden>
          {execution.curve.map((sample) => {
            const inWindow =
              execution.hasWindow &&
              sample.t >= execution.opensAt &&
              sample.t < execution.closesAt;
            return (
              <div
                key={sample.t}
                className={cn(
                  "flex-1 rounded-t-[1.5px]",
                  inWindow ? "bg-graphite" : "bg-line-strong",
                )}
                // A floor so a dead hour still marks its place on the axis.
                style={{ height: `${Math.max(8, sample.intensity ** 1.4 * 100)}%` }}
              />
            );
          })}
        </div>

        {/* Midnight boundaries — three days is long enough to lose track.
            Gated on `now` because "midnight" is a local-time question and the
            server would answer it in a different zone. */}
        {now !== null &&
          dayBoundaries(execution.from, execution.to).map((t) => (
            <div
              key={t}
              aria-hidden
              className="absolute bottom-0 h-2 w-px bg-stone/60"
              style={{ left: `${positionOf(t)}%` }}
            />
          ))}

        {/* The peak, resting on the crest. */}
        {execution.hasWindow && (
          <EmberPoint
            size={point}
            className="absolute top-0 -translate-x-1/2"
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
      <span className="num whitespace-nowrap">
        peak {formatWindowTime(execution.peakAt)}
      </span>
      {size !== "sm" && (
        <>
          <span className="text-stone">·</span>
          {/* One unit, so a narrow row never strands "GMT+1" on a line of
              its own. */}
          <span className="whitespace-nowrap">
            <span className="num">{formatDuration(execution.closesAt - execution.opensAt)}</span>{" "}
            <span className="mono-label text-micro text-stone">{timeZoneLabel(now)}</span>
          </span>
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
