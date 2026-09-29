"use client";

import { create } from "zustand";

export type SyncStatus = "off" | "idle" | "syncing" | "error" | "held";

/**
 * What to do with local data that belongs to a different account.
 *
 *   `replace` — this device takes the signed-in account's data; what was here is
 *               dropped from this device (it is still in the account it came
 *               from, which is where it was last synced).
 *   `merge`   — the local data is added to the signed-in account. The old
 *               behaviour, now something a person chooses rather than suffers.
 */
export type Resolution = "replace" | "merge";

interface SyncState {
  /** What the last run found. `off` is derived by the reader, never stored. */
  status: Exclude<SyncStatus, "off">;
  lastSyncedAt: number | null;
  /** Set by the settings row; consumed by the one runner in `AppShell`. */
  pending: Resolution | null;
  set: (patch: Partial<Pick<SyncState, "status" | "lastSyncedAt" | "pending">>) => void;
  resolve: (resolution: Resolution) => void;
}

/**
 * Sync's outcome, shared, so exactly one component runs it.
 *
 * `useSync()` was called by `AppShell` *and* by the Account settings row to read
 * its status — and a hook that syncs is a hook that syncs wherever it is called.
 * On the settings screen two runners with two run guards reconciled the same
 * ledger concurrently, which is how an older pull gets applied over a newer one.
 * One runner now writes here; anything that only wants to know reads here.
 */
export const useSyncState = create<SyncState>()((set) => ({
  status: "idle",
  lastSyncedAt: null,
  pending: null,
  set: (patch) => set(patch),
  resolve: (resolution) => set({ pending: resolution }),
}));
