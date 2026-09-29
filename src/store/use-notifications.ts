"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StoredAlert } from "@/lib/notifications/inbox";

/**
 * What ember has actually told you, kept so you can go back and read it.
 *
 * **A third store, and it is not a duplicate of the other two.** They already
 * split along a real line: `use-advice-actions` records what the *user* did
 * (executed, dismissed) and `use-alert-log` records what *ember* did, keyed so
 * it can suppress a repeat. Neither is an inbox. The alert log stores a
 * signature and an expiry — enough to answer "have we said this already",
 * nothing like enough to answer "what did you say".
 *
 * So this stores the delivered message itself, written by the watcher at the
 * moment it fires. That ordering matters: the inbox is a record of what was
 * *sent*, not a re-derivation of what would be due now. A re-derivation would
 * invent notifications that were never delivered — the watcher only runs while
 * ember is open — and an inbox full of alerts nobody ever received is worse
 * than an empty one.
 *
 * **It is capped.** CLAUDE.md §8 has carried "nothing prunes the alert log"
 * since phase 9, which is defensible there because entries are overwritten in
 * place, one per `kind:symbol`, so it cannot outgrow twice the universe. This
 * one appends, so the same argument does not hold and it would grow forever.
 * 200 is roughly two months of a busy book.
 */

const LIMIT = 200;

interface NotificationsState {
  entries: StoredAlert[];
  /** Epoch millis of the last visit to the inbox. Everything after it is unread. */
  readAt: number;
  /**
   * Ids of pinned broadcasts this device has dismissed from the banner on Home.
   *
   * **By id, not by a single "last dismissed" timestamp**, and not by clearing a
   * flag. A timestamp would silently swallow the next pinned notice for anyone
   * who dismissed one a moment before it was published, and the whole reason a
   * broadcast is pinned is that ember decided it could not wait.
   *
   * Dismissing is also **not** reading: the notice stays in the notification
   * centre, unread, and still counts toward the badge. Closing a banner is
   * "not now, and not here", which is a different sentence from "I have read
   * this" — and conflating them would make the banner a way to lose a message.
   *
   * Uncapped, unlike `entries`, because it grows by one per pinned broadcast
   * ember ever sends. A product that pins often enough for this to matter has a
   * worse problem than a long array.
   */
  dismissed: string[];

  add: (alert: StoredAlert) => void;
  markRead: (at?: number) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useNotifications = create<NotificationsState>()(
  persist(
    (set) => ({
      entries: [],
      readAt: 0,
      dismissed: [],

      add: (alert) =>
        set((s) => {
          // Same guard as the watcher's in-memory set, but this one survives a
          // reload: an alert re-delivered after a refresh would otherwise
          // appear twice in the history even though it interrupted once.
          if (s.entries.some((entry) => entry.id === alert.id)) return s;
          return { entries: [alert, ...s.entries].slice(0, LIMIT) };
        }),

      markRead: (at = Date.now()) => set({ readAt: at }),

      dismiss: (id) =>
        set((s) =>
          s.dismissed.includes(id) ? s : { dismissed: [...s.dismissed, id] },
        ),

      // `dismissed` deliberately survives Clear. Clear empties the *history* —
      // the alerts ember delivered — and a banner somebody closed is not one of
      // those. Resetting it here would republish every pinned broadcast ember
      // has ever sent to anyone who tidied their inbox.
      clear: () => set({ entries: [], readAt: Date.now() }),
    }),
    { name: "ember:notifications", version: 1 },
  ),
);
