"use client";

import { useMemo, useRef, useState } from "react";
import { PlanCard } from "@/components/plan/upsell";
import { usePlan } from "@/hooks/use-plan";
import { holdingLimit } from "@/lib/plan";
import { openSymbols } from "@/lib/portfolio/derive";
import { usePortfolio } from "@/store/use-portfolio";
import { AlertTriangle, Check, Upload } from "@/components/common/icon";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Instrument, Transaction } from "@/lib/api/types";
import { CSV_TEMPLATE, parseTransactionsCsv } from "@/lib/portfolio/csv";
import { findOversell } from "@/lib/portfolio/derive";
import { formatShortDate } from "@/lib/market/format";
import { cn } from "@/lib/utils";

/**
 * Paste or upload a ledger.
 *
 * The whole design turns on one rule: **nothing is imported until the user has
 * seen what will be imported.** A silent import that swallows six rows and
 * misreads two dates produces a portfolio that is subtly wrong and a user who
 * has no idea where to look. So every row is shown with its verdict, bad rows
 * name what's wrong with them in a sentence, and the button says exactly how
 * many rows it is about to add.
 *
 * Partial import is allowed. Refusing the whole file over one malformed row
 * means hand-editing a CSV in a text editor, which is a worse job than fixing
 * one trade in the app afterwards.
 */
export function CsvImport({
  open,
  onOpenChange,
  instruments,
  existing,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instruments: readonly Instrument[];
  /** The current ledger, so the preview can catch an oversell across both. */
  existing: readonly Transaction[];
  onImport: (transactions: Omit<Transaction, "id">[]) => void;
}) {
  const [text, setText] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const result = useMemo(
    () => (text.trim() === "" ? null : parseTransactionsCsv(text, { instruments })),
    [text, instruments],
  );

  /**
   * Would the imported rows sell something that was never held?
   *
   * Checked against the merged ledger, not the file alone — a file containing
   * only sells is perfectly valid if the buys are already in the app, and a
   * file that balances internally can still break an existing position.
   */
  const oversell = useMemo(() => {
    if (!result || result.valid === 0) return null;
    const incoming = result.rows
      .filter((r) => r.transaction !== null)
      .map((r, i) => ({ ...r.transaction!, id: `__import_${i}__` }));
    return findOversell([...existing, ...incoming]);
  }, [result, existing]);

  /**
   * Would the import take the book past the plan's holdings limit (decision
   * 288)? Measured as open positions after the merge against the larger of the
   * limit and what is already open, so a book already over it — a lapse, which
   * takes nothing away — can still import into what it holds.
   */
  const { plan } = usePlan();
  const isSample = usePortfolio((s) => s.isSample);
  const limit = isSample ? null : holdingLimit(plan);
  const overLimit = useMemo(() => {
    if (limit === null || !result || result.valid === 0) return false;
    const incoming = result.rows
      .filter((r) => r.transaction !== null)
      .map((r, i) => ({ ...r.transaction!, id: `__import_${i}__` }));
    const before = openSymbols(existing).size;
    return openSymbols([...existing, ...incoming]).size > Math.max(limit, before);
  }, [limit, result, existing]);

  const close = () => {
    setText("");
    onOpenChange(false);
  };

  const handleFile = async (file: File) => {
    setText(await file.text());
  };

  const importable = result?.valid ?? 0;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title="Import transactions"
      description="Paste from a spreadsheet or upload a CSV. You'll review it before anything is added."
      className="md:max-w-2xl"
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              // Reset so choosing the same file twice fires a change event.
              e.target.value = "";
            }}
          />
          <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
            <Upload />
            Choose a file
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setText(CSV_TEMPLATE)}>
            Use the template
          </Button>
        </div>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          spellCheck={false}
          aria-label="Transaction data"
          className="num font-mono text-caption"
          placeholder={"symbol,side,quantity,price,fees,date\nAAPL,buy,40,198.40,1.50,2025-01-15"}
        />

        <p className="text-micro text-stone">
          Common names like <code>Qty</code>, <code>Shares</code> and <code>Type</code> work
          too.
        </p>

        {result && <Preview result={result} oversell={oversell} />}
        {overLimit && <PlanCard feature="more-holdings" />}
      </div>

      <div className="flex gap-2 border-t border-line p-4 md:p-5">
        <Button variant="outline" size="lg" className="flex-1" onClick={close}>
          Cancel
        </Button>
        <Button
          size="lg"
          className="flex-1"
          disabled={importable === 0 || overLimit}
          onClick={() => {
            if (!result) return;
            onImport(
              result.rows
                .filter((r) => r.transaction !== null)
                .map((r) => r.transaction!),
            );
            close();
          }}
        >
          {importable === 0
            ? "Nothing to import"
            : `Import ${importable} ${importable === 1 ? "trade" : "trades"}`}
        </Button>
      </div>
    </ResponsiveModal>
  );
}

function Preview({
  result,
  oversell,
}: {
  result: NonNullable<ReturnType<typeof parseTransactionsCsv>>;
  oversell: ReturnType<typeof findOversell>;
}) {
  if (result.missing.length > 0) {
    return (
      <Notice tone="warn">
        <p className="font-medium text-ink">
          Missing {result.missing.length === 1 ? "a column" : "some columns"}:{" "}
          {result.missing.join(", ")}.
        </p>
        <p className="mt-1">
          ember found: {result.headers.join(", ") || "nothing that looks like a header row"}.
          The first line has to be the header.
        </p>
      </Notice>
    );
  }

  if (result.rows.length === 0) {
    return <Notice tone="warn">The file has a header row but no data.</Notice>;
  }

  return (
    <div className="space-y-3">
      {result.dateOrder === "ambiguous" && (
        <Notice tone="warn">
          <p className="font-medium text-ink">Which way round are these dates?</p>
          <p className="mt-1">
            Every date here could be day-first or month-first, and a wrong guess would put trades in the wrong month. Re-export as{" "}
            <code>YYYY-MM-DD</code>, or change one date to that format and ember will follow it.
          </p>
        </Notice>
      )}

      {oversell && (
        <Notice tone="warn">
          <p className="font-medium text-ink">This would sell more than you hold.</p>
          <p className="mt-1">
            On {formatShortDate(Date.parse(oversell.date))} the file sells{" "}
            {oversell.requested} {oversell.symbol} against {oversell.available} held.
            You can still import — check for a missing buy.
          </p>
        </Notice>
      )}

      <div className="flex items-center gap-3 text-caption">
        <span className="flex items-center gap-1.5 text-up">
          <Check className="size-3.5" />
          {result.valid} ready
        </span>
        {result.invalid > 0 && (
          <span className="flex items-center gap-1.5 text-down">
            <AlertTriangle className="size-3.5" />
            {result.invalid} skipped
          </span>
        )}
      </div>

      <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line">
        {result.rows.map((row) => (
          <li
            key={row.line}
            className={cn(
              "flex items-start gap-2.5 px-3 py-2",
              row.transaction === null && "bg-down-tint/40",
            )}
          >
            <span className="num w-6 shrink-0 pt-0.5 text-micro text-stone">
              {row.line}
            </span>

            {row.transaction ? (
              <span className="num min-w-0 flex-1 truncate text-caption text-graphite">
                <span className="mono-label text-ink">{row.transaction.symbol}</span>{" "}
                {row.transaction.side} {row.transaction.quantity} @{" "}
                {row.transaction.price}
                <span className="ml-2 text-stone">
                  {formatShortDate(Date.parse(row.transaction.date))}
                </span>
              </span>
            ) : (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-caption text-stone">
                  {row.cells.join(", ")}
                </span>
                <span className="mt-0.5 block text-micro text-down">
                  {row.errors.join(" ")}
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "warn";
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-lg px-3 py-2.5 text-caption text-stone",
        tone === "warn" && "bg-surface-2",
      )}
    >
      {children}
    </div>
  );
}
