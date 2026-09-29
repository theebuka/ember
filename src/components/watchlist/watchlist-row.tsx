"use client";

import Link from "next/link";
import { EyeOff, MoreHorizontal } from "@/components/common/icon";
import { ActionBadge } from "@/components/signals/action-badge";
import { Confidence } from "@/components/signals/confidence";
import { ChangeChip } from "@/components/market/change-chip";
import { Sparkline } from "@/components/market/sparkline";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { Assessment } from "@/lib/api/client";
import type { Candle, Instrument, Quote } from "@/lib/api/types";
import { formatPercent, formatQuotePrice } from "@/lib/market/format";
import { cn } from "@/lib/utils";

export interface WatchRow {
  instrument: Instrument;
  quote: Quote | null;
  candles: readonly Candle[];
  assessment: Assessment | null;
  /** True when this read clears the user's risk profile and reaches the feed. */
  actionable: boolean;
  /** Set when the user holds this — the watchlist should say so. */
  weight: number | null;
}

/**
 * One followed instrument.
 *
 * The signal badge is the reason this screen isn't just a price list. It
 * carries a `Hold` as readily as a `Buy` — the advice feed filters to what
 * clears the bar, but here the user asked about this specific instrument, and
 * "nothing worth acting on" is a real answer to that question rather than an
 * absence of one.
 *
 * The sparkline stays graphite whichever way the price went (CLAUDE.md §5). A
 * grid of small green and red charts is the single strongest casino signal a
 * trading UI can send, and this is the screen most at risk of becoming one.
 */
export function WatchlistRow({
  row,
  onRemove,
}: {
  row: WatchRow;
  onRemove: () => void;
}) {
  const { instrument, quote, candles, assessment, actionable, weight } = row;
  const closes = candles.map((c) => c.c);

  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/asset/${instrument.symbol}`}
            className="mono-label rounded-sm text-caption text-ink outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {instrument.symbol}
          </Link>
          {assessment ? (
            <ActionBadge
              action={assessment.action}
              size="sm"
              muted={!actionable}
              title={
                actionable
                  ? "In the signals feed — this clears your risk profile."
                  : "Ember's read, but below your risk profile's bar. Not in the feed."
              }
            />
          ) : instrument.dataState === "collecting" ? (
            /**
             * Says which silence this is.
             *
             * A row with no badge reads as "ember looked and had nothing to
             * say". For an NGX listing that is wrong — ember has not been able
             * to look, because the exchange publishes no history and ember is
             * building one a day at a time. Not tinted: this is a status, not
             * a direction (decision 077).
             */
            <span
              className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-micro text-stone"
              title="No price history exists for this exchange, so ember is collecting one. It will form a view after about two hundred sessions."
            >
              Collecting
            </span>
          ) : null}
          {weight !== null && (
            <span
              className="num shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-micro text-stone"
              title="You hold this"
            >
              {formatPercent(weight, { decimals: 1 })}
            </span>
          )}
        </div>
        <p className="truncate text-micro text-stone">{instrument.name}</p>

        {/* Below the name on mobile, where a third column won't fit.
            The space is reserved whether or not there's a line to draw:
            prices and candles arrive on two different requests, so the row
            renders once without a sparkline and again with one, and letting
            it grow 18px in between moved every row beneath it — measured at
            0.10 cumulative layout shift on this screen. */}
        <div className="mt-1.5 h-[18px] md:hidden">
          {closes.length > 1 && (
            <Sparkline values={closes} height={18} tone="mist" fill={false} />
          )}
        </div>
      </div>

      {closes.length > 1 && (
        <Sparkline
          values={closes}
          height={26}
          tone="mist"
          fill={false}
          className="hidden w-20 shrink-0 md:block"
        />
      )}

      {assessment && (
        <Confidence
          value={assessment.confidence}
          label={assessment.confidenceLabel}
          className="hidden w-28 shrink-0 justify-end lg:flex"
        />
      )}

      <div className="w-24 shrink-0 text-right">
        {quote ? (
          <>
            <p className="num text-caption font-medium text-ink">
              {formatQuotePrice(instrument, quote.price)}
            </p>
            <ChangeChip value={quote.changePct} size="sm" className="mt-0.5">
              {formatPercent(quote.changePct, { signed: true })}
            </ChangeChip>
          </>
        ) : (
          <p className="text-caption text-stone">—</p>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-stone"
            aria-label={`Actions for ${instrument.symbol}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/asset/${instrument.symbol}`}>See the full read</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onRemove}>
            <EyeOff />
            Stop following
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function WatchlistRowSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-line" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3.5 w-14" />
              <Skeleton className="h-4 w-12 rounded-md" />
            </div>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-[18px] w-full md:hidden" />
          </div>
          <Skeleton className="hidden h-[26px] w-20 shrink-0 md:block" />
          <Skeleton className="hidden h-4 w-28 shrink-0 lg:block" />
          <div className="flex w-24 shrink-0 flex-col items-end space-y-1">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-4 w-12 rounded-md" />
          </div>
          <Skeleton className={cn("size-7 shrink-0 rounded-md")} />
        </li>
      ))}
    </ul>
  );
}
