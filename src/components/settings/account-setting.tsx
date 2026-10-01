"use client";

import { useState } from "react";
import Link from "next/link";
import { SettingGroup, SettingRow } from "@/components/settings/setting-row";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/use-now";
import { useSession } from "@/hooks/use-session";
import { useSyncStatus } from "@/hooks/use-sync";
import { formatRelative } from "@/lib/market/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useSyncState } from "@/store/use-sync-state";

/**
 * The account section, and it renders nothing when there is no account
 * service.
 *
 * **Absent rather than disabled.** A greyed-out Sign in row is a claim about a
 * setting — it says "this exists and is currently unavailable to you". With no
 * Supabase project configured, signing in is not unavailable, it is *not a
 * thing*, and the app's local-only behaviour is complete rather than degraded
 * (`lib/supabase/config.ts`). The same reasoning as decision 047, where the
 * two alert types that don't exist got a "Not yet" chip instead of a switch
 * — except here there is nothing to promise, so there is nothing to show.
 */
export function AccountSetting() {
  const { user, ready, available } = useSession();
  const { status, lastSyncedAt } = useSyncStatus();
  const resolve = useSyncState((s) => s.resolve);
  const now = useNow(30_000);
  const [signingOut, setSigningOut] = useState(false);

  if (!available) return null;

  async function signOut() {
    const supabase = supabaseBrowser();
    if (!supabase) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    setSigningOut(false);
    toast.success("Signed out", {
      description: "Your data is still on this device.",
    });
  }

  return (
    /**
     * **No section header.** It used to carry one reading `ACCOUNT · optional,
     * and off by default` — directly under a page title reading `Account`, which
     * is the same word twice, 60px apart, and the first of four stacked text
     * blocks a reader met before reaching a single control. This block is the
     * first thing under the tab title, so the tab title is its label.
     */
    <section>
      <SettingGroup>
        {!ready ? (
          // Reserved rather than assumed signed-out: flashing a Sign in button
          // at someone who is already signed in is the auth version of the
          // hydration flicker ADR 0017 exists to prevent.
          <SettingRow label="Sign-in" description="Checking…" />
        ) : user ? (
          <>
            {/* `control`, not `children`. As a child the button dropped into
                its own full-width row *below* the address at every width — so
                on a desktop pane 600px wide, a label, a short email and a 96px
                button occupied three stacked bands with the right two thirds of
                the row empty. As a control it sits beside the address where
                there is room and beneath it on a phone, which is the whole
                point of the `responsive` layout. */}
            <SettingRow
              label="Signed in"
              description={user.email ?? "Kept in sync."}
              control={
                <Button
                  variant="outline"
                  size="default"
                  onClick={signOut}
                  disabled={signingOut}
                >
                  {signingOut ? "Signing out…" : "Sign out"}
                </Button>
              }
            />

            {/* Held: this device's data was last synced with another account,
                and nothing moves until somebody says which way. Two outcomes,
                both named for what they do. The first is the default
                reading of "I just signed in" — see `lib/sync/owner.ts`. */}
            {status === "held" ? (
              <SettingRow
                label="This device has another account's data"
                description="Nothing has synced yet. Choose what to do with it."
                layout="stack"
                control={
                  <div className="flex flex-wrap gap-2">
                    <Button size="default" onClick={() => resolve("replace")}>
                      Use this account&apos;s data
                    </Button>
                    <Button variant="outline" size="default" onClick={() => resolve("merge")}>
                      Add it to this account
                    </Button>
                  </div>
                }
              />
            ) : (
              <SettingRow
                label="Sync"
                description={syncDescription(status, lastSyncedAt, now)}
              />
            )}
          </>
        ) : (
          <SettingRow
            label="Sync across devices"
            description="Back up your trades, watchlist, settings and profile, and use them on any device."
            control={
              <Button asChild size="default">
                <Link href="/auth?next=%2Fsettings">Sign in</Link>
              </Button>
            }
          />
        )}
      </SettingGroup>
    </section>
  );
}

/**
 * What the sync is doing, in a sentence, without a spinner.
 *
 * A failed sync is not a failed session — everything on screen still works and
 * the local copy is untouched — so it says so here rather than interrupting
 * with a toast the user cannot act on.
 */
function syncDescription(
  status: ReturnType<typeof useSyncStatus>["status"],
  lastSyncedAt: number | null,
  now: number | null,
): string {
  if (status === "syncing") return "Syncing now.";
  if (status === "error") {
    return "Last sync didn't finish. Nothing lost; it retries.";
  }
  if (lastSyncedAt === null || now === null) {
    return "Positions and P&L are recomputed, never stored.";
  }
  return `Last synced ${formatRelative(lastSyncedAt, now)}.`;
}
