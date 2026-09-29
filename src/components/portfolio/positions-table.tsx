"use client";

import { ChangeText } from "@/components/market/change-chip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BaseCurrency } from "@/lib/api/types";
import {
  formatMoney,
  formatPercent,
  formatQuantity,
  formatQuotePrice,
} from "@/lib/market/format";
import type { Position } from "@/lib/portfolio/derive";
import { cn } from "@/lib/utils";

/**
 * The full book.
 *
 * A table on desktop and stacked rows on mobile — not a horizontally
 * scrolling table, which is the usual shortcut and which hides the P&L column
 * off the right edge of a phone, where it is the column people came for.
 *
 * Every figure here is derived from the transaction log on render. There is no
 * stored quantity, no stored cost basis, and therefore nothing that can drift.
 */
export function PositionsTable({
  positions,
  base,
  onSelect,
  className,
}: {
  positions: readonly Position[];
  base: BaseCurrency;
  /** Opens the transaction form pre-filled with this symbol. */
  onSelect?: (symbol: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      {/* Mobile */}
      <ul className="divide-y divide-line md:hidden">
        {positions.map((position) => (
          <li key={position.symbol}>
            <PositionCard position={position} base={base} onSelect={onSelect} />
          </li>
        ))}
      </ul>

      {/* Desktop */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-micro text-stone">Asset</TableHead>
              <TableHead className="text-right text-micro text-stone">Quantity</TableHead>
              <TableHead className="text-right text-micro text-stone">Avg cost</TableHead>
              <TableHead className="text-right text-micro text-stone">Price</TableHead>
              <TableHead className="text-right text-micro text-stone">Value</TableHead>
              <TableHead className="text-right text-micro text-stone">Unrealized</TableHead>
              <TableHead className="text-right text-micro text-stone">Today</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position) => (
              <TableRow
                key={position.symbol}
                className={cn(onSelect && "cursor-pointer")}
                onClick={onSelect ? () => onSelect(position.symbol) : undefined}
              >
                <TableCell>
                  <div className="flex items-baseline gap-2">
                    <span className="mono-label text-caption text-ink">
                      {position.symbol}
                    </span>
                    <span className="num text-micro text-stone">
                      {formatPercent(position.weight, { decimals: 1 })}
                    </span>
                  </div>
                  <span className="text-micro text-stone">
                    {position.instrument.name}
                  </span>
                </TableCell>
                <TableCell className="num text-right text-caption text-graphite">
                  {formatQuantity(position.quantity, position.instrument.market)}
                </TableCell>
                <TableCell className="num text-right text-caption text-graphite">
                  {formatQuotePrice(position.instrument, position.averageCost)}
                </TableCell>
                <TableCell className="num text-right text-caption text-graphite">
                  {formatQuotePrice(position.instrument, position.price)}
                </TableCell>
                <TableCell className="num text-right text-caption font-medium text-ink">
                  {formatMoney(position.marketValue, base)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="num text-caption font-medium text-ink">
                    {formatMoney(position.unrealized, base, { signed: true })}
                  </div>
                  {position.unrealizedPct !== null && (
                    <div
                      className={cn(
                        "num text-micro",
                        position.unrealized > 0
                          ? "text-up"
                          : position.unrealized < 0
                            ? "text-down"
                            : "text-stone",
                      )}
                    >
                      {formatPercent(position.unrealizedPct, { signed: true })}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <ChangeText value={position.dayChange} className="text-caption font-medium">
                    {formatPercent(position.dayChangePct, { signed: true })}
                  </ChangeText>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PositionCard({
  position,
  base,
  onSelect,
}: {
  position: Position;
  base: BaseCurrency;
  onSelect?: (symbol: string) => void;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="mono-label text-caption text-ink">{position.symbol}</span>
            <span className="num text-micro text-stone">
              {formatPercent(position.weight, { decimals: 1 })}
            </span>
          </div>
          <p className="truncate text-micro text-stone">{position.instrument.name}</p>
        </div>
        <div className="text-right">
          <p className="num text-body font-medium text-ink">
            {formatMoney(position.marketValue, base)}
          </p>
          <ChangeText value={position.dayChange} className="text-caption font-medium mt-0.5">
            {formatPercent(position.dayChangePct, { signed: true })}
          </ChangeText>
        </div>
      </div>

      <dl className="mt-2.5 grid grid-cols-3 gap-2">
        <Cell
          label="Quantity"
          value={formatQuantity(position.quantity, position.instrument.market)}
        />
        <Cell
          label="Avg cost"
          value={formatQuotePrice(position.instrument, position.averageCost)}
        />
        <Cell
          label="Unrealized"
          value={formatMoney(position.unrealized, base, { signed: true })}
          hint={
            position.unrealizedPct === null
              ? undefined
              : formatPercent(position.unrealizedPct, { signed: true })
          }
          tone={position.unrealized}
        />
      </dl>
    </>
  );

  if (!onSelect) return <div className="py-3">{body}</div>;

  return (
    <button
      type="button"
      onClick={() => onSelect(position.symbol)}
      className="w-full rounded-lg py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {body}
    </button>
  );
}

function Cell({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: number;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-micro text-stone">{label}</dt>
      <dd
        className={cn(
          "num truncate text-caption",
          tone === undefined || tone === 0
            ? "text-graphite"
            : tone > 0
              ? "text-up"
              : "text-down",
        )}
      >
        {value}
        {/* Its own line. Inline, a five-figure gain plus its percentage
            overflowed a third of a phone and truncated to "+$6,109.08 +…",
            hiding the one number the reader came for. */}
        {hint && <span className="block text-micro text-stone">{hint}</span>}
      </dd>
    </div>
  );
}

export function PositionsTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-line" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center justify-between gap-3 py-3.5">
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="flex flex-col items-end space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-14 rounded-md" />
          </div>
        </li>
      ))}
    </ul>
  );
}
