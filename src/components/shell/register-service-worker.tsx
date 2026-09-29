"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that backs offline use and push.
 *
 * Skipped in development: a cached shell makes hot reload lie about what's on
 * disk, which costs more time than the offline testing is worth.
 *
 * **Except when you are working on push, where that default is the whole
 * problem.** Push needs a registered worker, so with none registered the
 * settings switch has nothing to subscribe to — and there was no way to try any
 * of it short of `npm run build && npm run start`, which is also the one
 * configuration where you cannot edit anything. `NEXT_PUBLIC_EMBER_SW_IN_DEV=1`
 * opts in, and the trade goes back the way it was: the cache may now lie about
 * what is on disk, which is a known cost you have chosen rather than a mystery.
 *
 * Read from `process.env` at build time on purpose. It is a `NEXT_PUBLIC_` flag,
 * so the expression is replaced with a literal and the whole branch disappears
 * from a production bundle that does not set it.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    const inDev = process.env.NEXT_PUBLIC_EMBER_SW_IN_DEV === "1";
    if (process.env.NODE_ENV !== "production" && !inDev) return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      // A different script URL in development, so the worker knows to cache
      // nothing (see `DEV` in `public/sw.js`), and so an existing production-
      // mode registration on this origin is replaced rather than kept.
      const script = process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?mode=dev";
      navigator.serviceWorker.register(script).catch(() => {
        // Offline support is an enhancement — a registration failure must
        // never surface to the user or block the app.
      });
    };

    // Registration competes with the first paint for bandwidth, so wait.
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
