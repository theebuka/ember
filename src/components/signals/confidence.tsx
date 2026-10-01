import { cn } from "@/lib/utils";

/**
 * `Moderate · 68`.
 *
 * A word and a number, not a gauge ring or a donut. Those are the category
 * cliché and they carry one value in a shape the size of a card — this says
 * the same thing in two words and leaves the space for the reasoning, which is
 * the part the user can actually check.
 *
 * The word and the number are both shown deliberately. The label is what a
 * person acts on; the number is what makes two recommendations comparable and
 * what stops the label being an unfalsifiable adjective.
 *
 * **Calibration:** readings land in roughly 10–55, because confidence is a
 * product of four sub-unit terms. The bands are set to that range, not to an
 * imagined 0–100 (CLAUDE.md §8).
 */
export function Confidence({
  value,
  label,
  className,
}: {
  /** 0…100 as returned by the engine. */
  value: number;
  label: "Low" | "Moderate" | "High";
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-baseline gap-1.5 text-caption", className)}
      title="How strongly the rules agree. Lower when they disagree or the market is unfavourable."
    >
      <span className="font-medium text-graphite">{label}</span>
      <span aria-hidden className="text-stone">
        ·
      </span>
      <span className="num text-stone">{value}</span>
      <span className="sr-only">out of 100 confidence</span>
    </span>
  );
}
