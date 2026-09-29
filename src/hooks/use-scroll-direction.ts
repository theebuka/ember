"use client";

import { useEffect, useState } from "react";

/**
 * True while the user is scrolling down and far enough from the top for
 * hiding chrome to be worth the movement.
 *
 * Reads are batched into a frame so a fast scroll doesn't thrash layout.
 */
export function useScrollingDown({ threshold = 8 } = {}): boolean {
  const [scrollingDown, setScrollingDown] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        // Ignore jitter, and never hide near the top — there's no space to
        // reclaim there and the movement just reads as a glitch.
        if (Math.abs(y - last) >= threshold) {
          setScrollingDown(y > last && y > 72);
          last = y;
        }
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [threshold]);

  return scrollingDown;
}

/** True once the page has scrolled at all — used to reveal header borders. */
export function useScrolled(offset = 4): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > offset);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [offset]);

  return scrolled;
}
