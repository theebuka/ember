import { directionOf, formatPercent, type Direction } from "@/lib/market/format";
import { cn } from "@/lib/utils";

/**
 * Direction, as a tinted chip.
 *
 * Low-chroma tints rather than bright text, and no arrows or triangles — the
 * sign is already in the number. Gains and losses appear thousands of times in
 * a session, and rendering each one in saturated green or red is the single
 * loudest casino signal a finance UI can send. See CLAUDE.md §5.
 *
 * A flat reading gets neutral treatment rather than being rounded into a
 * direction it doesn't have.
 */

const TONES: Record<Direction, string> = {
  up: "bg-up-tint text-up",
  down: "bg-down-tint text-down",
  flat: "bg-surface-2 text-stone",
};

const TEXT_TONES: Record<Direction, string> = {
  up: "text-up",
  down: "text-down",
  flat: "text-stone",
};

export function ChangeChip({
  value,
  children,
  size = "default",
  className,
}: {
  /** Drives the tint and the sign. */
  value: number;
  /** Overrides the rendered text; defaults to the value as a percentage. */
  children?: React.ReactNode;
  size?: "sm" | "default";
  className?: string;
}) {
  const direction = directionOf(value);

  return (
    <span
      className={cn(
        "num inline-flex shrink-0 items-center rounded-md font-medium",
        size === "sm" ? "px-1.5 py-0.5 text-micro" : "px-2 py-0.5 text-caption",
        TONES[direction],
        className,
      )}
    >
      {children ?? formatPercent(value, { signed: true })}
    </span>
  );
}

/** The same direction colours, inline, where a chip would be too heavy. */
export function ChangeText({
  value,
  children,
  className,
}: {
  value: number;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("num", TEXT_TONES[directionOf(value)], className)}>
      {children ?? formatPercent(value, { signed: true })}
    </span>
  );
}
