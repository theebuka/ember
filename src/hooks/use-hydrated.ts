"use client";

import { useSyncExternalStore } from "react";

/** Hydration state never changes after mount, so nothing needs to subscribe. */
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * False on the server and during the first client render, true afterwards.
 *
 * Persisted stores read from `localStorage`, which the server can't see, so
 * markup depending on them would mismatch on hydration. Gate on this and
 * render the neutral state until the real value is available.
 *
 * Uses `useSyncExternalStore` rather than the `useState` + `useEffect` pattern
 * — it's the API built for exactly this server/client snapshot split, and it
 * avoids the extra render that setting state in an effect costs.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
