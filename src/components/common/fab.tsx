"use client";

import { useEffect, useState } from "react";
import { useScrollingDown } from "@/hooks/use-scroll-direction";
import { cn } from "@/lib/utils";

/**
 * The one primary action on a phone, floating above the bottom nav.
 *
 * **Why a screen gets one of these rather than a header button.** The page
 * header is at the top of a scroller; the thing it acts on — logging a trade
 * against the positions you are looking at — is reached by scrolling away from
 * it. On desktop that costs nothing, because the header is a few hundred pixels
 * from anywhere and there is a pointer. On a phone the header leaves the screen
 * within one flick and the action is then a scroll-to-top away, performed with
 * a thumb that is nowhere near the top of the screen.
 *
 * So: **the FAB is the mobile presentation of a header action, not a second
 * one.** The caller renders one control or the other, never both — two live
 * "Log trade" buttons on one screen is decision 212's duplicate CTA with a
 * different shape.
 *
 * ── Where it sits, and why it moves ──────────────────────────────────────
 *
 * `--fab-bottom` is the bottom nav's own geometry, said once: the capsule is
 * 60px (a 48px row inside 6px of padding), it clears the edge by 12px, and the
 * home indicator underneath it is `--safe-bottom`. A gap of 12px above that puts
 * the FAB against the capsule without touching it. Hard-coding `bottom-24`
 * instead would be a number that silently stops matching the nav the first time
 * the nav's padding changes.
 *
 * It hides on the same scroll signal the nav uses, so the two move as one
 * object. A FAB that stays while the bar underneath it slides away reads as
 * something that came loose.
 *
 * ── What it must not cover ───────────────────────────────────────────────
 *
 * `avoid` names an element the FAB steps aside for while that element sits in
 * the band the FAB occupies. On Portfolio the segmented control lands right
 * there on a phone, and the button covered "Activity" — a control floating over
 * the control that switches the list it acts on.
 */
export function Fab({
  onClick,
  label,
  icon,
  disabled,
  avoid,
  className,
}: {
  onClick: () => void;
  /** Spoken and written. A FAB with no word on it is a rebus. */
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  /** The id of an element the FAB must not cover. */
  avoid?: string;
  className?: string;
}) {
  const scrollingDown = useScrollingDown();
  const covering = useCovers(avoid);
  const hidden = scrollingDown || covering;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-hidden={hidden || undefined}
      className={cn(
        "fixed right-4 z-40 md:hidden",
        "flex h-14 items-center gap-2 rounded-full pr-5 pl-4.5",
        // Brand fill, like every other primary action (decision 059). The
        // shadow is `shadow-overlay` for the same reason the nav capsule has
        // one: this floats *over* scrolling content and cannot borrow
        // separation from value on a white page.
        "bg-primary text-caption font-semibold text-primary-foreground shadow-overlay",
        "outline-none transition-[transform,opacity] duration-300 ease-out",
        "active:scale-95",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        // Leaves in the same direction as the nav, and far enough to clear both.
        "data-hidden:pointer-events-none data-hidden:translate-y-[calc(100%+5.5rem)] data-hidden:opacity-0",
        "motion-reduce:transition-none motion-reduce:data-hidden:translate-y-0 motion-reduce:data-hidden:opacity-0",
        className,
      )}
      style={{
        bottom: "calc(var(--safe-bottom) + var(--nav-height) + 0.75rem)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * Whether the element `id` is inside the bottom band of the viewport — the nav,
 * the FAB and a margin, ~160px. An observer with that band as its root, rather
 * than a scroll listener reading layout on every frame.
 */
function useCovers(id: string | undefined): boolean {
  const [covers, setCovers] = useState(false);

  useEffect(() => {
    const target = id ? document.getElementById(id) : null;
    if (!target) return;

    let observer: IntersectionObserver | null = null;
    const observe = () => {
      observer?.disconnect();
      const band = 160;
      observer = new IntersectionObserver(
        ([entry]) => setCovers(entry.isIntersecting),
        { rootMargin: `-${Math.max(window.innerHeight - band, 0)}px 0px 0px 0px` },
      );
      observer.observe(target);
    };

    observe();
    window.addEventListener("resize", observe);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", observe);
    };
  }, [id]);

  return covers;
}
