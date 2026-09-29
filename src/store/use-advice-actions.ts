"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FindingKind } from "@/lib/api/client";

/**
 * What the user has already done about a finding.
 *
 * **Keyed by kind, symbol and action, not by assessment id.** The engine
 * re-runs on every request and stamps each result with the current time, so
 * there is no stable identity to key on — dismissing a call and keying it by
 * `createdAt` would let the identical call reappear sixty seconds later.
 *
 * The pairing that matters is *what ember is telling you to do about which
 * instrument*. If the read later flips from Sell to Buy, that is a genuinely
 * different call and it should come back.
 *
 * **Kind joined the key in phase 15.** A risk and an opportunity can be live
 * on the same symbol at once — a position over its concentration cap while the
 * read still says accumulate — and with `symbol` alone, dismissing one
 * silently dismissed the other. The two are different decisions addressed to
 * the same instrument, which is precisely the case a shared key cannot
 * represent.
 *
 * Handling also expires. `until` is the end of the call's own execution
 * window, or a day for a risk that has none — after that the situation is new
 * and the user deserves to be asked again.
 */

export type HandledKind = "executed" | "dismissed";

export interface HandledCall {
  kind: HandledKind;
  /** The action or trigger that was handled. A different one resurfaces it. */
  signature: string;
  at: number;
  /** Epoch millis after which this stops suppressing anything. */
  until: number;
}

/** The store's key, and a finding's `id`. One derivation, used by both. */
export function findingId(kind: FindingKind, symbol: string): string {
  return `${kind}:${symbol}`;
}

interface AdviceActionsState {
  handled: Record<string, HandledCall>;

  markHandled: (
    id: string,
    entry: Omit<HandledCall, "at"> & { at?: number },
  ) => void;
  clear: (id: string) => void;
  clearAll: () => void;
}

export const useAdviceActions = create<AdviceActionsState>()(
  persist(
    (set) => ({
      handled: {},

      markHandled: (id, entry) =>
        set((s) => ({
          handled: { ...s.handled, [id]: { ...entry, at: entry.at ?? Date.now() } },
        })),

      clear: (id) =>
        set((s) => {
          if (!(id in s.handled)) return s;
          const next = { ...s.handled };
          delete next[id];
          return { handled: next };
        }),

      clearAll: () => set({ handled: {} }),
    }),
    {
      name: "ember:advice-actions",
      version: 2,
      /**
       * v1 keyed on the bare symbol and carried `action` rather than
       * `signature`. Dropped rather than translated: every v1 entry is a
       * dismissal or an execution of a call whose window has long closed, so
       * migrating them would restore suppressions that had already expired.
       */
      migrate: () => ({ handled: {} }),
    },
  ),
);

/**
 * Whether a live finding should still be shown as open.
 *
 * Returns the handling only when it genuinely applies to *this* one — same
 * finding id, same action or trigger, and not yet expired.
 */
export function handlingFor(
  handled: Record<string, HandledCall>,
  id: string,
  signature: string,
  now: number,
): HandledCall | null {
  const entry = handled[id];
  if (!entry) return null;
  if (entry.signature !== signature) return null;
  if (now > entry.until) return null;
  return entry;
}
