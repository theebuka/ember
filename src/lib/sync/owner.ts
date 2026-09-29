/**
 * Which account this device's local data was last synced with.
 *
 * **Without this, signing in merged whoever was on the device into whoever
 * signed in.** Sign-out deliberately leaves the ledger in place — it is the
 * user's, it works offline, and wiping it would make signing out destructive
 * (ADR 0031). But nothing recorded *whose* ledger it was, so the next account to
 * sign in on the same device reconciled it like any other local change: every
 * trade uploaded into the second account, and the profile's names with them.
 * On a shared laptop that is one person's positions sitting in another person's
 * account, on every device they own.
 *
 * `null` means this device has never synced, and then the local data is adopted
 * — that is the ordinary first sign-in, where the book being uploaded is the
 * whole point. A *different* id is the case that must stop and ask.
 *
 * A plain `localStorage` key rather than a field on a store, because it is a
 * fact about the device's relationship to an account — the same reasoning that
 * keeps `hasOnboarded` out of sync — and nothing renders from it.
 */
const KEY = "ember:sync-owner";

export function readOwner(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeOwner(userId: string): void {
  try {
    localStorage.setItem(KEY, userId);
  } catch {
    // Restricted storage. The ledger's own persistence has failed for the same
    // reason, so there is nothing local to protect.
  }
}

/**
 * Forget the owner, for the two actions that empty the device.
 *
 * After Reset everything, or deleting an account along with its local copy,
 * there is nothing here to protect — and without this the next sign-in would be
 * asked what to do with another account's data about a device holding none.
 */
export function clearOwner(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}
