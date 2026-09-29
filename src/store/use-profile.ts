"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { EMPTY_PROFILE, type Profile } from "@/lib/profile";
import { stampOnChange } from "@/lib/sync/stamp";

/**
 * The profile, in its own store rather than in preferences.
 *
 * They were the same thing until phase 20, when `displayName` was the only
 * personal field in the app and lived beside the risk profile. Splitting it out
 * is not tidying — the two now sync to different tables and answer different
 * questions. A preference is a choice about how ember behaves on *this*
 * account; a profile is who the account belongs to, and it is the half that a
 * future receipt, a tax question or a support conversation would read.
 *
 * `displayName` is adopted on first load and then left alone. Migrating across
 * two stores is not something `persist` can express, so it is done explicitly
 * below, once, and the old key is not deleted — a user who downgrades keeps
 * their greeting rather than losing it to a one-way migration.
 */

interface ProfileState extends Profile {
  set: (patch: Partial<Profile>) => void;
  clear: () => void;
}

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      ...EMPTY_PROFILE,

      // Empty strings become null so "has a name" is one check everywhere
      // rather than `name && name.trim()` at each call site.
      set: (patch) =>
        set(
          Object.fromEntries(
            Object.entries(patch).map(([key, value]) => [
              key,
              typeof value === "string" ? (value.trim() || null) : value,
            ]),
          ) as Partial<Profile>,
        ),

      clear: () => set({ ...EMPTY_PROFILE }),
    }),
    {
      name: "ember:profile",
      version: 1,
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        adoptLegacyDisplayName(state);
      },
    },
  ),
);

stampOnChange(useProfile, "ember:profile");

/**
 * Take the name the preferences store used to hold.
 *
 * Runs once, on rehydration, and only when there is nothing to overwrite. It
 * reads `localStorage` directly rather than importing `use-preferences`,
 * because importing one store into another to read a field it no longer owns
 * is how two stores end up permanently coupled over a value that stopped
 * existing.
 */
function adoptLegacyDisplayName(state: ProfileState): void {
  if (state.preferredName !== null) return;
  if (typeof localStorage === "undefined") return;

  try {
    const raw = localStorage.getItem("ember:preferences");
    if (!raw) return;
    const parsed = JSON.parse(raw) as { state?: { displayName?: unknown } };
    const legacy = parsed.state?.displayName;
    if (typeof legacy === "string" && legacy.trim() !== "") {
      state.set({ preferredName: legacy });
    }
  } catch {
    // A corrupt or absent payload means there is no name to adopt, which is
    // the same outcome as a user who never set one.
  }
}
