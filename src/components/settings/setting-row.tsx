import { cn } from "@/lib/utils";

/**
 * One setting: what it is, what it does, and the control that changes it.
 *
 * The description is not optional decoration. Every setting on this screen
 * changes something the user can see elsewhere in the app, and a bare label
 * beside a switch makes them find out by experiment. `Forex — hides EUR/USD,
 * USD/JPY and GBP/USD from the watchlist and the feed` costs one line and
 * removes the guessing.
 *
 * Where the control sits depends on how wide it is, which the row can't
 * measure — so it's stated:
 *
 *   `inline` — a switch, which is 32px and belongs on the right at every
 *   width. Dropping one below its own description leaves a lone toggle
 *   floating on the left with nothing to attach it to.
 *
 *   `responsive` (the default) — a pair of buttons or a link. Inline where
 *   there's room, beneath the text on a phone, where sharing the row would
 *   squeeze the description to nothing.
 *
 *   `stack` — a segmented control or anything else that needs the full width.
 */
export function SettingRow({
  label,
  description,
  control,
  layout = "responsive",
  htmlFor,
  className,
  children,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  control?: React.ReactNode;
  layout?: "inline" | "responsive" | "stack";
  /** Set when the control is a real form element, so the label targets it. */
  htmlFor?: string;
  className?: string;
  /** Anything that belongs under the whole row — a note, a table, a preview. */
  children?: React.ReactNode;
}) {
  const Label = htmlFor ? "label" : "div";

  return (
    // Padded inside its group's container rather than flush to the page, so a
    // group reads as one object and the row's hairline stops at the box.
    <div className={cn("px-4 py-4 sm:px-5", className)}>
      <div
        className={cn(
          "flex gap-x-5 gap-y-2.5",
          layout === "inline" && "flex-row items-center",
          layout === "responsive" && "flex-col sm:flex-row sm:items-center",
          layout === "stack" && "flex-col",
        )}
      >
        <div className="min-w-0 flex-1">
          <Label
            {...(htmlFor ? { htmlFor } : {})}
            className={cn(
              // 14px medium, under a 16px group heading and a 20px pane title.
              // It was 17px under a 15px group label, so every block on the
              // screen read upside down (decision 284).
              "block text-caption font-medium text-ink",
              htmlFor && "cursor-pointer",
            )}
          >
            {label}
          </Label>
          {/* `max-w-prose` is 65ch, which at 15px measured **666px** — about 85
              characters a line, well past the 60–70 a reader tracks comfortably,
              and a large part of why the settings pane read as a wall of text.
              48ch is ~490px and lands inside the band. */}
          {/* Three properties, and each one is a wrap this row used to get wrong.
              `text-pretty` stops a description ending on a single orphaned word,
              which is what "wraps for no reason" usually looks like from outside
              — a two-line paragraph whose second line holds one short word.
              `break-words` means a long unbreakable token (an email address, a
              URL) shortens the line it is on instead of pushing the row wider
              than the phone. And `max-w-[48ch]` caps the measure at ~48
              characters rather than `max-w-prose`'s 65, which measured 666px
              (decision 213). */}
          {description && (
            <p className="mt-0.5 max-w-[48ch] text-caption break-words text-pretty text-stone">
              {description}
            </p>
          )}
        </div>

        {control && (
          <div
            className={cn(
              // `shrink-0` so a button never gets squeezed into wrapping its
              // own label — the text beside it carries `min-w-0` and gives way
              // instead, which is the correct order of concessions: a sentence
              // can take another line, `Sign out` cannot.
              "shrink-0",
              layout === "inline" && "ml-auto",
              layout === "responsive" && "sm:ml-auto",
            )}
          >
            {control}
          </div>
        )}
      </div>

      {children}
    </div>
  );
}

/**
 * A titled group of settings: a heading, an optional line under it, the rows in
 * one bordered container, and an optional footnote beneath.
 *
 * **The inset grouped list** — iOS Settings, macOS System Settings, GitHub,
 * Vercel and Linear all draw a settings group this way, and it is the one place
 * in ember where a bordered container is the default rather than the exception
 * (§5's card rule is about content screens). Containment is what tells a reader
 * which switches belong together; hairlines alone left a pane of five groups
 * reading as one long list.
 *
 * `boxed={false}` keeps the heading and drops the container, for content that
 * draws its own (a plan comparison, the risk table, the admin composer).
 */
export function SettingGroup({
  title,
  description,
  footer,
  action,
  tone = "default",
  boxed = true,
  heading: Heading = "h3",
  id,
  className,
  children,
}: {
  title?: string;
  description?: React.ReactNode;
  /** A note under the container — a caveat, never a control. */
  footer?: React.ReactNode;
  /** Beside the heading: a status, a count, a small link. */
  action?: React.ReactNode;
  /** `danger` for the irreversible group, the only one tinted. */
  tone?: "default" | "danger";
  boxed?: boolean;
  /** `h2` where there is no pane title above the group — the phone's index. */
  heading?: "h2" | "h3";
  /** An anchor, for a link that means one group rather than its pane. */
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("min-w-0 scroll-mt-36", className)}>
      {(title || description) && (
        <div className="mb-3 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {title && (
              <Heading
                className={cn(
                  "text-body font-semibold text-ink",
                  tone === "danger" && "text-down",
                )}
              >
                {title}
              </Heading>
            )}
            {description && (
              <p className="mt-0.5 max-w-[56ch] text-caption text-pretty text-stone">
                {description}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}

      {boxed ? (
        <div
          className={cn(
            "divide-y overflow-hidden rounded-xl border bg-surface",
            tone === "danger" ? "divide-down/20 border-down/30" : "divide-line border-line",
          )}
        >
          {children}
        </div>
      ) : (
        children
      )}

      {footer && (
        <div className="mt-2.5 max-w-[60ch] space-y-1.5 px-1 text-micro text-pretty text-stone">
          {footer}
        </div>
      )}
    </section>
  );
}

/** Padded content inside a group that is not a row — a form, a preview. */
export function SettingBlock({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-4 py-4 sm:px-5", className)} {...props} />;
}

/**
 * A settings tab's own heading: its name and one line on what it holds.
 *
 * The tab row used to be the only title, with the pane's `h2` kept for screen
 * readers — so nothing on screen sat between the 40px page title and the first
 * 15px group label. Every settings reference names the pane it is showing.
 */
export function SettingsPaneHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    // On a phone the page header already carries the section's name, so the
    // title stays for assistive tech and only the line under it shows.
    <header className="mb-6 lg:mb-8 lg:border-b lg:border-line lg:pb-5">
      <h2 className="text-heading font-semibold tracking-title text-ink max-lg:sr-only">
        {title}
      </h2>
      {description && <p className="text-caption text-stone lg:mt-1">{description}</p>}
    </header>
  );
}
