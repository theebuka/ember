import { cn } from "@/lib/utils"

/**
 * A placeholder is never content. Hidden from assistive tech by default: the
 * transparent glyphs that size a skeleton by type metrics (ADR 0019) were read
 * aloud, "l v l v" on the asset page and "Label hint" in the risk table.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
