import type { Transaction } from "@/lib/api/types";

/**
 * Getting the ledger back out.
 *
 * The transaction log is the only thing ember stores that the user actually
 * authored, and it lives in `localStorage` — one cleared browser away from
 * gone. An app that can't hand your own data back is asking for a trust it
 * hasn't earned, so export is not a nice-to-have here; it's the counterweight
 * to "clear everything" existing at all.
 *
 * Two formats, for two different jobs:
 *
 *   **CSV** is for a spreadsheet, and it is deliberately emitted with the
 *   exact header spellings `lib/portfolio/csv.ts` reads back. Export then
 *   import has to be a no-op — anything less makes the pair a data-loss bug
 *   waiting for someone to trust it. There's a round-trip test.
 *
 *   **JSON** is the archival copy: the same rows, wrapped in enough metadata
 *   that a future importer can tell what it's looking at.
 */

/* ── Numbers ───────────────────────────────────────────────────────────── */

/**
 * A number as a plain decimal string, never in exponent form.
 *
 * `String(0.00000001)` is `"1e-8"`, and the CSV parser strips everything that
 * isn't a digit, a dot or a minus — which turns that into `"1-8"` and then
 * into a rejected row. Eight decimal places is exactly the precision crypto
 * quantities are quoted to, so this is the common case, not an edge one.
 *
 * Twelve places is past any precision the app admits and comfortably below
 * the 1e21 threshold where `toFixed` gives up and goes exponential anyway.
 */
export function decimalString(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const fixed = value.toFixed(12);
  return fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
}

/* ── CSV ───────────────────────────────────────────────────────────────── */

/** The header row, spelled the way the importer's exact-match pass expects. */
const COLUMNS = [
  "symbol",
  "side",
  "quantity",
  "price",
  "fees",
  "date",
  "account",
  "note",
] as const;

/** RFC 4180 quoting: only when needed, and doubled quotes inside. */
function escapeCell(value: string): string {
  if (value === "") return "";
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function transactionsToCsv(transactions: readonly Transaction[]): string {
  const rows = [...transactions]
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .map((tx) =>
      [
        tx.symbol,
        tx.side,
        decimalString(tx.quantity),
        decimalString(tx.price),
        tx.fees ? decimalString(tx.fees) : "",
        // Date only. The time component is always UTC midnight — it carries no
        // information, and a spreadsheet would render it as a timestamp.
        tx.date.slice(0, 10),
        tx.account ?? "",
        tx.note ?? "",
      ]
        .map(escapeCell)
        .join(","),
    );

  return [COLUMNS.join(","), ...rows].join("\n");
}

/* ── JSON ──────────────────────────────────────────────────────────────── */

export interface LedgerExport {
  app: "ember";
  /** Bumped only if the transaction shape changes. */
  schema: 1;
  exportedAt: string;
  count: number;
  transactions: Transaction[];
}

export function transactionsToJson(
  transactions: readonly Transaction[],
  at: number = Date.now(),
): string {
  const payload: LedgerExport = {
    app: "ember",
    schema: 1,
    exportedAt: new Date(at).toISOString(),
    count: transactions.length,
    transactions: [...transactions].sort(
      (a, b) => Date.parse(a.date) - Date.parse(b.date),
    ),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/* ── Delivery ──────────────────────────────────────────────────────────── */

/** `ember-transactions-2026-08-13.csv` — sorts chronologically in a folder. */
export function exportFilename(extension: "csv" | "json", at: number = Date.now()) {
  return `ember-transactions-${new Date(at).toISOString().slice(0, 10)}.${extension}`;
}

/**
 * Hand a string to the browser as a file.
 *
 * The object URL is revoked on the next frame rather than immediately —
 * Safari has historically cancelled the download if the URL dies in the same
 * tick as the click.
 */
export function downloadText(filename: string, mime: string, contents: string): void {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  requestAnimationFrame(() => URL.revokeObjectURL(url));
}
