"use client";

import { useState } from "react";
import { PlanCard, PlanChip } from "@/components/plan/upsell";
import { canUse } from "@/lib/plan";
import Link from "next/link";
import { SettingGroup, SettingRow } from "@/components/settings/setting-row";
import { PlanBadge, renewalLine, usePriceLine } from "@/components/plan/subscription";
import { usePlan } from "@/hooks/use-plan";
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
  const { plan, ready: planReady } = usePlan();
  const now = useNow(30_000);
  const [signingOut, setSigningOut] = useState(false);

  if (!available) return null;

  async function signOut() {
    const supabase = await supabaseBrowser();
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
    <SettingGroup title="Sign-in and sync">
        {!ready ? (
          // Reserved rather than assumed signed-out: flashing a Sign in button
          // at someone who is already signed in is the auth version of the
          // hydration flicker ADR 0017 exists to prevent.
          <SettingRow label="Account" description="Checking…" />
        ) : user ? (
          <>
            {/* `control`, not `children`. As a child the button dropped into
                its own full-width row *below* the address at every width — so
                on a desktop pane 600px wide, a label, a short email and a 96px
                button occupied three stacked bands with the right two thirds of
                the row empty. As a control it sits beside the address where
                there is room and beneath it on a phone, which is the whole
                point of the `responsive` layout. */}
            {/* The address, and changing it, in one row. It was here and again
                in an Email block 600px further down the same tab. */}
            <SettingRow
              label="Email"
              description={<span className="num break-all">{user.email ?? "Kept in sync."}</span>}
              control={
                <Button asChild variant="outline" size="sm">
                  <Link href="/auth?next=%2Fsettings%3Ftab%3Daccount">Change</Link>
                </Button>
              }
            />
            <PlanRow />

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
            ) : planReady && !canUse("sync", plan) ? (
              <SettingRow
                label={
                  <span className="flex items-center gap-2">
                    Sync
                    <PlanChip />
                  </span>
                }
                description="Your data stays on this device."
              >
                <PlanCard feature="sync" className="mt-3.5" />
              </SettingRow>
            ) : (
              <SettingRow
                label="Sync"
                description={syncDescription(status, lastSyncedAt, now)}
              />
            )}
            <SettingRow
              label="Sign out"
              description="Your data stays on this device."
              control={
                <Button variant="outline" size="sm" onClick={signOut} disabled={signingOut}>
                  {signingOut ? "Signing out…" : "Sign out"}
                </Button>
              }
            />
          </>
        ) : (
          <SettingRow
            label="Sign in"
            description="Needed for Pro. With Pro, your data syncs to every device you sign in on."
            control={
              <Button asChild size="sm">
                <Link href="/auth?next=%2Fsettings%3Ftab%3Daccount">Sign in</Link>
              </Button>
            }
          />
        )}
    </SettingGroup>
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

/**
 * The plan, on the Account tab — for a subscriber only.
 *
 * Free gets no row: "Plan: Free" with a link to the prices would be a standing
 * upsell on a screen about identity (ADR 0038 — one, and only where a limit bit).
 */
function PlanRow() {
  const { plan, ready, subscription } = usePlan();
  const price = usePriceLine(subscription.status === "active" ? subscription.billing : null);
  if (!ready || plan !== "pro" || subscription.status !== "active") return null;
  return (
    <SettingRow
      label={
        <span className="flex items-center gap-2">
          Plan <PlanBadge />
        </span>
      }
      description={renewalLine(subscription, price)}
      control={
        <Button asChild variant="outline" size="sm">
          <Link href="/settings?tab=plan">Manage</Link>
        </Button>
      }
    />
  );
}
