"use client";

/// <reference types="react/canary" />
import { ViewTransition } from "react";

/**
 * The page's arrival, so a route change reads as a move rather than a cut.
 *
 * Keyed by the route, so a navigation is the old page exiting and the new one
 * entering rather than one element updating in place. Next.js runs every
 * navigation inside a transition, which is what lets React hand the swap to
 * the browser's View Transitions API: the old page fades out quickly, the new
 * one fades in a few pixels low and settles (`page-exit` / `page-enter` in
 * `globals.css`). Nothing animates on a first load, so this costs no layout
 * shift and no LCP, and a browser without the API simply swaps as before.
 *
 * `default="none"` keeps it still for everything that is not a route change:
 * a segment switch, a `router.replace` of a query parameter or a refresh.
 * No animation library (§5): this is CSS on the browser's own snapshots.
 */
export function PageTransition({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <ViewTransition key={id} enter="page-enter" exit="page-exit" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
