/**
 * When a persisted store was last written.
 *
 * The single-row documents — preferences, the watchlist — are merged by
 * comparing timestamps with the server, and neither store has one. Adding a
 * field to their state was the first instinct and it is worse than this: every
 * setter would have to remember to set it (there are eleven between the two),
 * the value would land in the payload the sync then uploads as *content*, and
 * `reset()` would have to be special-cased so that restoring defaults still
 * counted as a write.
 *
 * A subscription is one line per store and cannot be forgotten by a setter
 * that hasn't been written yet. It writes beside the persisted payload rather
 * than inside it, under `<key>:at`, so the stored shape those stores migrate
 * is untouched.
 *
 * A missing stamp reads as 0, which the merge treats as the beginning of time
 * and resolves in favour of the server — the right default for a store written
 * before this existed.
 */

type Subscribable = {
  subscribe: (listener: () => void) => () => void;
};

export function stampOnChange(store: Subscribable, key: string): void {
  // Imported during SSR as well, where there is nothing to subscribe for and
  // no `localStorage` to write to.
  if (typeof window === "undefined") return;

  store.subscribe(() => {
    try {
      localStorage.setItem(`${key}:at`, String(Date.now()));
    } catch {
      // Restricted storage. The persisted payload will have failed for the
      // same reason, so there is nothing here worth reporting separately —
      // and ADR 0014's "cookies blocked" screen already covers the case where
      // the user needs to be told.
    }
  });
}

export function readStampedAt(key: string): number {
  if (typeof localStorage === "undefined") return 0;
  const raw = localStorage.getItem(`${key}:at`);
  const at = raw === null ? NaN : Number(raw);
  return Number.isFinite(at) ? at : 0;
}

/**
 * Set a document's stamp to the time on the version it now holds.
 *
 * Applying a pulled document is a store write, and `stampOnChange` stamps every
 * store write with *now* — so a device that had only read a profile claimed to
 * have edited it, pushed it back, and beat any real edit made offline elsewhere
 * in the meantime. Called straight after applying remote data, which runs after
 * the subscriber, so this is the value that sticks.
 */
export function writeStampedAt(key: string, at: number): void {
  if (typeof localStorage === "undefined" || !Number.isFinite(at)) return;
  try {
    localStorage.setItem(`${key}:at`, String(at));
  } catch {
    // Restricted storage — see `stampOnChange`.
  }
}
