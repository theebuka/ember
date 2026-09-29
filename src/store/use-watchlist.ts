"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { stampOnChange } from "@/lib/sync/stamp";

/**
 * Which instruments the user is following.
 *
 * `null` means "everything", and it is the default. The alternative — seeding
 * the store with a hardcoded symbol list — puts the universe in two places and
 * means adding an instrument to `lib/market/universe.ts` silently fails to
 * appear for anyone who has already opened the app. The sentinel keeps one
 * source of truth and makes "I haven't curated this yet" a state the UI can
 * read rather than infer.
 *
 * The universe is passed into the mutators rather than imported, because the
 * store must not reach around `lib/api/client` for data (CLAUDE.md §4) — and
 * the first removal is the moment the sentinel has to be materialised into a
 * real list.
 */

interface WatchlistState {
  symbols: string[] | null;

  add: (symbol: string) => void;
  /** `universe` is only read when the list is still the "everything" default. */
  remove: (symbol: string, universe: readonly string[]) => void;
  toggle: (symbol: string, universe: readonly string[]) => void;
  /**
   * Restore an exact previous value, sentinel included.
   *
   * This is what undo uses, rather than applying the inverse operation.
   * Undoing a removal with `add` would leave a materialised list where the
   * "everything" sentinel had been, and the user would silently stop seeing
   * instruments added to the universe later — the precise failure the
   * sentinel exists to prevent.
   */
  setSymbols: (symbols: string[] | null) => void;
  /** Back to following the whole universe. */
  reset: () => void;
}

export const useWatchlist = create<WatchlistState>()(
  persist(
    (set) => ({
      symbols: null,

      add: (symbol) =>
        set((s) => {
          if (s.symbols === null) return s; // already following everything
          if (s.symbols.includes(symbol)) return s;
          return { symbols: [...s.symbols, symbol] };
        }),

      remove: (symbol, universe) =>
        set((s) => ({
          symbols: (s.symbols ?? [...universe]).filter((x) => x !== symbol),
        })),

      toggle: (symbol, universe) =>
        set((s) => {
          const current = s.symbols ?? [...universe];
          return {
            symbols: current.includes(symbol)
              ? current.filter((x) => x !== symbol)
              : [...current, symbol],
          };
        }),

      setSymbols: (symbols) => set({ symbols }),

      reset: () => set({ symbols: null }),
    }),
    { name: "ember:watchlist", version: 1 },
  ),
);

stampOnChange(useWatchlist, "ember:watchlist");

/**
 * The watched symbols, resolved against the universe.
 *
 * Also drops anything no longer in the universe — a persisted list can outlive
 * a delisting or a rename, and a watchlist row with no instrument behind it
 * would render as a blank line the user can't remove.
 */
export function resolveWatchlist(
  symbols: string[] | null,
  universe: readonly string[],
): string[] {
  if (symbols === null) return [...universe];
  const known = new Set(universe);
  return symbols.filter((s) => known.has(s));
}
