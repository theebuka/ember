"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import { Copy } from "@/components/common/icon";
import { Segmented } from "@/components/common/segmented";
import { recordAdminAction } from "@/components/admin/record";
import { SettingBlock, SettingGroup } from "@/components/settings/setting-row";
import { Tag } from "@/components/signals/call-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/market/format";
import { CODE_EXPIRIES, CODE_PERIODS, describePeriod, generateCode } from "@/lib/redeem";
import { supabaseBrowser } from "@/lib/supabase/client";

interface CodeRow {
  code: string;
  period_days: number;
  max_redemptions: number;
  redeemed_count: number;
  expires_at: string | null;
  note: string | null;
  created_at: string;
  revoked_at: string | null;
}

const DAY_MS = 86_400_000;

/** When a code stops being redeemable, from the picker's value. */
function expiresAt(value: string): string | null {
  return value === "never" ? null : new Date(Date.now() + Number(value) * DAY_MS).toISOString();
}

const PERIOD_OPTIONS = [
  ...CODE_PERIODS.map((period) => ({ value: String(period.days), label: period.label })),
  { value: "custom", label: "Custom" },
];

/**
 * Make a code worth a set period of Pro, hand it to somebody, and revoke it if
 * it goes astray (migration 0011).
 *
 * Written as the signed-in admin; `is_admin()` refuses anybody else in Postgres,
 * so this panel rendering is a courtesy, not the permission (ADR 0039). The
 * code is generated here, from the browser's CSPRNG, and shown in full because
 * an admin has to be able to copy it — readers never see this table.
 */
export function CodesPanel({ user }: { user: User }) {
  const [period, setPeriod] = useState("30");
  const [customDays, setCustomDays] = useState("45");
  const [uses, setUses] = useState("1");
  const [expiry, setExpiry] = useState("never");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [rows, setRows] = useState<CodeRow[] | null>(null);
  const [reads, setReads] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = await supabaseBrowser();
      if (!supabase || cancelled) return;
      const { data, error } = await supabase
        .from("redemption_codes")
        .select("code, period_days, max_redemptions, redeemed_count, expires_at, note, created_at, revoked_at")
        .order("created_at", { ascending: false })
        .limit(20);
      // A missing table (0011 not applied) reads as an empty list; the create
      // button then says why when it fails.
      if (!cancelled) setRows(error ? [] : ((data as CodeRow[] | null) ?? []));
    })();
    return () => {
      cancelled = true;
    };
  }, [reads]);

  const days = period === "custom" ? Number.parseInt(customDays, 10) : Number(period);
  const maxUses = Number.parseInt(uses, 10);
  const problem =
    !Number.isInteger(days) || days < 1 || days > 3660
      ? "A period runs from 1 to 3,660 days."
      : !Number.isInteger(maxUses) || maxUses < 1 || maxUses > 10_000
        ? "Uses run from 1 to 10,000."
        : note.length > 140
          ? "Keep the note under 140 characters."
          : null;

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const supabase = await supabaseBrowser();
    if (!supabase || problem) return;
    setBusy(true);
    const code = generateCode();
    const { error } = await supabase.from("redemption_codes").insert({
      code,
      period_days: days,
      max_redemptions: maxUses,
      expires_at: expiresAt(expiry),
      note: note.trim() || null,
      created_by: user.id,
    });
    setBusy(false);
    if (error) {
      toast.error("No code created.", { description: error.message });
      return;
    }
    await recordAdminAction(supabase, user.id, "code.create", code, {
      title: `${describePeriod(days)}${maxUses > 1 ? `, ${maxUses} uses` : ""}`,
    });
    setCreated(code);
    setNote("");
    setReads((n) => n + 1);
  }

  const revoke = useCallback(
    async (row: CodeRow) => {
      const supabase = await supabaseBrowser();
      if (!supabase) return;
      const { error } = await supabase
        .from("redemption_codes")
        .update({ revoked_at: new Date().toISOString() })
        .eq("code", row.code);
      if (error) {
        toast.error("Not revoked.", { description: error.message });
        return;
      }
      await recordAdminAction(supabase, user.id, "code.revoke", row.code, {
        title: row.code,
      });
      toast.success("Revoked. Nobody can redeem it now.");
      if (created === row.code) setCreated(null);
      setReads((n) => n + 1);
    },
    [created, user.id],
  );

  return (
    <SettingGroup
      title="Redemption codes"
      description="Each code adds a set period of Pro to the account that redeems it. It doesn't renew."
    >
      <SettingBlock>
        <form onSubmit={create} className="space-y-5" noValidate>
          <div className="space-y-2">
            <p className="text-caption font-medium text-graphite">Period</p>
            <Segmented
              aria-label="Period"
              value={period}
              onChange={setPeriod}
              options={PERIOD_OPTIONS}
              className="flex w-full flex-wrap"
            />
            {period === "custom" && (
              <div className="flex items-center gap-3 pt-1">
                <Input
                  id="code-days"
                  inputMode="numeric"
                  value={customDays}
                  onChange={(event) => setCustomDays(event.target.value.replace(/\D/g, ""))}
                  aria-label="Days of Pro"
                  className="w-28"
                />
                <span className="text-caption text-stone">days</span>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="code-uses">Uses</Label>
              <Input
                id="code-uses"
                inputMode="numeric"
                value={uses}
                onChange={(event) => setUses(event.target.value.replace(/\D/g, ""))}
              />
              <p className="text-micro text-stone">How many accounts can redeem it.</p>
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="code-expiry">Redeemable</Label>
              <Select value={expiry} onValueChange={setExpiry}>
                <SelectTrigger id="code-expiry" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CODE_EXPIRIES.map((option) => (
                    <SelectItem key={option.label} value={option.days === null ? "never" : String(option.days)}>
                      {option.days === null ? "Until revoked" : option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-micro text-stone">After this it can&apos;t be redeemed.</p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="code-note">Note</Label>
            <Input
              id="code-note"
              value={note}
              maxLength={140}
              placeholder="Who it's for"
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy || problem !== null}>
              {busy ? "Creating…" : `Create a ${describePeriod(Number.isInteger(days) && days > 0 ? days : 1)} code`}
            </Button>
            {problem && <p className="text-micro text-stone">{problem}</p>}
          </div>
        </form>
      </SettingBlock>

      {/* The one just made, large enough to read out, with the copy beside it. */}
      {created && (
        <SettingBlock className="flex flex-wrap items-center gap-3 bg-surface-2">
          <div className="min-w-0 flex-1">
            <p className="text-micro text-stone">New code</p>
            <p className="mono-label text-heading text-ink">{created}</p>
          </div>
          <CopyButton code={created} />
        </SettingBlock>
      )}

      {rows === null ? null : rows.length === 0 ? (
        <SettingBlock>
          <p className="text-caption text-stone">No codes yet.</p>
        </SettingBlock>
      ) : (
        rows.map((row) => <CodeLine key={row.code} row={row} onRevoke={revoke} />)
      )}
    </SettingGroup>
  );
}

function statusOf(row: CodeRow, now: number): "Live" | "Revoked" | "Expired" | "Used" {
  if (row.revoked_at) return "Revoked";
  if (row.expires_at && Date.parse(row.expires_at) <= now) return "Expired";
  if (row.redeemed_count >= row.max_redemptions) return "Used";
  return "Live";
}

function CodeLine({ row, onRevoke }: { row: CodeRow; onRevoke: (row: CodeRow) => void }) {
  // Read once per render rather than through `useNow`: the list is refetched
  // after every action, and a status a minute stale here costs nothing.
  const [now] = useState(() => Date.now());
  const status = statusOf(row, now);
  const live = status === "Live";

  const facts = [
    describePeriod(row.period_days),
    `${row.redeemed_count} of ${row.max_redemptions} used`,
    row.expires_at ? `${live ? "until" : "ended"} ${formatDate(Date.parse(row.expires_at))}` : null,
    row.note,
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className={live ? "mono-label text-caption text-ink" : "mono-label text-caption text-stone line-through"}>
            {row.code}
          </span>
          <Tag tone={live ? "brand" : "neutral"}>{status}</Tag>
        </p>
        <p className="mt-0.5 text-micro break-words text-stone">{facts.join(" · ")}</p>
      </div>
      {live && (
        <div className="flex shrink-0 gap-2">
          <CopyButton code={row.code} />
          <Button variant="outline" size="sm" onClick={() => onRevoke(row)}>
            Revoke
          </Button>
        </div>
      )}
    </div>
  );
}

function CopyButton({ code }: { code: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          toast.success("Copied", { description: code });
        } catch {
          toast.error("Couldn't copy. Select the code instead.");
        }
      }}
    >
      <Copy />
      Copy
    </Button>
  );
}
