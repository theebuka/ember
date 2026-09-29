"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Transaction } from "@/lib/api/types";
import type { Tombstone } from "@/lib/sync/merge";

/**
 * The transaction log — the only persisted portfolio state in the app.
 *
 * There is deliberately no `holdings` array here. Quantity, cost basis and
 * P&L are computed by `lib/portfolio/derive.ts` on every render, from this
 * log. It is the invariant in CLAUDE.md §5 and the reason the numbers can
 * never contradict each other.
 *
 * Local storage is the backend for now. The shape is exactly what a
 * `transactions` table will hold, so the migration is an upload, not a
 * redesign.
 */

interface PortfolioState {
  transactions: Transaction[];
  /** True once the user has loaded the sample book, so the UI can say so. */
  isSample: boolean;
  /**
   * Deletions waiting to be published.
   *
   * A row that is simply gone is indistinguishable from one this device has
   * not been told about yet, so without these a sync would push every deleted
   * trade straight back. Dropped by `forgetTombstones` once the server records
   * the deletion. Inert — and empty — for anyone who never signs in.
   */
  tombstones: Tombstone[];

  add: (tx: Omit<Transaction, "id">) => string;
  /** Bulk insert for CSV import. Returns the new ids so it can be undone. */
  addMany: (txs: Omit<Transaction, "id">[]) => string[];
  update: (id: string, patch: Partial<Omit<Transaction, "id">>) => void;
  remove: (id: string) => Transaction | null;
  removeMany: (ids: readonly string[]) => void;
  /** Puts a removed transaction back where it was — the undo half of a delete. */
  restore: (tx: Transaction) => void;
  /**
   * Swap the whole log, ids and sample flag intact.
   *
   * The undo half of "clear my transactions". Re-adding the rows would reissue
   * every id and clear the sample flag, which is the inverse *operation* and
   * not the prior *state* — the distinction CLAUDE.md decision 025 exists for.
   */
  replaceAll: (transactions: readonly Transaction[], isSample: boolean) => void;
  loadSample: (transactions: Omit<Transaction, "id">[]) => void;
  /**
   * Write what a sync settled on, exactly as settled.
   *
   * **Not `replaceAll`, which re-stamps every row as edited now.** That is right
   * for an undo — the restored state has to win — and it was quietly wrong here:
   * a device that merely *pulled* a trade stamped it newer than the edit it
   * pulled, pushed it back on the next run, and so a genuinely later edit made
   * offline on another device lost to a reflection of an older one. Last-write-
   * wins only works while `updatedAt` means *when somebody typed it*.
   *
   * No tombstones either: rows the merge dropped were deleted elsewhere, and
   * entombing them would publish deletions this device never made.
   */
  applySynced: (transactions: readonly Transaction[]) => void;
  clear: () => void;
  /** Drop deletions the server has acknowledged. Called only by the sync. */
  forgetTombstones: (ids: readonly string[]) => void;
}

function newId(): string {
  // `crypto.randomUUID` needs a secure context. It's there in every browser
  // this app targets, but a plain http:// LAN address during development is
  // not secure, and losing the ability to add a transaction there would be a
  // silly way to break the app.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Every write is stamped, and the stamp is sync metadata rather than a fact
 * about the trade.
 *
 * `date` is when the trade happened; this is when the row was last typed. The
 * merge in `lib/sync/merge.ts` resolves a conflict by comparing them, so a row
 * written without one can only ever lose — which is why this is applied in the
 * store rather than left to each call site to remember.
 */
const stamped = <T extends Transaction>(tx: T): T => ({ ...tx, updatedAt: Date.now() });

export const usePortfolio = create<PortfolioState>()(
  persist(
    (set) => ({
      transactions: [],
      isSample: false,
      tombstones: [],

      add: (tx) => {
        const id = newId();
        set((s) => ({
          transactions: [...s.transactions, stamped({ ...tx, id })],
          // Adding your own trade to a sample book makes it yours.
          isSample: false,
        }));
        return id;
      },

      addMany: (txs) => {
        const rows = txs.map((tx) => stamped({ ...tx, id: newId() }));
        set((s) => ({
          transactions: [...s.transactions, ...rows],
          isSample: false,
        }));
        return rows.map((r) => r.id);
      },

      removeMany: (ids) => {
        const drop = new Set(ids);
        set((s) => ({
          transactions: s.transactions.filter((t) => !drop.has(t.id)),
          tombstones: entomb(s.tombstones, [...drop]),
        }));
      },

      update: (id, patch) =>
        set((s) => ({
          transactions: s.transactions.map((t) =>
            t.id === id ? stamped({ ...t, ...patch }) : t,
          ),
        })),

      remove: (id) => {
        let removed: Transaction | null = null;
        set((s) => {
          removed = s.transactions.find((t) => t.id === id) ?? null;
          return {
            transactions: s.transactions.filter((t) => t.id !== id),
            tombstones: removed ? entomb(s.tombstones, [id]) : s.tombstones,
          };
        });
        return removed;
      },

      restore: (tx) =>
        set((s) =>
          s.transactions.some((t) => t.id === tx.id)
            ? s
            : {
                transactions: [...s.transactions, stamped(tx)],
                // Undo has to lift the tombstone as well as put the row back,
                // or the next sync deletes it again on the strength of a
                // deletion the user has already taken back.
                tombstones: s.tombstones.filter((t) => t.id !== tx.id),
              },
        ),

      replaceAll: (transactions, isSample) =>
        set((s) => {
          const kept = new Set(transactions.map((t) => t.id));
          return {
            transactions: transactions.map(stamped),
            isSample,
            // Everything this replaces is gone. Restoring a cleared ledger has
            // to un-delete the rows it brings back, and entomb the ones it
            // doesn't — the same two-sided reasoning as `restore`.
            tombstones: entomb(
              s.tombstones.filter((t) => !kept.has(t.id)),
              s.transactions.filter((t) => !kept.has(t.id)).map((t) => t.id),
            ),
          };
        }),

      loadSample: (transactions) =>
        set({
          transactions: transactions.map((tx) => stamped({ ...tx, id: newId() })),
          isSample: true,
        }),

      applySynced: (transactions) => set({ transactions: [...transactions] }),

      clear: () =>
        set((s) => ({
          transactions: [],
          isSample: false,
          tombstones: entomb(s.tombstones, s.transactions.map((t) => t.id)),
        })),

      forgetTombstones: (ids) =>
        set((s) => {
          if (ids.length === 0) return s;
          const drop = new Set(ids);
          return { tombstones: s.tombstones.filter((t) => !drop.has(t.id)) };
        }),
    }),
    {
      name: "ember:portfolio",
      version: 2,
      /**
       * v2 adds `tombstones`. Migrated rather than reset, obviously — this is
       * the one store in the app whose contents the user typed by hand.
       * Existing rows get no `updatedAt`, which the merge reads as the
       * beginning of time and resolves in favour of the server.
       */
      migrate: (persisted) => ({
        tombstones: [],
        ...(persisted as Partial<PortfolioState>),
      }) as PortfolioState,
    },
  ),
);

/**
 * Record deletions, newest wins, and keep the list from growing forever.
 *
 * A tombstone stops mattering once the server has been told, and the sync
 * drops those by id. This cap is the backstop for a device that never signs
 * in: without it, a user who imports and clears a CSV a few times accumulates
 * thousands of tombstones that will never be published to anything.
 */
const TOMBSTONE_LIMIT = 500;

function entomb(
  existing: readonly Tombstone[],
  ids: readonly string[],
): Tombstone[] {
  if (ids.length === 0) return [...existing];
  const at = Date.now();
  const added = new Set(ids);
  return [
    ...ids.map((id) => ({ id, at })),
    ...existing.filter((t) => !added.has(t.id)),
  ].slice(0, TOMBSTONE_LIMIT);
}
