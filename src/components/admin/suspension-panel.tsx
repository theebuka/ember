"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import { SettingBlock, SettingGroup } from "@/components/settings/setting-row";
import { AdminActions, AdminEmpty, AdminField } from "@/components/admin/fields";
import { recordAdminAction } from "@/components/admin/record";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  SUSPENSION_CAVEAT,
  SUSPENSION_DOES_NOT_STOP,
  SUSPENSION_STOPS,
} from "@/lib/admin";

interface SuspensionRow {
  user_id: string;
  reason: string | null;
  suspended_at: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Switch off an account's sync and delivery.
 *
 * ── The control is named after what it does ────────────────────────────────
 *
 * Every other admin panel calls this Ban, and here Ban would be a lie. ember
 * works fully with no account (ADR 0031) — local-first ledger, anonymous engine,
 * public methodology and track record — so nothing in this table can stop a
 * person using the product. What it stops is sync, the email digest and push,
 * and the panel lists both halves so an admin cannot come away believing they
 * did more than they did.
 *
 * ── There is no directory of users, deliberately ───────────────────────────
 *
 * An account is suspended by pasting its id, not by picking it out of a list.
 * Building the list would mean an admin-wide select policy over `profiles`, and
 * that is a blanket read of every user's name and time zone granted to solve a
 * problem ember does not have: there is no support queue here, and an admin who
 * needs to find somebody has the Supabase dashboard, where the read is at least
 * audited by somebody else's logs.
 *
 * A wrong id is caught by the foreign key rather than by a lookup, which is the
 * property that makes this safe — the database answers "no such account" without
 * this screen ever being able to ask "which accounts are there".
 */
export function SuspensionPanel({ user }: { user: User }) {
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);

  // Through React Query rather than an effect, so suspending and lifting can
  // both just `refetch()` and there is one place that knows how the list is
  // read. The list is only ever seen by an admin, so it is not cached across
  // mounts — a stale roster of suspended accounts is the one thing this panel
  // must not show.
  const list = useQuery({
    queryKey: ["admin", "suspensions"],
    gcTime: 0,
    staleTime: 0,
    queryFn: async (): Promise<SuspensionRow[]> => {
      const supabase = await supabaseBrowser();
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("suspensions")
        .select("user_id, reason, suspended_at")
        .order("suspended_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data as SuspensionRow[] | null) ?? [];
    },
  });

  const rows = list.data ?? null;

  async function suspend() {
    const supabase = await supabaseBrowser();
    const id = target.trim();
    if (!supabase) return;

    if (!UUID.test(id)) {
      toast.error("That isn't an account id.", {
        description: "It's the uuid from the Supabase dashboard's auth table.",
      });
      return;
    }

    setWorking(true);
    const { error } = await supabase.from("suspensions").insert({
      user_id: id,
      reason: reason.trim() || null,
      suspended_by: user.id,
    });
    setWorking(false);

    if (error) {
      // A foreign-key violation here means no such account, which is the most
      // likely mistake and worth saying in those words rather than in Postgres's.
      toast.error(
        error.code === "23503" ? "No account with that id." : "Not suspended.",
        { description: error.code === "23503" ? undefined : error.message },
      );
      return;
    }

    await recordAdminAction(supabase, user.id, "account.suspend", id, {
      reason: reason.trim() || null,
    });
    toast.success("Sync and delivery suspended.", {
      description: "They see the reason in their notifications.",
    });
    setTarget("");
    setReason("");
    void list.refetch();
  }

  async function restore(row: SuspensionRow) {
    const supabase = await supabaseBrowser();
    if (!supabase) return;

    const { error } = await supabase
      .from("suspensions")
      .delete()
      .eq("user_id", row.user_id);
    if (error) {
      toast.error("Not restored.", { description: error.message });
      return;
    }

    await recordAdminAction(supabase, user.id, "account.restore", row.user_id, {});
    toast.success("Restored.");
    void list.refetch();
  }

  return (
    <>
      <SettingGroup
        title="Suspend an account"
        description={SUSPENSION_CAVEAT}
      >
        {/* What it does and what it can't, as two rows of the box rather than
            two lines of chips floating under the heading. */}
        <dl className="divide-y divide-line">
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
            <dt className="w-16 shrink-0 text-caption font-medium text-ink">Stops</dt>
            <dd className="text-caption text-graphite">{SUSPENSION_STOPS.join(", ")}</dd>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
            <dt className="w-16 shrink-0 text-caption font-medium text-ink">Keeps</dt>
            <dd className="text-caption text-stone">{SUSPENSION_DOES_NOT_STOP.join(", ")}</dd>
          </div>
        </dl>

        <SettingBlock className="space-y-5">
          <AdminField id="suspend-id" label="Account id" hint="the uuid in Supabase's auth table">
            <Input
              id="suspend-id"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="font-mono text-caption"
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </AdminField>
          <AdminField id="suspend-reason" label="Reason" hint="they read this">
            <Input
              id="suspend-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Repeated automated sync."
            />
          </AdminField>
        </SettingBlock>

        <AdminActions>
          <Button
            variant="secondary"
            onClick={suspend}
            disabled={working || target.trim() === ""}
          >
            {working ? "Suspending…" : "Suspend sync and delivery"}
          </Button>
        </AdminActions>
      </SettingGroup>

      <SettingGroup
        title="Suspended"
        action={
          rows && rows.length > 0 ? (
            <span className="text-caption text-stone tabular-nums">{rows.length}</span>
          ) : undefined
        }
      >
        {rows === null ? (
          <AdminEmpty>Loading…</AdminEmpty>
        ) : rows.length === 0 ? (
          <AdminEmpty>No accounts are suspended.</AdminEmpty>
        ) : (
          rows.map((row) => (
            <div key={row.user_id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-caption text-ink">{row.user_id}</p>
                <p className="mt-0.5 text-micro text-stone">
                  {row.reason ?? "No reason recorded."}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => restore(row)}>
                Restore
              </Button>
            </div>
          ))
        )}
      </SettingGroup>
    </>
  );
}
