"use client";

import { ChangeText } from "@/components/market/change-chip";
import { Sparkline } from "@/components/market/sparkline";
import { Skeleton } from "@/components/ui/skeleton";
import type { Candle, Instrument, Quote } from "@/lib/api/types";
import { formatQuotePrice } from "@/lib/market/format";
import { cn } from "@/lib/utils";

export interface PulseRow {
  instrument: Instrument;
  quote: Quote;
  candles: readonly Candle[];
}

/**
 * What moved today.
 *
 * Ranked by the size of the move rather than by market cap or alphabet,
 * because the useful question on a dashboard is "did anything happen" — and a
 * list that never changes stops being read within a week.
 *
 * The sparkline is a month of closes, deliberately not today's tick: a
 * one-session line has no shape, and the point of the column is to show
 * whether today's move is a continuation or a break.
 */
export function MarketPulse({
  rows,
  className,
}: {
  rows: readonly PulseRow[];
  className?: string;
}) {
  return (
    <ul className={cn("divide-y divide-line", className)}>
      {rows.map(({ instrument, quote, candles }) => (
        <li
          key={instrument.symbol}
          className="grid grid-cols-[minmax(0,1fr)_3.5rem_auto] items-center gap-3 py-2.5 first:pt-0 last:pb-0"
        >
          <div className="min-w-0">
            <span className="mono-label text-caption text-ink">{instrument.symbol}</span>
            <p className="truncate text-micro text-stone">{instrument.name}</p>
          </div>

          <Sparkline
            values={candles.map((c) => c.c)}
            height={22}
            tone="mist"
            fill={false}
          />

          <div className="text-right">
            <p className="num text-caption font-medium text-ink">
              {formatQuotePrice(instrument, quote.price)}
            </p>
            <ChangeText value={quote.changePct} className="text-caption font-medium mt-0.5">
              {`${quote.changePct >= 0 ? "+" : "−"}${(Math.abs(quote.changePct) * 100).toFixed(2)}%`}
            </ChangeText>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function MarketPulseSkeleton({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <ul className={cn("divide-y divide-line", className)} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li
          key={i}
          className="grid grid-cols-[minmax(0,1fr)_3.5rem_auto] items-center gap-3 py-2.5 first:pt-0 last:pb-0"
        >
          <div className="min-w-0 space-y-1">
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-[22px] w-full" />
          <div className="flex flex-col items-end space-y-1">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-4 w-12 rounded-md" />
          </div>
        </li>
      ))}
    </ul>
  );
}
