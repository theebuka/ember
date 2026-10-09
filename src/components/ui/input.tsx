import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // ember: a filled well, not a bordered box. With `ground` and
        // `surface` both white on light, a 1px outline around an empty
        // rectangle is the weakest possible signal that something is
        // editable — the fill does that job, which is why every app in this
        // category uses one. 48px tall to match the `lg` button it sits beside.
        //
        // `text-body` is 16px, iOS's zoom-on-focus threshold, so the page doesn't
        // zoom on focus at any breakpoint, without the usual `text-base md:text-sm`
        // dance.
        "h-12 w-full min-w-0 rounded-xl border border-transparent bg-surface-2 px-4 text-body transition-colors outline-none file:inline-flex file:h-8 file:border-0 file:bg-transparent file:text-caption file:font-medium file:text-foreground placeholder:text-stone focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
