"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ticket } from "@/components/common/icon";
import { SettingBlock, SettingGroup, SettingRow } from "@/components/settings/setting-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlan } from "@/hooks/use-plan";
import { useSession } from "@/hooks/use-session";
import { formatDate } from "@/lib/market/format";
import { isCompleteCode, normaliseCode, redeemMessage } from "@/lib/redeem";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AUTH_CONFIGURED } from "@/lib/supabase/config";

/**
 * Redeem a code an admin made (migration 0011).
 *
 * The browser asks `redeem_code`, which extends this account's own Pro inside
 * Postgres — `entitlements` stays select-only, so nothing here can write it.
 * On success it goes to `/pro/welcome`, the same moment a checkout returns to;
 * that page reads the entitlement rather than trusting this one.
 *
 * Not offered where a code cannot add anything: Pro granted with no end, or a
 * paid plan that renews (the function refuses both, and an input that can only
 * fail is a dead end).
 */
export function RedeemCode() {
  const { user, ready } = useSession();
  const { subscription, refresh } = usePlan();
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!AUTH_CONFIGURED || !ready) return null;
  if (subscription.status === "active" && (subscription.periodEnd === null || subscription.renews)) {
    return null;
  }

  async function redeem(event: React.FormEvent) {
    event.preventDefault();
    const supabase = await supabaseBrowser();
    if (!supabase || !isCompleteCode(value)) return;
    setBusy(true);
    setError(null);
    const { data, error: failure } = await supabase.rpc("redeem_code", { p_code: value });
    setBusy(false);
    if (failure) {
      setError(redeemMessage(failure.message));
      return;
    }
    refresh();
    setValue("");
    toast.success("Code redeemed", {
      description: typeof data === "string" ? `Pro until ${formatDate(Date.parse(data))}.` : undefined,
    });
    router.push("/pro/welcome");
  }

  return (
    <SettingGroup
      title="Redeem a code"
      description={
        subscription.status === "active"
          ? "Adds its time to the end of your current Pro."
          : "A code turns on Pro for a set period. It doesn't renew."
      }
    >
      {user ? (
        <SettingBlock>
          <form onSubmit={redeem} className="flex flex-col gap-3 sm:flex-row" noValidate>
            <label htmlFor="redeem-code" className="sr-only">
              Code
            </label>
            <div className="relative min-w-0 flex-1">
              <Ticket className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-stone" />
              <Input
                id="redeem-code"
                value={value}
                onChange={(event) => {
                  setValue(normaliseCode(event.target.value));
                  setError(null);
                }}
                placeholder="XXXX-XXXX-XXXX"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={14}
                aria-invalid={error !== null || undefined}
                aria-describedby={error ? "redeem-error" : undefined}
                className="mono-label pl-12"
              />
            </div>
            <Button type="submit" disabled={busy || !isCompleteCode(value)} className="shrink-0">
              {busy ? "Redeeming…" : "Redeem"}
            </Button>
          </form>
          {error && (
            <p id="redeem-error" role="alert" className="mt-2.5 text-micro text-down">
              {error}
            </p>
          )}
        </SettingBlock>
      ) : (
        <SettingRow
          label="Have a code?"
          description="Sign in, then redeem it here."
          control={
            <Button asChild variant="outline" size="sm">
              <Link href="/auth?next=%2Fsettings%3Ftab%3Dplan">Sign in</Link>
            </Button>
          }
        />
      )}
    </SettingGroup>
  );
}
