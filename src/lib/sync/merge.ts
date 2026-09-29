import type { Transaction } from "@/lib/api/types";

/**
 * Reconciling a local ledger with a remote one.
 *
 * Pure, and tested, because this is the only code in ember that can silently
 * destroy something the user typed. Everything else recomputes from the
 * transaction log; this decides what the transaction log *is*.
 *
 * ── The model ──────────────────────────────────────────────────────────────
 *
 * **Last write wins, per row, with tombstones.** Not per document: a whole
 * -ledger LWW means logging a trade on your phone silently discards the three
 * you logged on your laptop this morning, and the loss is invisible because
 * the survivor looks perfectly coherent. Per row, the only thing a conflict
 * can lose is one edit to one trade.
 *
 * **Deletions are rows, not absences.** A device that has been offline cannot
 * tell "this trade was deleted" from "I haven't been told about this trade
 * yet" — and if it guesses the second, it pushes the row back up and the
 * deletion is undone. So a delete writes a tombstone locally and a
 * `deleted_at` remotely, and both are compared like any other write.
 *
 * **Ties go to remote.** They are vanishingly rare — a tie needs the same
 * millisecond — but the rule has to be deterministic or two devices can
 * disagree forever, each convinced it won. Remote is the durable copy, so it
 * is the one that gets the benefit.
 *
 * **A missing timestamp is the beginning of time.** Rows written before this
 * existed have no `updatedAt`. Treating them as oldest means the first sync
 * after signing in prefers anything the server already holds, which is the
 * safe direction: the server's copy came from a device that had already run
 * this code, and the undated row is by definition one nobody has touched
 * since.
 */

/** A row as it comes back from Postgres. */
export interface RemoteTransaction extends Transaction {
  updatedAt: number;
  /** Epoch millis, or null for a live row. */
  deletedAt: number | null;
}

/** A local deletion waiting to be published. */
export interface Tombstone {
  id: string;
  at: number;
}

export interface Reconciliation {
  /** What the local store should hold afterwards. */
  next: Transaction[];
  /** Rows the server needs — new locally, or edited more recently here. */
  push: Transaction[];
  /** Deletions the server hasn't been told about. */
  publishDeletes: Tombstone[];
  /**
   * Tombstones that can be forgotten, because the server already records the
   * deletion. Without this the list grows forever, and a device that syncs
   * daily for a year is republishing a year of deletions on every pass.
   */
  settledTombstones: string[];
}

const timeOf = (tx: Transaction): number => tx.updatedAt ?? 0;

export function reconcileTransactions({
  local,
  remote,
  tombstones,
}: {
  local: readonly Transaction[];
  remote: readonly RemoteTransaction[];
  tombstones: readonly Tombstone[];
}): Reconciliation {
  const localById = new Map(local.map((tx) => [tx.id, tx]));
  const remoteById = new Map(remote.map((tx) => [tx.id, tx]));
  const tombById = new Map(tombstones.map((t) => [t.id, t]));

  const ids = new Set([...localById.keys(), ...remoteById.keys(), ...tombById.keys()]);

  const next: Transaction[] = [];
  const push: Transaction[] = [];
  const publishDeletes: Tombstone[] = [];
  const settledTombstones: string[] = [];

  for (const id of ids) {
    const here = localById.get(id);
    const there = remoteById.get(id);
    const tomb = tombById.get(id);

    // A tombstone supersedes the local row it refers to — the row is only
    // still in `local` if a caller kept it, which nothing does, but the rule
    // has to be stated or the two could disagree.
    const localAt = tomb ? tomb.at : here ? timeOf(here) : -1;
    const localDeleted = tomb !== undefined;

    const remoteAt = there ? there.updatedAt : -1;
    const remoteDeleted = there?.deletedAt != null;

    // Nothing on either side. Only reachable through a stale tombstone for a
    // row the server has never heard of — drop it, there is nothing to tell.
    if (localAt < 0 && remoteAt < 0) {
      if (tomb) settledTombstones.push(id);
      continue;
    }

    const localWins = localAt > remoteAt;

    if (localWins) {
      if (localDeleted) {
        // The server still has it, or has an older version of it.
        if (there && !remoteDeleted) publishDeletes.push(tomb!);
        else if (there && remoteDeleted) settledTombstones.push(id);
        else settledTombstones.push(id);
        continue;
      }
      if (here) {
        next.push(here);
        if (!there || there.updatedAt !== timeOf(here) || remoteDeleted) push.push(here);
      }
      continue;
    }

    // Remote wins, including ties.
    if (remoteDeleted) {
      if (tomb) settledTombstones.push(id);
      continue;
    }
    if (there) {
      next.push(stripRemote(there));
      // A tombstone that lost is a deletion the user has already had undone
      // by a newer edit elsewhere. Forget it, or it will be republished on
      // every pass and eventually win a tie.
      if (tomb) settledTombstones.push(id);
    }
  }

  // Sorted by trade date, then id, so the local array has a stable order
  // regardless of which side each row arrived from. Two devices that have
  // converged should hold byte-identical state, not the same set in a
  // different order — otherwise every sync looks like a change.
  next.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));

  return { next, push, publishDeletes, settledTombstones };
}

/** Drop the columns that only exist on the wire. */
function stripRemote(row: RemoteTransaction): Transaction {
  const rest: Partial<RemoteTransaction> = { ...row };
  delete rest.deletedAt;
  return rest as Transaction;
}

/**
 * Which copy of a single-row document to keep — preferences, the watchlist.
 *
 * The same rule, without the per-row part, because there is only one row. It
 * is a separate function rather than a special case of the above so that
 * "prefer remote on a tie" is written once and cannot drift between them.
 *
 * **`remote` is a wrapper, not a nullable value, and the test that made it one
 * is the point.** The first version took `remote: T | null` and read `null` as
 * "no row on the server" — which is correct for preferences and catastrophic
 * for the watchlist, where `null` is a *value* meaning "following everything"
 * (decision 023). A user whose server row said "everything" would have it read
 * as an absent row, so their curated local list would win and be pushed back
 * up, quietly overwriting the choice they made on another device.
 */
export function pickNewer<T>({
  local,
  localAt,
  remote,
}: {
  local: T;
  localAt: number;
  /** `null` means the server has no row at all. A row holding `null` is `{ value: null }`. */
  remote: { value: T; at: number } | null;
}): { value: T; source: "local" | "remote" } {
  if (remote === null) return { value: local, source: "local" };
  return remote.at >= localAt
    ? { value: remote.value, source: "remote" }
    : { value: local, source: "local" };
}
