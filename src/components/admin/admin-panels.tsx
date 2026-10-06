"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SettingGroup } from "@/components/settings/setting-row";
import { CodesPanel } from "@/components/admin/codes-panel";
import { BroadcastComposer } from "@/components/admin/broadcast-composer";
import { PricingPanel } from "@/components/admin/pricing-panel";
import { SuspensionPanel } from "@/components/admin/suspension-panel";
import { AdminEmpty } from "@/components/admin/fields";
import { useNow } from "@/hooks/use-now";
import { useSession } from "@/hooks/use-session";
import { ADMIN_ACTION_LABELS, type AdminAction } from "@/lib/admin";
import { formatRelative } from "@/lib/market/format";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * ember's back office, as a settings tab.
 *
 * It was its own route. A tab is better for the same reason Settings is a tab
 * row at all: this is configuration, it belongs with the rest of it, and a
 * top-level URL for a screen with one reader was a destination nobody could
 * navigate to anyway — the only link to it was in settings.
 *
 * **It writes as the signed-in admin, not as the service role.** Every other
 * privileged job here is a script the scheduler runs, because the service-role
 * key must never appear under `src/` and a route reading every user's rows would
 * need it (ADR 0037). Broadcasting is the one case where that shape is wrong: it
 * is a person writing prose with a preview in front of them. So the privilege
 * lives in RLS — `is_admin()` gates three tables — and the browser holds nothing
 * but the ordinary anon key.
 *
 * **The tab is not the permission.** Hiding it is a courtesy; every control here
 * would be refused by Postgres for anybody without a row in `admins`.
 */
export function AdminPanels() {
  const { user } = useSession();
  const queryClient = useQueryClient();

  const refresh = useCallback(() => {
    // The bar, the card on Home and the bell all read this key.
    void queryClient.invalidateQueries({ queryKey: ["notices"] });
  }, [queryClient]);

  if (!user) return null;

  return (
    <>
      <BroadcastComposer user={user} onChanged={refresh} />
      <CodesPanel user={user} />
      <SuspensionPanel user={user} />
      <PricingPanel user={user} />
      <AdminLog />
    </>
  );
}

interface LogRow {
  id: number;
  /** Free text in the database, so a log cannot refuse to record something new. */
  action: string;
  detail: Record<string, unknown>;
  at: string;
}

/**
 * Who did what.
 *
 * On the screen rather than in the database only, because an audit trail nobody
 * reads is decoration — the value is that the person about to act can see the
 * last ten. Append-only in Postgres: no update policy, no delete policy.
 */
function AdminLog() {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const now = useNow(60_000);

  useEffect(() => {

    let cancelled = false;
    void (async () => {
      const supabase = await supabaseBrowser();
      if (!supabase || cancelled) return;
      const { data } = await supabase
        .from("admin_log")
        .select("id, action, detail, at")
        .order("at", { ascending: false })
        .limit(50);
      if (!cancelled) setRows((data as LogRow[] | null) ?? []);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SettingGroup title="Activity" description="Every admin action, newest first. Nobody can edit it.">
      {rows === null ? (
        <AdminEmpty>Loading…</AdminEmpty>
      ) : rows.length === 0 ? (
        <AdminEmpty>Nothing done here yet.</AdminEmpty>
      ) : (
        rows.map((row) => (
          <div key={row.id} className="flex items-baseline gap-3 px-4 py-3 sm:px-5">
            <p className="min-w-0 flex-1 text-caption text-ink">
              {ADMIN_ACTION_LABELS[row.action as AdminAction] ?? row.action}
              {typeof row.detail.title === "string" && (
                <span className="text-stone"> · {row.detail.title}</span>
              )}
            </p>
            {now !== null && (
              <time dateTime={row.at} className="shrink-0 text-micro text-stone tabular-nums">
                {formatRelative(Date.parse(row.at), now)}
              </time>
            )}
          </div>
        ))
      )}
    </SettingGroup>
  );
}
