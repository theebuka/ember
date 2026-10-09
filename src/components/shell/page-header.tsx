"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CaretLeft } from "@/components/common/icon";
import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { useScrolled } from "@/hooks/use-scroll-direction";
import { cn } from "@/lib/utils";

/**
 * Sticky page header.
 *
 * Pages own their header rather than the shell deriving one from the route —
 * a detail page knows its own title and its own actions, and reading them
 * back out of the URL would just be indirection.
 *
 * On mobile, top-level pages show the lockup; deeper pages give that slot to
 * a back control, because getting out matters more there than branding. On
 * desktop the side panel already carries the brand, so the header is always
 * the title.
 */
export function PageHeader({
  title,
  /** Show the lockup instead of the title on mobile. Top-level pages only. */
  brand = false,
  /** Render a back control. Pass a href for a known parent, or true for history. */
  back,
  actions,
  /** Match a `PageBody narrow`: the actions end where the content does. */
  narrow = false,
  className,
}: {
  title: string;
  brand?: boolean;
  back?: string | true;
  actions?: React.ReactNode;
  narrow?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const scrolled = useScrolled();

  return (
    <header
      className={cn(
        // Opaque rather than a translucent blur: `backdrop-filter` forces a
        // compositing layer, and a composited `position: sticky` element is a
        // known iOS Safari hit-test hazard — it paints where it scrolled to
        // while its tappable region stays put, so the back button eats taps.
        // Beneath the announcement bar when there is one; `--bar-h` is 0 otherwise.
        "sticky top-[var(--bar-h,0px)] z-30 bg-ground",
        "border-b transition-colors duration-200",
        scrolled ? "border-line" : "border-transparent",
        className,
      )}
      style={{ paddingTop: "var(--safe-top)" }}
    >
      {/* Matches PageBody's column exactly — same cap, same padding steps.
          When one moves the other has to, or the title stops sitting over
          the content it names. */}
      <div className="mx-auto max-w-[100rem] px-4 min-[360px]:px-5 md:px-8 xl:px-12">
      <div
        className={cn(
          "flex h-16 items-center gap-1.5 min-[360px]:gap-2 md:h-20",
          narrow && "max-w-4xl",
        )}
      >
        {back && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Go back"
            className="-ml-2.5 shrink-0 text-stone"
            {...(typeof back === "string"
              ? { asChild: true }
              : { onClick: () => router.back() })}
          >
            {typeof back === "string" ? (
              <Link href={back}>
                <CaretLeft />
              </Link>
            ) : (
              <CaretLeft />
            )}
          </Button>
        )}

        {brand && !back && <Logo className="md:hidden" />}

        {/* On a `brand` page the title is never drawn. Mobile gets the lockup
            in this slot and desktop gets the rail's active item, and the
            screen's own opening line — the greeting on Home — is the visible
            `h1`. v1 rendered "Home" here on desktop directly above "Good
            afternoon, Travis", which is two headings saying the same thing
            with one of them redundant. The accessible name survives. */}
        <h1
          className={cn(
            "min-w-0 truncate text-title font-semibold tracking-title text-ink",
            // A detail page shares the row with a back control and two
            // labelled actions; at 28px a six-letter symbol truncated.
            back && "max-md:text-heading",
            brand && !back && "sr-only",
          )}
        >
          {title}
        </h1>

        {actions && (
          <div className="ml-auto flex shrink-0 items-center gap-1.5 min-[360px]:gap-2">
            {actions}
          </div>
        )}
      </div>
      </div>
    </header>
  );
}
