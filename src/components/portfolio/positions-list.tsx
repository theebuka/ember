"use client";

import { ChangeText } from "@/components/market/change-chip";
import { Skeleton } from "@/components/ui/skeleton";
import type { BaseCurrency } from "@/lib/api/types";
import { formatMoney, formatPercent, formatQuantity } from "@/lib/market/format";
import type { Position } from "@/lib/portfolio/derive";
import { cn } from "@/lib/utils";

/**
 * What the book is made of.
 *
 * The allocation bar reads left to right in descending weight, and the
 * segments are steps down the warm graphite ramp rather than a categorical
 * palette — a portfolio split isn't a set of unrelated categories, it's one
 * quantity divided up, and a rainbow would say otherwise. It also keeps ember
 * free for the one thing it marks on this screen.
 */
export function AllocationBar({
  positions,
  className,
}: {
  positions: readonly Position[];
  className?: string;
}) {
  // Past six segments the slivers are too thin to read or to hover.
  const shown = positions.slice(0, 6);
  const rest = positions.slice(6).reduce((acc, p) => acc + p.weight, 0);

  return (
    <div
      className={cn("flex h-1.5 w-full gap-px overflow-hidden rounded-full", className)}
      role="img"
      aria-label={`Allocation: ${shown
        .map((p) => `${p.symbol} ${formatPercent(p.weight, { decimals: 0 })}`)
        .join(", ")}`}
    >
      {shown.map((position, i) => (
        <div
          key={position.symbol}
          className="h-full bg-graphite"
          style={{
            width: `${position.weight * 100}%`,
            opacity: 1 - i * 0.13,
          }}
          title={`${position.symbol} · ${formatPercent(position.weight, { decimals: 1 })}`}
        />
      ))}
      {rest > 0 && (
        <div
          className="h-full bg-faint"
          style={{ width: `${rest * 100}%` }}
          title={`Everything else · ${formatPercent(rest, { decimals: 1 })}`}
        />
      )}
    </div>
  );
}

export function PositionsList({
  positions,
  base,
  className,
}: {
  positions: readonly Position[];
  base: BaseCurrency;
  className?: string;
}) {
  return (
    <ul className={cn("divide-y divide-line", className)}>
      {positions.map((position) => (
        <li
          key={position.symbol}
          className="grid grid-cols-[1fr_auto] items-center gap-3 py-2.5 first:pt-0 last:pb-0"
        >
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="mono-label text-caption text-ink">{position.symbol}</span>
              <span className="num text-micro text-stone">
                {formatPercent(position.weight, { decimals: 1 })}
              </span>
            </div>
            <p className="num truncate text-micro text-stone">
              {formatQuantity(position.quantity, position.instrument.market)}
              {" @ "}
              {formatMoney(position.averageCost, position.instrument.currency, {
                decimals: position.instrument.precision,
              })}
            </p>
          </div>

          <div className="text-right">
            <p className="num text-body font-medium text-ink">
              {formatMoney(position.marketValue, base)}
            </p>
            <div className="mt-0.5 flex items-center justify-end gap-1.5">
              <ChangeText value={position.dayChange} className="text-caption font-medium">
                {formatPercent(position.dayChangePct, { signed: true })}
              </ChangeText>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PositionsListSkeleton({
  rows = 4,
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
          className="grid grid-cols-[1fr_auto] items-center gap-3 py-2.5 first:pt-0 last:pb-0"
        >
          <div className="min-w-0 space-y-1">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="flex flex-col items-end space-y-1">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-12 rounded-md" />
          </div>
        </li>
      ))}
    </ul>
  );
}
