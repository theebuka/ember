import { EmberPoint } from "@/components/common/ember-point";
import { cn } from "@/lib/utils";

/**
 * The ember lockup: the ember point followed by the wordmark.
 *
 * v1 set the wordmark at 88% on Archivo's width axis, against hero figures
 * expanded to 112% — the two ends of that axis were the identity. Satoshi has
 * no width axis, so the wordmark is now carried by weight and a firm negative
 * tracking instead, which is what gives a five-letter lowercase word enough
 * density to hold its own beside the mark.
 */
export function Logo({
  wordmark = true,
  size = 18,
  className,
}: {
  wordmark?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <EmberPoint size={size} />
      {wordmark && (
        <span className="text-[1.1875rem] leading-none font-bold tracking-[-0.03em] text-ink">
          ember
        </span>
      )}
      <span className="sr-only">ember</span>
    </span>
  );
}
