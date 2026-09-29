"use client";

import { MoreHorizontal, Pencil, Trash2 } from "@/components/common/icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Instrument, Transaction } from "@/lib/api/types";
import { formatMoney, formatQuantity, formatShortDate } from "@/lib/market/format";
import { cn } from "@/lib/utils";

/**
 * Every trade, newest first.
 *
 * This is the source of truth made visible — the derived numbers above it are
 * all consequences of these rows, and a user who doesn't believe a figure has
 * to be able to come here and find the trade that produced it. Nothing is
 * hidden or summarised away.
 *
 * Edit and delete are in a menu rather than as two always-visible icons per
 * row: a hundred-row ledger with two hundred icon buttons is noise, and the
 * destructive one being permanently one mis-tap away is worse.
 */
export function TransactionHistory({
  transactions,
  instruments,
  onEdit,
  onDelete,
  className,
}: {
  transactions: readonly Transaction[];
  instruments: readonly Instrument[];
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  className?: string;
}) {
  const bySymbol = new Map(instruments.map((i) => [i.symbol, i]));

  // Newest first, with a stable tiebreak so two trades on one day don't swap
  // places between renders.
  const ordered = [...transactions].sort((a, b) => {
    const byDate = Date.parse(b.date) - Date.parse(a.date);
    return byDate !== 0 ? byDate : b.id.localeCompare(a.id);
  });

  return (
    <ul className={cn("divide-y divide-line", className)}>
      {ordered.map((tx) => {
        const instrument = bySymbol.get(tx.symbol);
        const currency = instrument?.currency ?? "USD";
        const gross = tx.quantity * tx.price;
        const total = tx.side === "buy" ? gross + (tx.fees ?? 0) : gross - (tx.fees ?? 0);

        return (
          <li key={tx.id} className="flex items-center gap-3 py-2.5">
            <span
              className={cn(
                "shrink-0 rounded-md px-1.5 py-0.5 text-micro font-semibold",
                tx.side === "buy" ? "bg-up-tint text-up" : "bg-down-tint text-down",
              )}
            >
              {tx.side === "buy" ? "Buy" : "Sell"}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="mono-label text-caption text-ink">{tx.symbol}</span>
                <span className="num truncate text-micro text-stone">
                  {formatQuantity(tx.quantity, instrument?.market ?? "equity")}
                  {" @ "}
                  {formatMoney(tx.price, currency, {
                    decimals: instrument?.precision ?? 2,
                  })}
                </span>
              </div>
              <p className="truncate text-micro text-stone">
                <span className="num">{formatShortDate(Date.parse(tx.date))}</span>
                {tx.account && ` · ${tx.account}`}
                {tx.fees !== undefined && tx.fees > 0 && (
                  <>
                    {" · "}
                    <span className="num">{formatMoney(tx.fees, currency)}</span> fees
                  </>
                )}
                {tx.note && ` · ${tx.note}`}
              </p>
            </div>

            <span className="num shrink-0 text-caption font-medium text-ink">
              {formatMoney(total, currency)}
            </span>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-stone"
                  aria-label={`Actions for ${tx.side} ${tx.symbol} on ${formatShortDate(Date.parse(tx.date))}`}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onEdit(tx)}>
                  <Pencil />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => onDelete(tx)}>
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        );
      })}
    </ul>
  );
}
