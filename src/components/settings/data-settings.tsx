"use client";

import { DeleteAccount } from "@/components/settings/delete-account";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, Eraser, RotateCcw } from "@/components/common/icon";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { SettingGroup, SettingRow } from "@/components/settings/setting-row";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import type { Transaction } from "@/lib/api/types";
import {
  exportFilename,
  downloadText,
  transactionsToCsv,
  transactionsToJson,
} from "@/lib/portfolio/export";
import { clearOnboardedCookie } from "@/lib/onboarding";
import { undoableToast } from "@/lib/toast";
import { useAdviceActions } from "@/store/use-advice-actions";
import { useAlertLog } from "@/store/use-alert-log";
import { usePortfolio } from "@/store/use-portfolio";
import { usePreferences } from "@/store/use-preferences";
import { useWatchlist } from "@/store/use-watchlist";
import { clearOwner } from "@/lib/sync/owner";

/**
 * Export, clear, and reset — in ascending order of regret.
 *
 * Two destructive actions rather than one, because they are genuinely
 * different and collapsing them would force the safer one to carry the
 * heavier ceremony:
 *
 *   **Clear transactions** takes the ledger and nothing else, and it is
 *   *undoable* — the rows are captured before the wipe and put back with their
 *   ids and sample flag intact. So it gets a toast, like every other reversible
 *   action in the app, and no dialog.
 *
 *   **Reset everything** takes the preferences too, which includes the flag
 *   that says setup is done. Nothing survives it to undo from, and the next
 *   screen is onboarding. That one gets the dialog.
 *
 * That split is what keeps the no-confirmation-dialog rule (CLAUDE.md §5)
 * honest: the single dialog in the product exists precisely where an undo
 * cannot reach, and it says so.
 */
/** Stable identity, so the pre-hydration read doesn't churn memo deps. */
const EMPTY: Transaction[] = [];

export function DataSettings() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [confirming, setConfirming] = useState(false);

  const stored = usePortfolio((s) => s.transactions);
  const isSample = usePortfolio((s) => s.isSample);
  const clearPortfolio = usePortfolio((s) => s.clear);
  const replaceAll = usePortfolio((s) => s.replaceAll);

  const resetWatchlist = useWatchlist((s) => s.reset);
  const clearHandled = useAdviceActions((s) => s.clearAll);
  const clearAlertLog = useAlertLog((s) => s.clearAll);
  const resetPreferences = usePreferences((s) => s.reset);

  // The ledger is unreadable on the server, so until hydration this screen has
  // to describe an empty one — which is also the state in which every control
  // here is disabled, so nothing is briefly offered and then withdrawn.
  const transactions = hydrated ? stored : EMPTY;
  const count = transactions.length;
  const nothingLogged = count === 0;

  const exportAs = (extension: "csv" | "json") => {
    const contents =
      extension === "csv"
        ? transactionsToCsv(transactions)
        : transactionsToJson(transactions);

    downloadText(
      exportFilename(extension),
      extension === "csv" ? "text/csv" : "application/json",
      contents,
    );

    toast(`${count} ${count === 1 ? "trade" : "trades"} exported`, {
      description: exportFilename(extension),
    });
  };

  const handleClearTransactions = () => {
    const previous = transactions;
    const wasSample = isSample;

    clearPortfolio();
    undoableToast("Transactions cleared", {
      description: `${previous.length} ${previous.length === 1 ? "trade" : "trades"} removed. Your settings are untouched.`,
      onUndo: () => replaceAll(previous, wasSample),
    });
  };

  const handleReset = () => {
    clearPortfolio();
    resetWatchlist();
    clearHandled();
    clearAlertLog();
    resetPreferences();
    // The store's `hasOnboarded` is back to false; the cookie mirroring it has
    // to go too, or middleware would keep waving the user past setup.
    clearOnboardedCookie();
    clearOwner();

    setConfirming(false);
    router.replace("/onboarding");
  };

  return (
    <>
      <SettingGroup
        title="Export and clear"
        description={hydrated ? "Your trades on this device." : undefined}
        footer={
          <>
            <p>
              Your trades live in this browser. If you&apos;re not signed in, clearing browser
              data deletes them.
            </p>
            {/* This said "nothing is sent anywhere" until phase 15, and that
                stopped being true the moment the risk engine shipped. It names
                exactly what goes and exactly what doesn't. ADR 0025. */}
            <p>
              To warn you about a position, ember&rsquo;s server needs to know you hold it.
              Whenever Home or Signals loads, or alerts are on, it receives four numbers per
              open position (symbol, quantity, average cost and opening date) and stores
              none of them. Nothing else about your trades leaves this device.
            </p>
          </>
        }
      >
        <SettingRow
          label="Export your transactions"
          description={
            nothingLogged
              ? "Nothing to export yet."
              : "CSV for spreadsheets, JSON for a full backup."
          }
          control={
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportAs("csv")}
                disabled={nothingLogged}
              >
                <Download />
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportAs("json")}
                disabled={nothingLogged}
              >
                <Download />
                JSON
              </Button>
            </div>
          }
        />

        <SettingRow
          label="Clear your transactions"
          description={
            nothingLogged
              ? "Your ledger is already empty."
              : `Deletes all ${count} ${count === 1 ? "trade" : "trades"}. Your settings and watchlist stay. You can undo this.`
          }
          control={
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearTransactions}
              disabled={nothingLogged}
            >
              <Eraser />
              Clear
            </Button>
          }
        />

      </SettingGroup>

      {/* The irreversible things, together and apart from the everyday ones —
          the reason `Your data` and the account deletion were never peers. */}
      <SettingGroup title="Danger zone" tone="danger">
        <SettingRow
          label="Reset everything"
          description="Deletes your trades, watchlist and settings, and restarts setup. This can't be undone."
          control={
            <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
              <RotateCcw />
              Reset
            </Button>
          }
        />
        <DeleteAccount />
      </SettingGroup>

      <ResponsiveModal
        open={confirming}
        onOpenChange={setConfirming}
        title="Reset everything?"
        description="This can't be undone."
      >
        <div className="p-5">
          <ul className="space-y-1.5 text-caption text-graphite">
            <li className="flex gap-2">
              <span className="text-stone">·</span>
              {nothingLogged
                ? "No transactions to lose"
                : `${count} ${count === 1 ? "transaction" : "transactions"}, and every figure derived from them`}
            </li>
            <li className="flex gap-2">
              <span className="text-stone">·</span>
              Your watchlist, back to following everything
            </li>
            <li className="flex gap-2">
              <span className="text-stone">·</span>
              Your risk profile, base currency, markets and alert preferences
            </li>
            <li className="flex gap-2">
              <span className="text-stone">·</span>
              Calls you&apos;ve acted on or dismissed, and alerts already sent
            </li>
          </ul>

          {!nothingLogged && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-surface-2 p-3">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-down"
              />
              <div className="min-w-0">
                <p className="text-caption text-graphite">
                  Export your trades first. They&apos;re the one thing you can&apos;t get back.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => exportAs("json")}
                >
                  <Download />
                  Export first
                </Button>
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" size="xl" onClick={() => setConfirming(false)}>
              Keep my data
            </Button>
            {/* Tinted, not a saturated clay slab. Direction colours in ember
                are low-chroma and appear as fills behind their own text
                (CLAUDE.md §5) — a full-bleed red button with white type is the
                alarm register the whole palette exists to avoid, and this is a
                dialog the user opened deliberately, not a warning shouted at
                them. */}
            <Button variant="destructive" size="xl" onClick={handleReset}>
              Reset everything
            </Button>
          </div>
        </div>
      </ResponsiveModal>
    </>
  );
}
