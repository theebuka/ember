"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePlan } from "@/hooks/use-plan";
import { canUse } from "@/lib/plan";
import { useSession } from "@/hooks/use-session";
import { useHydrated } from "@/hooks/use-hydrated";
import { supabaseBrowser } from "@/lib/supabase/client";
import { pickNewer, reconcileTransactions } from "@/lib/sync/merge";
import { toRemote, toRow, type TransactionRow } from "@/lib/sync/rows";
import { readOwner, writeOwner } from "@/lib/sync/owner";
import { readStampedAt, writeStampedAt } from "@/lib/sync/stamp";
import { usePortfolio } from "@/store/use-portfolio";
import { useProfile } from "@/store/use-profile";
import { usePreferences } from "@/store/use-preferences";
import { useWatchlist } from "@/store/use-watchlist";
import { useSyncState, type Resolution, type SyncStatus } from "@/store/use-sync-state";

export type { SyncStatus } from "@/store/use-sync-state";

/**
 * Keeping the ledger, the preferences and the watchlist on more than one
 * device.
 *
 * **Local-first, and that is not a hedge.** `localStorage` stays the thing the
 * app reads from — every screen, every derivation, every render, exactly as
 * before. This pushes and pulls around it. So the app is fully usable offline,
 * fully usable signed out, and fully usable with no Supabase project at all
 * (`config.ts`), and none of those are degraded modes with a spinner in them.
 *
 * **It runs on sign-in and on change, not on a timer.** A poll would burn a
 * free-tier project's request budget doing nothing for a user who is reading
 * rather than typing, and the interesting events here are both things the
 * client already knows about: a session arriving, and the ledger changing. A
 * change is debounced, because logging a CSV import is one intent and forty
 * writes.
 *
 * **What it does not do is resolve two people editing at once.** There are no
 * two people — every table is single-user behind RLS. What it resolves is one
 * person on two devices, which last-write-wins per row handles correctly for
 * everything except the same trade edited in both places between syncs. That
 * case loses one edit, says so, and is the reason `merge.ts` is a tested pure
 * function rather than a few lines inlined here.
 */
export function useSync(): void {
  const hydrated = useHydrated();
  const { user, ready, available } = useSession();

  const transactions = usePortfolio((s) => s.transactions);
  const tombstones = usePortfolio((s) => s.tombstones);
  const pending = useSyncState((s) => s.pending);

  const runningRef = useRef(false);

  const run = useCallback(
    async (resolution?: Resolution) => {
      const supabase = await supabaseBrowser();
      if (!supabase || !user) return;
      // Overlapping runs would push the same rows twice and, worse, could apply
      // an older pull over a newer one.
      if (runningRef.current) return;

      const state = useSyncState.getState();

      /**
       * **A device holding another account's data stops here and asks.**
       *
       * See `lib/sync/owner.ts`. Nothing is read, written or merged until the
       * person at the keyboard says which way it goes — the settings row puts
       * the question and `resolve()` re-enters this function with the answer.
       */
      const owner = readOwner();
      if (owner !== null && owner !== user.id && !resolution) {
        state.set({ status: "held" });
        return;
      }

      runningRef.current = true;
      state.set({ status: "syncing" });
      const replacing = resolution === "replace";

      try {
        /* ── The ledger ────────────────────────────────────────────────── */

        const portfolio = usePortfolio.getState();

        /**
         * **A sample book never leaves the device.** ADR 0008 makes it opt-in
         * and labelled, and the label is a local flag — so uploading it put
         * fabricated trades into a real account, where every other device
         * pulled them in as ordinary rows with nothing to say they were not
         * real. Skipped in both directions: pulling a real ledger into a
         * sample book would produce a book that is neither. Logging a trade of
         * your own clears the flag (the store's rule), and the book syncs from
         * then on.
         *
         * Except when replacing, which is the one case that must pull: the
         * person asked for this account's data on this device.
         */
        if (!portfolio.isSample || replacing) {
          const { data: rows, error } = await supabase
            .from("transactions")
            .select("*")
            .eq("user_id", user.id);
          if (error) throw error;

          /**
           * Replacing reconciles against an *empty* device, so the result is
           * exactly the account's live rows and nothing is pushed. The local
           * book is only dropped here, after the read has succeeded — a
           * replace that failed on the network must not have already thrown
           * away what was on the device.
           */
          const result = reconcileTransactions({
            local: replacing ? [] : portfolio.transactions,
            remote: (rows as TransactionRow[]).map(toRemote),
            tombstones: replacing ? [] : portfolio.tombstones,
          });

          if (result.push.length > 0) {
            const { error: pushError } = await supabase
              .from("transactions")
              .upsert(result.push.map((tx) => toRow(tx, user.id)));
            if (pushError) throw pushError;
          }

          if (result.publishDeletes.length > 0) {
            // A soft delete, and it has to be an update rather than a `delete()`:
            // a row that is simply gone is one another device will push straight
            // back, because it cannot tell "deleted" from "not told about yet".
            const { error: deleteError } = await supabase
              .from("transactions")
              .update({ deleted_at: new Date().toISOString() })
              .in(
                "id",
                result.publishDeletes.map((t) => t.id),
              );
            if (deleteError) throw deleteError;
          }

          if (replacing) {
            // Wholesale: this device's book, its sample flag and its pending
            // deletions all belonged to the other account.
            usePortfolio.setState({
              transactions: [...result.next],
              tombstones: [],
              isSample: false,
            });
          } else {
            const current = usePortfolio.getState();
            // Only write back when something actually differs, or every sync
            // notifies every subscriber and re-renders the whole app for nothing.
            if (!sameLedger(current.transactions, result.next)) {
              current.applySynced(result.next);
            }
            const settled = [
              ...result.settledTombstones,
              ...result.publishDeletes.map((t) => t.id),
            ];
            if (settled.length > 0) current.forgetTombstones(settled);
          }
        }

        /* ── The single-row documents ──────────────────────────────────────
           One row each, so the merge is `pickNewer` and nothing more.

           **Each one is allowed to fail on its own.** They were awaited in a
           chain, so a project that had run migration 0001 but not 0002 — which
           is exactly the state a real project was found in — threw on the
           profile's `select` and took the preferences and watchlist down with
           it, reporting a total failure of a sync that had already written the
           ledger successfully. A partial sync is a normal condition during a
           migration window, and the honest report is "some of it didn't land",
           not "none of it did". */
        const documents = await Promise.allSettled([
          syncProfile(supabase, user.id, replacing),
          syncPreferences(supabase, user.id, replacing),
          syncWatchlist(supabase, user.id, replacing),
        ]);
        const partial = documents.some((result) => result.status === "rejected");

        /**
         * Ownership is claimed only once everything landed. A replace whose
         * profile read failed would otherwise mark the device as settled while
         * the other account's name was still on it — and the next ordinary run
         * would push that name into this account.
         */
        if (!partial) writeOwner(user.id);

        state.set({
          lastSyncedAt: Date.now(),
          status: partial ? (owner !== null && owner !== user.id ? "held" : "error") : "idle",
        });
      } catch {
        // Deliberately quiet. A failed sync is not a failed session: everything
        // the user can see still works, and the local copy is untouched. The
        // status is surfaced in settings rather than as a toast, because an
        // error toast for a background process the user did not ask for is
        // noise they cannot act on.
        state.set({ status: owner !== null && owner !== user.id ? "held" : "error" });
      } finally {
        runningRef.current = false;
      }
    },
    [user],
  );

  // Sync is part of Pro (decision 288). A free account signs in to pay, and
  // its data stays on the device it was entered on. The server cannot refuse
  // these writes yet — RLS reads no plan — so this is the gate for now (§8).
  const { plan, ready: planReady } = usePlan();
  const engaged =
    hydrated && ready && available && user !== null && planReady && canUse("sync", plan);

  /**
   * One effect, one timer, for both reasons to sync.
   *
   * Sign-in and "the ledger changed" were two effects to begin with, and
   * collapsing them fixes two things at once. They could both fire in the same
   * commit — signing in *is* a state change — so the run guard was doing real
   * work rather than acting as a backstop. And starting a run synchronously
   * from an effect body sets state synchronously from an effect body, which is
   * a cascading render; going through the timer means the status moves in a
   * callback, where it belongs.
   *
   * The delay is long enough that a CSV import — forty writes in a few hundred
   * milliseconds — syncs once rather than forty times, and short enough that a
   * single logged trade is on the server before the user has finished reading
   * the toast. Sign-out needs no effect at all: `engaged` simply goes false.
   */
  useEffect(() => {
    if (!engaged || pending) return;
    const timer = setTimeout(() => void run(), 800);
    return () => clearTimeout(timer);
  }, [engaged, pending, transactions, tombstones, run]);

  /** The answer to a held sync, from the settings row. Runs once and clears. */
  useEffect(() => {
    if (!engaged || !pending) return;
    const timer = setTimeout(() => {
      useSyncState.getState().set({ pending: null });
      void run(pending);
    }, 0);
    return () => clearTimeout(timer);
  }, [engaged, pending, run]);
}

/**
 * Sync's status for anything that only wants to read it.
 *
 * Deliberately not `useSync()`: that hook *runs* sync, and it used to be called
 * from the settings row just to read these two values — a second runner, with
 * its own run guard, reconciling the same ledger at the same time.
 */
export function useSyncStatus(): { status: SyncStatus; lastSyncedAt: number | null } {
  const hydrated = useHydrated();
  const { user, ready, available } = useSession();
  const status = useSyncState((s) => s.status);
  const lastSyncedAt = useSyncState((s) => s.lastSyncedAt);
  const engaged = hydrated && ready && available && user !== null;
  return { status: engaged ? status : "off", lastSyncedAt };
}

/* ── Single-row documents ───────────────────────────────────────────────── */

type Client = NonNullable<Awaited<ReturnType<typeof supabaseBrowser>>>;

/**
 * `replacing` makes the account's copy win outright. The device's own stamp is
 * read as the beginning of time, so any row the server has beats it — which is
 * what "use this account's data" means — and where the server has none, the
 * device's value is kept and becomes the account's first.
 */
async function syncProfile(supabase: Client, userId: string, replacing: boolean) {
  const store = useProfile.getState();
  const localAt = replacing ? 0 : readStampedAt("ember:profile");

  // Checked rather than discarded. A project part-way through a migration —
  // 0001 applied, 0002 not — answers this with "column does not exist", and
  // swallowing that means the profile silently never syncs while the settings
  // screen reports everything fine.
  const { data, error } = await supabase
    .from("profiles")
    .select("preferred_name, first_name, last_name, country, timezone, updated_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;

  const local = {
    preferredName: store.preferredName,
    firstName: store.firstName,
    lastName: store.lastName,
    country: store.country,
    timezone: store.timezone,
  };

  const chosen = pickNewer({
    local,
    localAt,
    remote: data
      ? {
          value: {
            preferredName: (data.preferred_name as string | null) ?? null,
            firstName: (data.first_name as string | null) ?? null,
            lastName: (data.last_name as string | null) ?? null,
            country: (data.country as string | null) ?? null,
            timezone: (data.timezone as string | null) ?? null,
          },
          at: Date.parse(data.updated_at as string),
        }
      : null,
  });

  if (chosen.source === "remote") {
    store.set(chosen.value);
    // Holding a version is not editing it. See `writeStampedAt`.
    if (data) writeStampedAt("ember:profile", Date.parse(data.updated_at as string));
    return;
  }

  // `id`, not `user_id` — the profile row *is* the user, keyed on
  // `auth.users(id)` by the trigger in 0001. Getting this wrong inserts an
  // orphan rather than updating the row the trigger already made.
  const { error: writeError } = await supabase.from("profiles").upsert({
    id: userId,
    preferred_name: chosen.value.preferredName,
    first_name: chosen.value.firstName,
    last_name: chosen.value.lastName,
    country: chosen.value.country,
    timezone: chosen.value.timezone,
    /**
     * The client's own time, like every other synced table (decision 103).
     * `profiles` was the one exception, stamped by a trigger on arrival, from
     * when nothing merged it — and phase 20 started merging it with
     * `pickNewer` without removing the trigger. So a device that synced late
     * always won, however old its edit. `0008` drops the trigger; until it is
     * applied the trigger overwrites this, which is the old behaviour and no
     * worse.
     */
    updated_at: new Date(localAt || Date.now()).toISOString(),
  });
  if (writeError) throw writeError;
}

async function syncPreferences(supabase: Client, userId: string, replacing: boolean) {
  const store = usePreferences.getState();
  const localAt = replacing ? 0 : readStampedAt("ember:preferences");

  const { data, error } = await supabase
    .from("preferences")
    .select("data, version, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;

  const chosen = pickNewer({
    local: snapshotPreferences(store),
    localAt,
    remote: data
      ? {
          value: data.data as ReturnType<typeof snapshotPreferences>,
          at: Date.parse(data.updated_at),
        }
      : null,
  });

  if (chosen.source === "remote") {
    applyPreferences(chosen.value);
    if (data) writeStampedAt("ember:preferences", Date.parse(data.updated_at));
    return;
  }

  const { error: writeError } = await supabase.from("preferences").upsert({
    user_id: userId,
    version: 3,
    data: chosen.value,
    updated_at: new Date(localAt || Date.now()).toISOString(),
  });
  if (writeError) throw writeError;
}

async function syncWatchlist(supabase: Client, userId: string, replacing: boolean) {
  const store = useWatchlist.getState();
  const localAt = replacing ? 0 : readStampedAt("ember:watchlist");

  const { data, error } = await supabase
    .from("watchlist")
    .select("symbols, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;

  const chosen = pickNewer<string[] | null>({
    local: store.symbols === null ? null : [...store.symbols],
    localAt,
    // Wrapped, so a stored `null` — "following everything", decision 023 —
    // is a value the server holds rather than a row it doesn't have.
    remote: data
      ? { value: (data.symbols as string[] | null) ?? null, at: Date.parse(data.updated_at) }
      : null,
  });

  if (chosen.source === "remote") {
    store.setSymbols(chosen.value);
    if (data) writeStampedAt("ember:watchlist", Date.parse(data.updated_at));
    return;
  }

  const { error: writeError } = await supabase.from("watchlist").upsert({
    user_id: userId,
    // `null` means "following everything" and must stay null on the wire —
    // materialising the universe into a list here would put it in two places
    // and reintroduce exactly the bug decision 023 exists to prevent.
    symbols: chosen.value,
    updated_at: new Date(localAt || Date.now()).toISOString(),
  });
  if (writeError) throw writeError;
}

function snapshotPreferences(state: ReturnType<typeof usePreferences.getState>) {
  return {
    riskProfile: state.riskProfile,
    markets: state.markets,
    baseCurrency: state.baseCurrency,
    notifications: state.notifications,
    // `sidebarCollapsed` and `hasOnboarded` are deliberately absent. They are
    // properties of *this device* — a collapsed rail on a laptop says nothing
    // about a phone, and syncing `hasOnboarded` would skip setup on a device
    // that has never seen it, including the cookie write that setup exists to
    // perform (ADR 0014).
  };
}

function applyPreferences(prefs: ReturnType<typeof snapshotPreferences>) {
  const store = usePreferences.getState();
  if (prefs.riskProfile) store.setRiskProfile(prefs.riskProfile);
  if (prefs.baseCurrency) store.setBaseCurrency(prefs.baseCurrency);
  if (prefs.notifications) {
    for (const [key, value] of Object.entries(prefs.notifications)) {
      store.setNotification(key as keyof typeof prefs.notifications, value);
    }
  }
  if (prefs.markets) {
    for (const [market, on] of Object.entries(prefs.markets)) {
      const current = usePreferences.getState().markets;
      if (current[market as keyof typeof current] !== on) {
        store.toggleMarket(market as keyof typeof current);
      }
    }
  }
}

/** Cheap structural equality — same ids, same stamps, same order. */
function sameLedger(
  a: readonly { id: string; updatedAt?: number }[],
  b: readonly { id: string; updatedAt?: number }[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, i) => row.id === b[i].id && row.updatedAt === b[i].updatedAt);
}
