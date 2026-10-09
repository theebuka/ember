import Link from "next/link";
import { CaretRight } from "@/components/common/icon";
import { cn } from "@/lib/utils";

/**
 * The label above a block of content.
 *
 * An eyebrow rather than a heading: these sections sit inside a page that
 * already has an `h1`, and setting them at title size would give the dashboard
 * five competing headlines. The optional link is the section's own next
 * action, which is what keeps a truncated list from being a dead end.
 */
export function SectionHeader({
  title,
  hint,
  href,
  linkLabel = "See all",
  action,
  className,
}: {
  title: string;
  /** A quiet qualifier — a count, a timestamp, a caveat. */
  hint?: React.ReactNode;
  href?: string;
  linkLabel?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    /* Wraps rather than truncates. A three-item row of title, hint and link
       has no slack at 375px, and `truncate` on the hint turned "12 strongest
       of 28" into "12 s…" while squeezing the title onto three lines. Letting
       the hint drop to its own line costs nothing and cannot produce a word
       fragment — same reasoning as ADR 0023's rule against inventing
       abbreviations to make a heading fit. */
    <div
      // 12px to its content, everywhere. It was 10px here and overridden to
      // 16px by an `mt-4` on the sibling in two settings blocks, so the same
      // header sat at two different distances on one screen.
      //
      // Title and link share the first line; the hint goes *under* the title.
      // Beside it, on a phone, the three never fit and the link dropped to a
      // stray line of its own under the count — the most visible piece of
      // "haphazard" on every screen that had one.
      className={cn("mb-3 flex items-start gap-3", className)}
    >
      <div className="min-w-0 flex-1">
        <h2 className="eyebrow">{title}</h2>
        {hint && <p className="mt-0.5 text-micro text-stone">{hint}</p>}
      </div>

      <div className="flex shrink-0 items-baseline gap-2">
        {action}
        {href && (
          <Link
            href={href}
            className={cn(
              "group inline-flex items-center gap-1 rounded-sm text-caption font-medium",
              "text-stone transition-colors hover:text-ink",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            {linkLabel}
            <CaretRight className="size-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>
    </div>
  );
}
