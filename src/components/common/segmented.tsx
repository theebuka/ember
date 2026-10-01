"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  /** Required when `label` is an icon rather than text. */
  ariaLabel?: string;
};

/**
 * A segmented control with a sliding indicator.
 *
 * Used for chart ranges, theme, and any other small exclusive choice. The
 * indicator is a shared-layout animation rather than a transition on each
 * button, so the pill genuinely travels between options instead of blinking.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "default",
  className,
  id,
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  size?: "sm" | "default";
  className?: string;
  id?: string;
  "aria-label"?: string;
}) {
  // Scopes the shared-layout animation to this instance, so two segmented
  // controls on one screen don't animate into each other.
  const layoutId = useId();

  // Shared-layout animations run in JavaScript, so the `prefers-reduced-motion`
  // block in globals.css never sees them.
  const reduceMotion = useReducedMotion();

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full bg-surface-2 p-1",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.ariaLabel}
            onClick={() => onChange(option.value)}
            className={cn(
              // `tap-target` supplies the `relative` the selected pill needs
              // to position against, plus a 44px-tall hit region on touch —
              // `sm` renders at 24px, which is well under the minimum.
              "tap-target rounded-full font-medium transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              size === "sm"
                ? "h-9 min-w-9 px-3 text-micro"
                : "h-11 min-w-12 px-4 text-caption",
              selected ? "text-ink" : "text-stone hover:text-graphite",
            )}
          >
            {selected && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full border border-line bg-surface"
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 420, damping: 34 }
                }
              />
            )}
            <span className="relative flex items-center justify-center gap-1">
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
