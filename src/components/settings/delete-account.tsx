"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash } from "@/components/common/icon";
import { SettingRow } from "@/components/settings/setting-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/hooks/use-session";
import { supabaseBrowser } from "@/lib/supabase/client";
import { usePortfolio } from "@/store/use-portfolio";
import { usePreferences } from "@/store/use-preferences";
import { useProfile } from "@/store/use-profile";
import { useWatchlist } from "@/store/use-watchlist";
import { useNotifications } from "@/store/use-notifications";
import { clearOwner } from "@/lib/sync/owner";
import { cn } from "@/lib/utils";

type Step = "closed" | "confirm" | "type" | "working" | "error";

/**
 * Deleting the account.
 *
 * **Two gates, and they are different in kind.** The first is a confirmation:
 * are you sure, here is exactly what goes. The second is a *typed* phrase, and
 * it exists because a confirmation dialog is a reflex — anyone who has used a
 * computer clears one without reading it. Typing the word cannot be done by
 * reflex, which is the only property that matters for an action with no undo.
 *
 * ADR 0015 says ember has **one** confirmation dialog, on Reset everything,
 * and that everything else gets an undo instead. This does not contradict it —
 * it is the same rule applied to a stronger case. Reset is undoable in
 * principle and merely inconvenient in practice; deleting an account removes
 * rows on a server this client cannot restore. Where an undo is impossible, a
 * gate is the only thing left, and the gate scales with the damage.
 *
 * **It says what it deletes and what it does not.** The rows go; the ledger on
 * *this device* stays, because it is in `localStorage` and deleting the account
 * does not reach it. A user who deletes their account and then finds their
 * book still there would reasonably conclude the deletion failed, so it is said
 * before rather than discovered after — with a one-tap way to clear the local
 * copy too.
 */
export function DeleteAccount() {
  const router = useRouter();
  const { user, available } = useSession();

  const [step, setStep] = useState<Step>("closed");
  const [phrase, setPhrase] = useState("");
  const [alsoLocal, setAlsoLocal] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const clearPortfolio = usePortfolio((s) => s.clear);
  const clearWatchlist = useWatchlist((s) => s.reset);
  const clearNotifications = useNotifications((s) => s.clear);
  const resetPreferences = usePreferences((s) => s.reset);
  const clearProfile = useProfile((s) => s.clear);

  // Nothing to delete when there is no account service and nobody signed in.
  if (!available || !user) return null;

  const CONFIRM_PHRASE = "delete my account";

  async function destroy() {
    const supabase = await supabaseBrowser();
    if (!supabase || !user) return;

    setStep("working");
    setMessage(null);

    // Rows first, session second. The other order signs the user out and then
    // tries to delete rows as an anonymous client, which RLS correctly refuses
    // — leaving an account that looks deleted and isn't.
    const tables = ["transactions", "preferences", "watchlist"] as const;
    for (const table of tables) {
      const { error } = await supabase.from(table).delete().eq("user_id", user.id);
      if (error) {
        setMessage(error.message);
        setStep("error");
        return;
      }
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .delete()
      .eq("id", user.id);
    if (profileError) {
      setMessage(profileError.message);
      setStep("error");
      return;
    }

    if (alsoLocal) {
      clearPortfolio();
      clearWatchlist();
      clearNotifications();
      clearProfile();
      resetPreferences();
      clearOwner();
    }

    await supabase.auth.signOut();
    router.replace("/settings");
    setStep("closed");
  }

  // The section's heading lives here, so it disappears with the control: a
  // "Danger" heading over nothing was what a signed-out reader saw.
  // A row in the danger zone on Your data, beside Reset everything. It was its
  // own red slab under a "Danger" heading, which made one control the loudest
  // thing on the tab.
  return (
    <SettingRow
      label="Delete your account"
      description="Deletes your profile, synced trades, settings and watchlist from ember's server, and signs you out everywhere. This can't be undone."
      control={
        step === "closed" ? (
          <Button
            variant="outline"
            size="sm"
            className="border-down/40 text-down hover:bg-down-tint"
            onClick={() => setStep("confirm")}
          >
            <Trash />
            Delete
          </Button>
        ) : undefined
      }
    >

      {/* ── Gate one: read what goes ─────────────────────────────────── */}
      {step === "confirm" && (
        <div className="mt-4 border-t border-down/20 pt-4">
          <p className="text-caption font-medium text-ink">What gets deleted</p>
          <ul className="mt-2 space-y-1 text-caption text-stone">
            <li>· Your profile — name, country, time zone</li>
            <li>· Every transaction synced to the server</li>
            <li>· Your risk profile, base currency and alert preferences</li>
            <li>· Your watchlist</li>
          </ul>

          <p className="mt-4 text-caption font-medium text-ink">
            What stays until you clear it
          </p>
          <p className="mt-2 text-caption text-stone text-pretty">
            The copy in this browser stays unless you clear it below.
          </p>

          <label className="mt-3 flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={alsoLocal}
              onChange={(event) => setAlsoLocal(event.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--down)]"
            />
            <span className="text-caption text-graphite">
              Clear this device too
            </span>
          </label>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              size="lg"
              className="bg-down text-ground hover:bg-down/90"
              onClick={() => setStep("type")}
            >
              Continue
            </Button>
            <Button variant="ghost" size="lg" onClick={() => setStep("closed")}>
              Keep my account
            </Button>
          </div>
        </div>
      )}

      {/* ── Gate two: type it ────────────────────────────────────────── */}
      {(step === "type" || step === "working" || step === "error") && (
        <div className="mt-4 border-t border-down/20 pt-4">
          <Label htmlFor="delete-phrase">
            Type <span className="font-semibold text-ink">{CONFIRM_PHRASE}</span> to
            confirm
          </Label>
          <Input
            id="delete-phrase"
            className="mt-2"
            value={phrase}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setPhrase(event.target.value)}
            disabled={step === "working"}
          />

          {step === "error" && message && (
            <p className="mt-3 text-caption text-down">
              {message} — nothing was deleted.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="lg"
              className={cn("bg-down text-ground hover:bg-down/90")}
              disabled={
                step === "working" ||
                phrase.trim().toLowerCase() !== CONFIRM_PHRASE
              }
              onClick={destroy}
            >
              {step === "working" ? "Deleting…" : "Delete my account"}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              disabled={step === "working"}
              onClick={() => {
                setPhrase("");
                setStep("closed");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </SettingRow>
  );
}
