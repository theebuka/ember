"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Which findings ember has already alerted about.
 *
 * Separate from `use-advice-actions` on purpose. That store records what the
 * *user* did — executed, dismissed. This one records what *ember* did, and the
 * two answer different questions: a call the user hasn't touched can still be
 * one we've already interrupted them about.
 *
 * The keying is deliberately identical to that store's — the finding id, which
 * is `kind:symbol`, plus a signature that expires — because the reasoning
 * behind decision 026 applies unchanged: there is no stable assessment id, and
 * a read that flips from Sell to Buy is a new call that deserves a new alert.
 *
 * **Kind is in the key, and it has to be.** Before phase 15 this keyed on
 * symbol alone, which was harmless while opportunities were the only thing
 * alerted about. The moment risk alerts exist, a stop breach on NVDA and a
 * buy signal on NVDA are two different interruptions about the same
 * instrument, and one would silently overwrite the other in the log — meaning
 * whichever fired second was never delivered.
 *
 * It has to persist. Without it a page refresh — or a tab restoring after a
 * crash — re-fires every alert still live, which is the fastest way to teach
 * someone to switch notifications off.
 */

export interface AlertRecord {
  /** The action or risk trigger that was alerted about. A different one re-alerts. */
  signature: string;
  at: number;
  /** Epoch millis after which this stops suppressing anything. */
  until: number;
}

interface AlertLogState {
  notified: Record<string, AlertRecord>;

  /** Records one or many at once; alerts are planned and fired in batches. */
  record: (
    entries: readonly { id: string; signature: string; until: number }[],
    at?: number,
  ) => void;
  clearAll: () => void;
}

export const useAlertLog = create<AlertLogState>()(
  persist(
    (set) => ({
      notified: {},

      record: (entries, at = Date.now()) =>
        set((s) => {
          if (entries.length === 0) return s;
          const next = { ...s.notified };
          for (const entry of entries) {
            next[entry.id] = { signature: entry.signature, at, until: entry.until };
          }
          return { notified: next };
        }),

      clearAll: () => set({ notified: {} }),
    }),
    {
      name: "ember:alert-log",
      version: 2,
      /**
       * v1 keyed on the bare symbol and stored `action`. Dropped rather than
       * translated: every v1 entry suppresses an alert about a window that has
       * since closed, so carrying them forward can only suppress something the
       * user should now be told about.
       */
      migrate: () => ({ notified: {} }),
    },
  ),
);

/** Whether this exact finding has already been alerted about, and still counts. */
export function alertedFor(
  notified: Record<string, AlertRecord>,
  id: string,
  signature: string,
  now: number,
): boolean {
  const entry = notified[id];
  if (!entry) return false;
  if (entry.signature !== signature) return false;
  return now <= entry.until;
}
