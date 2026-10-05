"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActive } from "@/lib/nav";
import { useScrollingDown } from "@/hooks/use-scroll-direction";
import { cn } from "@/lib/utils";

/**
 * Mobile primary navigation — a floating capsule, not a welded-on bar.
 *
 * The full-bleed bar with a hairline along the top is the default every
 * framework ships, and it reads as browser chrome: part of the device rather
 * than part of the app. Detached and inset, it is an *object* the content
 * scrolls beneath.
 *
 * **Labelled, compact and centred.** It was icon-only and ran edge to edge, on
 * the reasoning that four conventional glyphs need no legend; in use it read as
 * a row of loose icons in a very long lozenge. Now each item is an icon over its
 * name, the capsule is only as wide as its five items and sits centred, and the
 * current one wears a tinted pill — the same indicator the desktop rail uses
 * (decision 035), which is what makes "where am I" look the same on both.
 * Taller rather than wider: a 56px item is a comfortable thumb target without
 * spending the width a phone does not have.
 */
export function BottomNav() {
  const pathname = usePathname();
  const hidden = useScrollingDown();

  return (
    <nav
      aria-label="Primary"
      data-hidden={hidden || undefined}
      className={cn(
        // The wrapper spans the viewport but ignores pointer events, so the
        // gap either side of the capsule doesn't swallow taps on the content
        // underneath it.
        "pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center md:hidden",
        "transition-transform duration-300 ease-out",
        "data-hidden:translate-y-[calc(100%+1.5rem)]",
        "motion-reduce:transition-none motion-reduce:data-hidden:translate-y-0",
      )}
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <ul
        className={cn(
          "pointer-events-auto mb-3 flex gap-0.5 rounded-full p-1.5",
          // On light, `surface` and `ground` are the same white, so the capsule
          // cannot lift off the page by value; it gets a stronger hairline and
          // the system's overlay shadow, which exists for exactly this: chrome
          // floating over content.
          "border border-line-strong bg-surface/90 shadow-overlay",
          "supports-backdrop-filter:bg-surface/75 supports-backdrop-filter:backdrop-blur-2xl",
        )}
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  // Five items: 64px from 375px up (a 340px capsule); 56px below,
                  // so it still fits a 320px screen with room either side.
                  "flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-full outline-none min-[375px]:w-16",
                  "transition-colors duration-150",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                  // A neutral pill, not the brand tint, at the user's
                  // direction: blue on the current tab read as a selected
                  // button competing with the page's own primary action.
                  active
                    ? "bg-surface-2 text-ink"
                    : "text-stone active:bg-surface-2 active:text-graphite",
                )}
              >
                <Icon size={22} weight={active ? "fill" : "regular"} />
                <span
                  className={cn(
                    "text-[0.6875rem] leading-none tracking-[0.01em]",
                    active ? "font-semibold" : "font-medium",
                  )}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
