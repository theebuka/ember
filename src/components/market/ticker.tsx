import type { Instrument } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * Symbol over name.
 *
 * The symbol is the only place IBM Plex Mono appears alongside timestamps —
 * uppercase and tracked out, so a ticker reads as a system identifier rather
 * than as a word. Everything numeric stays in Archivo with tabular figures
 * (CLAUDE.md §5).
 */
export function Ticker({
  instrument,
  showName = true,
  className,
}: {
  instrument: Instrument;
  showName?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 flex-col", className)}>
      <span className="mono-label truncate text-caption text-ink">
        {instrument.symbol}
      </span>
      {showName && (
        <span className="truncate text-micro text-stone">{instrument.name}</span>
      )}
    </span>
  );
}
