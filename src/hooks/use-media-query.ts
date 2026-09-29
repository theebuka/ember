"use client";

import { useSyncExternalStore } from "react";

/**
 * A media query as a boolean, safe across hydration.
 *
 * Returns `false` on the server, where there is no viewport to measure. That
 * matters for the one place this is used — choosing a sheet or a dialog — and
 * the fallback is deliberately the mobile branch: guessing desktop and being
 * wrong shows a centred dialog for a frame on a phone, which is far more
 * visible than the reverse.
 *
 * Queries are cached so two components asking the same question share one
 * `MediaQueryList` and one listener.
 */

interface Store {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => boolean;
}

const stores = new Map<string, Store>();

function storeFor(query: string): Store {
  let store = stores.get(query);
  if (store) return store;

  const list = window.matchMedia(query);

  store = {
    subscribe(onChange) {
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    getSnapshot: () => list.matches,
  };

  stores.set(query, store);
  return store;
}

const serverSnapshot = () => false;

export function useMediaQuery(query: string): boolean {
  // `storeFor` touches `window`, so it can only be reached on the client.
  // `useSyncExternalStore` never calls the client subscribe/getSnapshot pair
  // during a server render, but the arguments are still evaluated — hence the
  // guard rather than calling it unconditionally.
  const store =
    typeof window === "undefined"
      ? { subscribe: () => () => {}, getSnapshot: serverSnapshot }
      : storeFor(query);

  return useSyncExternalStore(store.subscribe, store.getSnapshot, serverSnapshot);
}

/** Matches the `md` breakpoint the shell already switches navigation on. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 48rem)");
}
