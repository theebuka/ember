"use client";

import { useLayoutEffect, useRef } from "react";
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
 * Used for chart ranges, theme, and any other small exclusive choice. The pill
 * travels between options rather than blinking.
 *
 * **CSS, not a motion library.** This was the only component importing
 * `motion`, which put ~118 KB of script on every page for one shared-layout
 * animation. The indicator is one element whose `left` and `width` are written
 * from the selected button's box and moved by a CSS transition — which also
 * means `prefers-reduced-motion` in globals.css reaches it, where a JavaScript
 * spring needed its own check (decision 036).
 *
 * Until the box has been measured — the server's HTML, the first paint — the
 * selected button draws its own pill, so nothing is ever unselected-looking.
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
  const groupRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  // Written straight to the element: it changes on every selection and resize,
  // and nothing but the browser reads it.
  useLayoutEffect(() => {
    const group = groupRef.current;
    const pill = pillRef.current;
    if (!group || !pill) return;

    const place = () => {
      const selected = group.querySelector<HTMLElement>("[aria-checked='true']");
      if (!selected) {
        group.dataset.ready = "false";
        return;
      }
      pill.style.left = `${selected.offsetLeft}px`;
      pill.style.width = `${selected.offsetWidth}px`;
      group.dataset.ready = "true";
    };

    place();
    const observer = new ResizeObserver(place);
    observer.observe(group);
    return () => observer.disconnect();
  }, [value, options.length]);

  return (
    <div
      ref={groupRef}
      id={id}
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "group/seg relative inline-flex items-center gap-0.5 rounded-full bg-surface-2 p-1",
        className,
      )}
    >
      <span
        ref={pillRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1 bottom-1 hidden rounded-full border border-line bg-surface",
          "group-data-[ready=true]/seg:block",
          "transition-[left,width] duration-200 ease-out motion-reduce:transition-none",
        )}
      />
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
              // `tap-target` supplies the `relative` the label and the
              // first-paint pill position against, plus a 44px-tall hit region
              // on touch — `sm` renders at 24px, which is well under the minimum.
              "tap-target rounded-full font-medium transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              size === "sm"
                ? "h-9 min-w-9 px-3 text-micro"
                : "h-11 min-w-12 px-4 text-caption",
              selected ? "text-ink" : "text-stone hover:text-graphite",
            )}
          >
            {selected && (
              <span
                aria-hidden
                className="absolute inset-0 rounded-full border border-line bg-surface group-data-[ready=true]/seg:hidden"
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
