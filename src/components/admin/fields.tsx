import { cn } from "@/lib/utils";

/**
 * The admin tab's form parts, at Settings' own scale (decision 284).
 *
 * Every admin form sits inside a `SettingGroup` box like any other setting, so a
 * field's label is a row label — 15px medium — with its hint beside it and a
 * count on the right. The shadcn `Label` is 14px, off the type scale, and was
 * the most visible reason this tab read as a different app.
 */
export function AdminField({
  id,
  label,
  hint,
  count,
  note,
  className,
  children,
}: {
  id?: string;
  label: string;
  /** Beside the label, in stone: what kind of value this wants. */
  hint?: string;
  /** Right-aligned, e.g. "12/80". */
  count?: string;
  /** Under the control. */
  note?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const Label = id ? "label" : "p";
  return (
    <div className={cn("grid content-start gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label
          {...(id ? { htmlFor: id } : {})}
          className="text-caption font-medium text-ink"
        >
          {label}
          {hint && <span className="ml-1.5 font-normal text-stone">{hint}</span>}
        </Label>
        {count && <span className="text-micro text-stone tabular-nums">{count}</span>}
      </div>
      {children}
      {note && <p className="text-micro text-stone">{note}</p>}
    </div>
  );
}

/** The bottom of a form's box: its one action, and why it is unavailable. */
export function AdminActions({
  problem,
  className,
  children,
}: {
  problem?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3.5 sm:px-5",
        className,
      )}
    >
      {children}
      {problem && <p className="text-micro text-stone">{problem}</p>}
    </div>
  );
}

/** A list's empty or loading line, inside its box. */
export function AdminEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-4 text-caption text-stone sm:px-5">{children}</p>;
}
