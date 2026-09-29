import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/common/section-header";

/**
 * The default container, and it is not a card.
 *
 * v1 wrapped every block of the app in `<Card>`, which is the single loudest
 * structural tell of an assembled interface: a page of bordered rectangles
 * reads as a dashboard template rather than as a product. It also cost real
 * width — a card's 24px of padding sits *inside* the page's own, so on a 375px
 * screen the content column was 40px narrower than it needed to be.
 *
 * A `Section` is a heading and its content, separated from its neighbours by
 * space. No border, no fill, no radius. On light, `ground` and `surface` are
 * both white precisely so this is possible.
 *
 * `Card` still exists and still has three jobs — a single genuinely elevated
 * hero object, the body of a modal or sheet, and chrome that floats over
 * scrolling content. Anything else is a Section.
 */
export function Section({
  title,
  hint,
  href,
  linkLabel,
  action,
  children,
  className,
  headerClassName,
  ...props
}: {
  title?: string;
  hint?: React.ReactNode;
  href?: string;
  linkLabel?: string;
  action?: React.ReactNode;
  headerClassName?: string;
} & React.ComponentProps<"section">) {
  return (
    <section className={cn("min-w-0", className)} {...props}>
      {title && (
        <SectionHeader
          title={title}
          hint={hint}
          href={href}
          linkLabel={linkLabel}
          action={action}
          className={cn("mb-3", headerClassName)}
        />
      )}
      {children}
    </section>
  );
}

/**
 * A list, hairline-separated.
 *
 * The separator is the *only* structure a list needs. It sits between items
 * rather than around the group, so the list reads as content on the page
 * instead of a table in a box — and a hairline that stops at the text rather
 * than running edge-to-edge is what keeps a long list from looking like a
 * spreadsheet.
 *
 * `inset` pulls the rules in to align with the text column, which is right
 * when rows have a leading icon or avatar and wrong when they don't.
 */
export function Rows({
  inset = false,
  className,
  ...props
}: { inset?: boolean } & React.ComponentProps<"div">) {
  return (
    <div
      data-slot="rows"
      className={cn(
        "flex flex-col divide-y divide-line",
        inset && "[&>*]:relative",
        className,
      )}
      {...props}
    />
  );
}

/**
 * One line of a list.
 *
 * Deliberately generous vertically — 14px of padding either side of a 17px
 * body line gives a 48px row, which is a comfortable touch target without
 * anything needing a hit-region hack.
 */
export function Row({
  leading,
  trailing,
  className,
  children,
  ...props
}: {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
} & React.ComponentProps<"div">) {
  return (
    <div
      data-slot="row"
      className={cn("flex items-center gap-3.5 py-3.5", className)}
      {...props}
    >
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">{children}</div>
      {trailing && <div className="shrink-0 text-right">{trailing}</div>}
    </div>
  );
}

/**
 * A figure and its label.
 *
 * The label goes *under* the value, not over it. In a column of numbers the
 * eye wants the figures on one baseline; a label above each one pushes them
 * out of alignment and makes the group read as separate facts rather than as
 * a set.
 */
export function Stat({
  label,
  value,
  hint,
  className,
  ...props
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
} & React.ComponentProps<"div">) {
  return (
    <div className={cn("min-w-0", className)} {...props}>
      <div className="num truncate text-heading font-semibold text-ink">
        {value}
      </div>
      <div className="mt-0.5 truncate text-caption text-stone">{label}</div>
      {hint && <div className="mt-0.5 truncate text-micro text-stone">{hint}</div>}
    </div>
  );
}

/** A hairline. Full-bleed by default; `soft` pulls it in from the edges. */
export function Divider({
  soft = false,
  className,
  ...props
}: { soft?: boolean } & React.ComponentProps<"hr">) {
  return (
    <hr
      className={cn("border-0 border-t border-line", soft && "mx-4", className)}
      {...props}
    />
  );
}
