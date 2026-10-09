"use client";

import { MagnifyingGlass } from "@/components/common/icon";
import { openCommandMenu } from "@/components/shell/command-menu-state";
import { cn } from "@/lib/utils";

/**
 * Search on a phone: the ⌘K menu, opened from the header.
 *
 * A key combination is not an affordance on a touch screen (decision 052),
 * which left phones with no way to find an instrument by name. The menu itself
 * loads on the first press (`command-menu-loader.tsx`).
 */
export function SearchButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openCommandMenu}
      aria-label="Search"
      className={cn(
        "tap-target grid size-9 place-items-center rounded-full md:hidden",
        "text-stone transition-colors hover:bg-surface-2 hover:text-ink",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <MagnifyingGlass className="size-5" />
    </button>
  );
}
