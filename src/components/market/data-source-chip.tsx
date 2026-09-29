"use client";

import Link from "next/link";
import { useSynthetic } from "@/components/market/data-source";
import { cn } from "@/lib/utils";

/**
 * Where the prices came from.
 *
 * Present on every screen that shows a number, and never suppressed.
 * Presenting generated prices as real would be the single worst thing this
 * product could do — so the disclosure is a component rather than a paragraph
 * someone might forget to include, and it links to the page that explains
 * exactly what is and isn't modelled.
 *
 * Reads `useSynthetic()`, which the root layout fills from the server. It took
 * a `synthetic` prop from each screen's own query until phase 29, and that made
 * it the app-wide hydration failure in decision 224 and, on a live build, a
 * false "Generated prices" for as long as the query took. See
 * `data-source.tsx`.
 */
export function DataSourceChip({ className }: { className?: string }) {
  const synthetic = useSynthetic();

  if (synthetic) {
    return (
      <Link
        href="/signals/methodology"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1",
          "text-micro font-medium text-stone transition-colors hover:text-graphite",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          className,
        )}
      >
        <span className="size-1.5 rounded-full bg-faint" aria-hidden />
        Generated prices
      </Link>
    );
  }

  return (
    /**
     * A link in this state too, and that is the point of the change.
     *
     * It was a bare `<span>` while the live case was hypothetical, on the
     * reasoning that a disclosure is only needed when there is something to
     * disclose. Connecting a feed made that wrong: prices are live and policy
     * rates, the macro calendar and realised capitalisation are still modelled,
     * so "Live prices" is now the claim most in need of somewhere to check it.
     * Both states go to the same page.
     */
    <Link
      href="/signals/methodology"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-micro text-stone",
        "transition-colors hover:text-graphite",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-up" aria-hidden />
      Live prices
    </Link>
  );
}
