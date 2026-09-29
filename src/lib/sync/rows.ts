import type { Transaction } from "@/lib/api/types";
import type { RemoteTransaction } from "./merge";

/**
 * The wire shape, and the two functions that cross it.
 *
 * Kept apart from `merge.ts` so the merge stays a pure function of two plain
 * arrays and can be tested without a database schema in scope. This file is
 * the only place that knows Postgres uses `snake_case` and that `trade_date`
 * is not called `date`.
 */

export interface TransactionRow {
  id: string;
  user_id: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fees: number;
  trade_date: string;
  account: string | null;
  note: string | null;
  updated_at: string;
  deleted_at: string | null;
}

export function toRemote(row: TransactionRow): RemoteTransaction {
  return {
    id: row.id,
    symbol: row.symbol,
    side: row.side,
    quantity: row.quantity,
    price: row.price,
    fees: row.fees,
    date: row.trade_date,
    // Postgres returns null for an absent text column; the client type wants
    // the key gone rather than present-and-null, or `account: null` starts
    // showing up in the transaction form as the string "null".
    ...(row.account === null ? {} : { account: row.account }),
    ...(row.note === null ? {} : { note: row.note }),
    updatedAt: Date.parse(row.updated_at),
    deletedAt: row.deleted_at === null ? null : Date.parse(row.deleted_at),
  };
}

export function toRow(tx: Transaction, userId: string) {
  return {
    id: tx.id,
    user_id: userId,
    symbol: tx.symbol,
    side: tx.side,
    quantity: tx.quantity,
    price: tx.price,
    fees: tx.fees ?? 0,
    trade_date: tx.date,
    account: tx.account ?? null,
    note: tx.note ?? null,
    // Sent explicitly rather than left to the column default, because the
    // merge already decided this row wins on the strength of *this* timestamp.
    // Letting the database stamp `now()` would move it forward and could make
    // a row the user edited on another device look older than it is.
    updated_at: new Date(tx.updatedAt ?? Date.now()).toISOString(),
    deleted_at: null,
  };
}
