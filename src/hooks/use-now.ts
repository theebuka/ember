"use client";

import { useSyncExternalStore } from "react";

/**
 * A ticking clock, shared by every component watching the same cadence.
 *
 * Two things need one: relative timestamps that would otherwise still say
 * "2m ago" an hour later, and the `now` marker travelling across the window
 * band.
 *
 * Modelled as an external store rather than `useState` + `useEffect`. The
 * clock genuinely *is* external to React — that's what `useSyncExternalStore`
 * is for — and it means twelve window bands on one page share a single
 * interval instead of running twelve, all firing at slightly different
 * moments.
 */

interface Clock {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => number;
}

function createClock(intervalMs: number): Clock {
  let now = Date.now();
  let timer: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<() => void>();

  return {
    subscribe(onChange) {
      listeners.add(onChange);

      if (timer === null) {
        // Re-read on the first subscription: the clock may have been created
        // minutes ago by a component that has since unmounted.
        now = Date.now();
        timer = setInterval(() => {
          now = Date.now();
          for (const listener of listeners) listener();
        }, intervalMs);
      }

      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0 && timer !== null) {
          clearInterval(timer);
          timer = null;
        }
      };
    },
    // Returns the cached value, not `Date.now()`. A snapshot that changed on
    // every call would put React into an infinite re-render loop.
    getSnapshot: () => now,
  };
}

const clocks = new Map<number, Clock>();

function clockFor(intervalMs: number): Clock {
  let clock = clocks.get(intervalMs);
  if (!clock) {
    clock = createClock(intervalMs);
    clocks.set(intervalMs, clock);
  }
  return clock;
}

/**
 * The current time, or `null` on the server and during hydration.
 *
 * The null is load-bearing. The server has no idea what time it is in the
 * viewer's timezone, so any clock-dependent markup it renders is guaranteed to
 * mismatch. Callers render the static shape first — reserving the same height
 * — and fill in the time one frame later.
 */
export function useNow(intervalMs = 30_000): number | null {
  const clock = clockFor(intervalMs);
  return useSyncExternalStore(clock.subscribe, clock.getSnapshot, () => null);
}
