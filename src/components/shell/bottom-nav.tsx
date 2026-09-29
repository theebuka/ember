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
 * than part of the app. Detaching it and insetting it from all three edges
 * makes it an *object* the content scrolls beneath, which is most of the
 * difference between "assembled" and "designed".
 *
 * **Icons only, and the active one is filled.**
 *
 * v1 kept labels, on the reasoning that icon-only bars make people learn a
 * legend — and with five items including `Eye` for watchlist and `Compass` for
 * advice, that was true. Three things make it not true here: there are three
 * destinations rather than five, every glyph is conventional (a house, a
 * wallet), and the outline-to-fill transition is a much stronger "you are
 * here" than a colour change on a 13px word. It is still a real trade — the
 * label is gone — so each link carries an `aria-label`, and the desktop rail
 * spells all three out.
 *
 * The pill went with the labels. Around a lone icon a tinted rounded rectangle
 * reads as a button that has somehow been pressed, and it fought the fill for
 * the same job. ADR 0035 chose the pill over a floating tick and that reasoning
 * still holds on desktop, where rows have text to group; here the fill *is*
 * the indicator.
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
        "pointer-events-none fixed inset-x-0 bottom-0 z-40 md:hidden",
        "transition-transform duration-300 ease-out",
        "data-hidden:translate-y-[calc(100%+1.5rem)]",
        "motion-reduce:transition-none motion-reduce:data-hidden:translate-y-0",
      )}
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <div
        className={cn(
          "pointer-events-auto mx-4 mb-3 rounded-full p-1.5",
          // On light, `surface` and `ground` are the same white, so a
          // translucent white capsule over a white page is invisible — the
          // one place the white-on-white palette costs something. It gets a
          // stronger hairline and the system's shadow, which is exactly what
          // `--overlay-shadow` exists for: chrome that floats over content
          // and cannot borrow separation from value.
          "border border-line-strong bg-surface/90 shadow-overlay",
          "supports-backdrop-filter:bg-surface/80 supports-backdrop-filter:backdrop-blur-2xl",
        )}
      >
        <ul
          className="grid"
          style={{ gridTemplateColumns: `repeat(${NAV_ITEMS.length}, 1fr)` }}
        >
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-12 items-center justify-center rounded-full outline-none",
                    "transition-colors",
                    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                    active
                      ? "text-brand"
                      : "text-stone active:text-graphite",
                  )}
                >
                  <Icon size={26} weight={active ? "fill" : "regular"} />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
