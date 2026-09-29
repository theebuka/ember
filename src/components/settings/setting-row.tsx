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
    <div className={cn("py-3.5 first:pt-0 last:pb-0", className)}>
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
              "block text-body font-medium text-ink",
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
            <p className="mt-1 max-w-[48ch] text-caption break-words text-pretty text-stone">
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

/** The hairline-divided stack a settings card is made of. */
export function SettingGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("divide-y divide-line", className)} {...props} />;
}
