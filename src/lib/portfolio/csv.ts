import type { Instrument, Transaction } from "@/lib/api/types";

/**
 * Importing a broker's export, or a paste out of a spreadsheet.
 *
 * Three things this does that a naive `split(",")` doesn't, each because it
 * would otherwise silently produce a wrong ledger:
 *
 *   **Quoted fields.** A note reading `"Trimmed, took profit"` contains a
 *   comma. Splitting on commas shifts every column after it by one, and the
 *   row still parses — into nonsense.
 *
 *   **Header aliases.** No two brokers agree. `Qty`, `Shares`, `Units`;
 *   `Type`, `Action`, `Side`. Making the user rename columns before importing
 *   is a task they'll do wrong once and give up on.
 *
 *   **Ambiguous dates, resolved for the file rather than the row.** `03/04/2025`
 *   is two different days depending on which side of the Atlantic wrote it.
 *   The order is inferred once from whichever rows disambiguate themselves and
 *   applied to the whole file; if nothing in the file settles it, every slash
 *   date is flagged and the user is asked. Guessing would put trades in the
 *   wrong month, change the cost basis, and never announce itself.
 */

export type CsvField =
  | "symbol"
  | "side"
  | "quantity"
  | "price"
  | "fees"
  | "date"
  | "account"
  | "note";

const REQUIRED: CsvField[] = ["symbol", "side", "quantity", "price", "date"];

/** Header spellings seen across common broker and exchange exports. */
const ALIASES: Record<CsvField, string[]> = {
  symbol: ["symbol", "ticker", "asset", "instrument", "security", "code", "pair"],
  side: ["side", "type", "action", "transactiontype", "activity", "buysell", "direction"],
  quantity: ["quantity", "qty", "shares", "units", "size", "numberofshares", "filledqty"],
  price: ["price", "unitprice", "priceperunit", "pricepershare", "executionprice", "avgprice", "rate", "fillprice"],
  fees: ["fees", "fee", "commission", "charges", "brokerage", "totalfees"],
  date: ["date", "tradedate", "transactiondate", "settlementdate", "datetime", "executed", "executedat", "time"],
  account: ["account", "broker", "exchange", "platform", "portfolio", "venue"],
  note: ["note", "notes", "memo", "description", "comment", "remarks"],
};

const BUY_WORDS = new Set(["buy", "b", "bought", "purchase", "purchased", "long", "in"]);
const SELL_WORDS = new Set(["sell", "s", "sold", "sale", "sells", "disposal", "out"]);

export type DateOrder = "iso" | "dmy" | "mdy" | "ambiguous" | "none";

export interface CsvRow {
  /** 1-based line number in the pasted text, so the preview can point at it. */
  line: number;
  cells: string[];
  transaction: Omit<Transaction, "id"> | null;
  errors: string[];
}

export interface CsvParseResult {
  headers: string[];
  mapping: Partial<Record<CsvField, number>>;
  /** Required columns that couldn't be found — the file can't be imported. */
  missing: CsvField[];
  rows: CsvRow[];
  dateOrder: DateOrder;
  valid: number;
  invalid: number;
}

/* ── Tokenising ────────────────────────────────────────────────────────── */

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts: [string, number][] = [
    ["\t", (firstLine.match(/\t/g) ?? []).length],
    [",", (firstLine.match(/,/g) ?? []).length],
    [";", (firstLine.match(/;/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  // Tabs come first when tied because a spreadsheet paste is tab-separated and
  // a single-column CSV has no delimiter at all.
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/** RFC 4180-ish: quoted fields, doubled quotes, CRLF, and blank lines dropped. */
export function parseDelimited(text: string): { line: number; cells: string[] }[] {
  const delimiter = detectDelimiter(text);
  const out: { line: number; cells: string[] }[] = [];

  let cells: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;

  const pushRow = () => {
    cells.push(field);
    field = "";
    if (cells.some((c) => c.trim() !== "")) out.push({ line: rowStartLine, cells });
    cells = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(field);
      field = "";
    } else if (ch === "\n") {
      pushRow();
      line++;
      rowStartLine = line;
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  if (field !== "" || cells.length > 0) pushRow();

  return out;
}

/* ── Header mapping ────────────────────────────────────────────────────── */

const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

function mapHeaders(headers: string[]): Partial<Record<CsvField, number>> {
  const mapping: Partial<Record<CsvField, number>> = {};
  const normalised = headers.map(normalise);

  for (const [field, aliases] of Object.entries(ALIASES) as [CsvField, string[]][]) {
    // Exact match first, so a `price` column always beats a `fillprice` one.
    let index = normalised.findIndex((h) => aliases.includes(h));
    if (index === -1) {
      index = normalised.findIndex((h) => aliases.some((a) => h.includes(a)));
    }
    if (index !== -1 && !Object.values(mapping).includes(index)) {
      mapping[field] = index;
    }
  }

  return mapping;
}

/* ── Dates ─────────────────────────────────────────────────────────────── */

const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})/;
const SLASHED = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/;

/**
 * Which way round the file writes slash dates.
 *
 * Any row with a component above 12 settles it for the whole file. Mixing
 * orders inside one export doesn't happen, and deciding per row would put two
 * trades from the same statement in different months.
 */
export function detectDateOrder(values: readonly string[]): DateOrder {
  let sawSlashed = false;
  let sawIso = false;

  for (const value of values) {
    const trimmed = value.trim();
    if (ISO.test(trimmed)) {
      sawIso = true;
      continue;
    }
    const match = SLASHED.exec(trimmed);
    if (!match) continue;

    sawSlashed = true;
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (first > 12) return "dmy";
    if (second > 12) return "mdy";
  }

  if (sawSlashed) return "ambiguous";
  if (sawIso) return "iso";
  return "none";
}

function parseDate(value: string, order: DateOrder): string | null {
  const trimmed = value.trim();

  const iso = ISO.exec(trimmed);
  if (iso) {
    return utcMidnight(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const slashed = SLASHED.exec(trimmed);
  if (slashed) {
    if (order === "ambiguous" || order === "none" || order === "iso") return null;
    const a = Number(slashed[1]);
    const b = Number(slashed[2]);
    const [day, month] = order === "dmy" ? [a, b] : [b, a];
    return utcMidnight(Number(slashed[3]), month, day);
  }

  return null;
}

function utcMidnight(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const t = Date.UTC(year, month - 1, day);
  const d = new Date(t);
  // Rejects 31 February, which `Date.UTC` happily rolls into March.
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString();
}

/* ── Numbers ───────────────────────────────────────────────────────────── */

/**
 * Strips the decoration brokers put around money.
 *
 * Currency symbols, thousands separators, and parentheses for negatives. The
 * sign is dropped rather than honoured: direction lives in the side column,
 * and a `-40` quantity on a row marked `Sell` would otherwise cancel out.
 */
function parseNumber(value: string): number | null {
  const cleaned = value
    .trim()
    .replace(/[()]/g, "")
    .replace(/[^0-9.\-]/g, "");

  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const parsed = Math.abs(Number(cleaned));
  return Number.isFinite(parsed) ? parsed : null;
}

/* ── The parser ────────────────────────────────────────────────────────── */

export function parseTransactionsCsv(
  text: string,
  { instruments }: { instruments: readonly Instrument[] },
): CsvParseResult {
  const lines = parseDelimited(text);

  if (lines.length === 0) {
    return {
      headers: [],
      mapping: {},
      missing: REQUIRED,
      rows: [],
      dateOrder: "none",
      valid: 0,
      invalid: 0,
    };
  }

  const headers = lines[0].cells.map((c) => c.trim());
  const mapping = mapHeaders(headers);
  const missing = REQUIRED.filter((field) => mapping[field] === undefined);

  if (missing.length > 0) {
    return {
      headers,
      mapping,
      missing,
      rows: [],
      dateOrder: "none",
      valid: 0,
      invalid: 0,
    };
  }

  const body = lines.slice(1);
  const dateColumn = mapping.date!;
  const dateOrder = detectDateOrder(body.map((r) => r.cells[dateColumn] ?? ""));

  const known = new Map(instruments.map((i) => [i.symbol.toUpperCase(), i]));

  const rows: CsvRow[] = body.map(({ line, cells }) => {
    const errors: string[] = [];
    const cell = (field: CsvField) => (cells[mapping[field]!] ?? "").trim();

    const rawSymbol = cell("symbol").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!rawSymbol) errors.push("No symbol.");
    else if (!known.has(rawSymbol)) errors.push(`${rawSymbol} isn't in ember's universe yet.`);

    const rawSide = normalise(cell("side"));
    const side = BUY_WORDS.has(rawSide) ? "buy" : SELL_WORDS.has(rawSide) ? "sell" : null;
    if (!side) errors.push(`Can't tell if "${cell("side")}" is a buy or a sell.`);

    const quantity = parseNumber(cell("quantity"));
    if (quantity === null) errors.push("Quantity isn't a number.");
    else if (quantity <= 0) errors.push("Quantity has to be above zero.");

    const price = parseNumber(cell("price"));
    if (price === null) errors.push("Price isn't a number.");
    else if (price <= 0) errors.push("Price has to be above zero.");

    const rawFees = mapping.fees === undefined ? "" : cell("fees");
    const fees = rawFees === "" ? 0 : parseNumber(rawFees);
    if (fees === null) errors.push("Fees aren't a number.");

    const rawDate = cell("date");
    const date = parseDate(rawDate, dateOrder);
    if (!date) {
      errors.push(
        dateOrder === "ambiguous"
          ? `"${rawDate}" could be day-first or month-first.`
          : `"${rawDate}" isn't a date ember can read.`,
      );
    } else if (Date.parse(date) > Date.now()) {
      errors.push("That date is in the future.");
    }

    if (errors.length > 0) {
      return { line, cells, transaction: null, errors };
    }

    return {
      line,
      cells,
      transaction: {
        symbol: rawSymbol,
        side: side!,
        quantity: quantity!,
        price: price!,
        fees: fees === 0 ? undefined : fees!,
        date: date!,
        account: mapping.account === undefined ? undefined : cell("account") || undefined,
        note: mapping.note === undefined ? undefined : cell("note") || undefined,
      },
      errors: [],
    };
  });

  return {
    headers,
    mapping,
    missing,
    rows,
    dateOrder,
    valid: rows.filter((r) => r.transaction !== null).length,
    invalid: rows.filter((r) => r.transaction === null).length,
  };
}

/** A file the user can fill in, offered when they have nothing to paste. */
export const CSV_TEMPLATE = [
  "symbol,side,quantity,price,fees,date,account,note",
  "AAPL,buy,40,198.40,1.50,2025-01-15,Brokerage,",
  "BTC,buy,0.32,68400,12,2025-03-02,Exchange,",
  "AAPL,sell,10,241.10,1.50,2025-07-04,Brokerage,Trimmed",
].join("\n");
