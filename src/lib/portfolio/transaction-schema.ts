import { z } from "zod";
import type { Transaction } from "@/lib/api/types";
import { findOversell } from "./derive";

/**
 * What a valid transaction looks like, and what to say when it isn't.
 *
 * The form's values are **strings**, not numbers, and the schema validates
 * them as strings before a separate step converts. `z.coerce.number()` on an
 * empty input yields `0`, so a blank quantity would be rejected with "must be
 * more than zero" — technically true, unhelpful, and it teaches the user that
 * the app doesn't quite understand what they did. Validating the text lets
 * "you haven't entered a quantity" and "that isn't a number" be different
 * sentences.
 *
 * Messages are written the way a person would say them. No "Invalid input",
 * no field names in code case, no exclamation marks.
 */

export interface TransactionFormValues {
  symbol: string;
  side: "buy" | "sell";
  quantity: string;
  price: string;
  fees: string;
  date: string;
  account: string;
  note: string;
}

/**
 * A decimal string that has to parse and be strictly positive.
 *
 * One refinement, not a chain, and it lets the empty case through. Zod runs
 * every `.refine` in a chain even after an earlier one has failed, so a blank
 * field collected both "how many did you trade?" and "quantity has to be a
 * number above zero", and `abc` collected the same sentence twice. Folding the
 * checks into one predicate means each situation produces exactly one
 * sentence — which was the entire reason for validating text rather than
 * coercing to a number first.
 */
function positiveDecimal(missing: string, invalid: string) {
  return z
    .string()
    .trim()
    .min(1, missing)
    .refine((value) => {
      if (value === "") return true; // already reported by `min`
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0;
    }, invalid);
}

/** Blank is allowed and means zero. */
function optionalNonNegativeDecimal(invalid: string) {
  return z
    .string()
    .trim()
    .refine(
      (value) => value === "" || (Number.isFinite(Number(value)) && Number(value) >= 0),
      invalid,
    );
}

const base = z.object({
  symbol: z.string().min(1, "Pick an asset."),
  side: z.enum(["buy", "sell"]),
  quantity: positiveDecimal(
    "How many did you trade?",
    "Quantity has to be a number above zero.",
  ),
  price: positiveDecimal(
    "What price did you get?",
    "Price has to be a number above zero.",
  ),
  fees: optionalNonNegativeDecimal("Fees have to be a number, or blank."),
  date: z.string().min(1, "When was this?"),
  account: z.string().trim().max(40, "That's a long account name — keep it under 40."),
  note: z.string().trim().max(280, "Notes are capped at 280 characters."),
});

/**
 * The schema, closed over the rest of the ledger.
 *
 * Two checks need the whole log rather than the row in hand:
 *
 *   - **A sell can't exceed the holding at that date.** Obvious, and easy to
 *     check against a running total.
 *   - **An edit can invalidate a *later* row.** Reducing a buy from 55 to 10
 *     leaves a sell of 20 three months on selling shares that no longer exist.
 *     Checking only the edited row would pass it, and the ledger would go
 *     quietly wrong in a way `walkLots` clamps and never mentions.
 *
 * So the candidate row is merged into a copy of the log and the whole symbol
 * is re-walked. It costs nothing at this scale and it catches the case that
 * would otherwise be found months later by someone reconciling against a
 * broker statement.
 */
export function transactionSchema({
  existing,
  editingId,
}: {
  existing: readonly Transaction[];
  /** Set when editing, so the row being replaced doesn't count against itself. */
  editingId?: string;
}) {
  const previous = editingId
    ? existing.find((t) => t.id === editingId)
    : undefined;

  return base.superRefine((values, ctx) => {
    if (Date.parse(values.date) > Date.now()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["date"],
        message: "That's in the future — log it once it's filled.",
      });
      return;
    }

    const candidate: Transaction = {
      id: editingId ?? "__candidate__",
      symbol: values.symbol,
      side: values.side,
      quantity: Number(values.quantity),
      price: Number(values.price),
      fees: values.fees === "" ? undefined : Number(values.fees),
      date: values.date,
    };

    if (!Number.isFinite(candidate.quantity)) return;

    const withoutCandidate = existing.filter((t) => t.id !== candidate.id);
    const merged = [...withoutCandidate, candidate];

    /**
     * Every symbol this edit could disturb.
     *
     * The new one, obviously — and the old one too, because retargeting a
     * NVDA buy at AAPL leaves the NVDA sells behind it with nothing to sell.
     * Buys are checked as well as sells: reducing a buy from 55 to 10 breaks
     * a sale of 20 three months later, and a check that only ran on sells
     * would wave that through. (It did, until it was caught in the browser.)
     */
    const touched = new Set([values.symbol, previous?.symbol].filter(Boolean));

    for (const symbol of touched as Set<string>) {
      const after = findOversell(merged, symbol);
      if (!after) continue;

      // Compared against the ledger **as it stands right now** — `existing`,
      // with the row being edited still in it. Using the log minus the
      // candidate would measure against a state the ledger is never in: strip
      // a 55-share buy out and of course the sale behind it looks short, so
      // every edit scores as an improvement and nothing is ever blocked.
      //
      // The baseline exists because a CSV import warns about a shortfall but
      // imports anyway, so a symbol can already be short. The natural repair
      // is to add the missing buy, and a change that *reduces* the shortfall
      // has to get through or the user is locked out of fixing their own data.
      const before = findOversell(existing, symbol);
      if (before && after.requested - after.available <= before.requested - before.available) {
        continue;
      }

      const isThisRow = after.transactionId === candidate.id;

      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["quantity"],
        message: isThisRow
          ? `You held ${trim(after.available)} ${symbol} on that date, not ${trim(after.requested)}.`
          : `That leaves a later sale of ${trim(after.requested)} ${symbol} on ${shortDate(after.date)} with only ${trim(after.available)} to sell.`,
      });
      return;
    }
  });
}

export function toTransaction(
  values: TransactionFormValues,
): Omit<Transaction, "id"> {
  return {
    symbol: values.symbol,
    side: values.side,
    quantity: Number(values.quantity),
    price: Number(values.price),
    fees: values.fees.trim() === "" ? undefined : Number(values.fees),
    // Stored at UTC midnight, matching the daily candle grid, so a transaction
    // and the bar it should be valued against share a timestamp.
    date: new Date(`${values.date.slice(0, 10)}T00:00:00.000Z`).toISOString(),
    account: values.account.trim() || undefined,
    note: values.note.trim() || undefined,
  };
}

export function toFormValues(tx: Transaction): TransactionFormValues {
  return {
    symbol: tx.symbol,
    side: tx.side,
    quantity: String(tx.quantity),
    price: String(tx.price),
    fees: tx.fees === undefined ? "" : String(tx.fees),
    date: tx.date.slice(0, 10),
    account: tx.account ?? "",
    note: tx.note ?? "",
  };
}

/** `YYYY-MM-DD` for a date input, in the user's own timezone. */
export function todayForInput(now: number = Date.now()): string {
  const d = new Date(now);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Drops trailing zeros so 0.30000000000000004 doesn't appear in an error. */
function trim(value: number): string {
  return String(Number(value.toFixed(8)));
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(Date.parse(iso));
}
