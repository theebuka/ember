import { describe, expect, it } from "vitest";
import type { Instrument, Transaction } from "@/lib/api/types";
import { parseTransactionsCsv } from "./csv";
import {
  decimalString,
  exportFilename,
  transactionsToCsv,
  transactionsToJson,
} from "./export";

const INSTRUMENTS: Instrument[] = [
  { symbol: "AAPL", name: "Apple", market: "equity", currency: "USD", precision: 2 },
  { symbol: "BTC", name: "Bitcoin", market: "crypto", currency: "USD", precision: 0 },
];

const LEDGER: Transaction[] = [
  {
    id: "1",
    symbol: "AAPL",
    side: "buy",
    quantity: 40,
    price: 198.4,
    fees: 1.5,
    date: "2025-01-15T00:00:00.000Z",
    account: "Brokerage",
    note: "First one",
  },
  {
    id: "2",
    symbol: "BTC",
    side: "buy",
    // Eight decimal places: the case that turns into `1e-8` under `String()`.
    quantity: 0.00000001,
    price: 68400,
    date: "2025-03-02T00:00:00.000Z",
  },
  {
    id: "3",
    symbol: "AAPL",
    side: "sell",
    quantity: 10,
    price: 241.1,
    fees: 1.5,
    date: "2025-07-04T00:00:00.000Z",
    account: "Brokerage",
    note: 'Trimmed, "took profit"',
  },
];

describe("decimalString", () => {
  it("never emits exponent notation", () => {
    expect(decimalString(0.00000001)).toBe("0.00000001");
    expect(decimalString(1e-7)).toBe("0.0000001");
  });

  it("trims trailing zeros rather than padding to a fixed width", () => {
    expect(decimalString(40)).toBe("40");
    expect(decimalString(198.4)).toBe("198.4");
  });

  it("keeps negatives and survives a non-finite value", () => {
    expect(decimalString(-2.5)).toBe("-2.5");
    expect(decimalString(Number.NaN)).toBe("0");
  });
});

describe("transactionsToCsv", () => {
  it("writes the header the importer reads", () => {
    const [header] = transactionsToCsv(LEDGER).split("\n");
    expect(header).toBe("symbol,side,quantity,price,fees,date,account,note");
  });

  it("emits date-only values, in chronological order", () => {
    const dates = transactionsToCsv(LEDGER)
      .split("\n")
      .slice(1)
      .map((line) => line.split(",")[5]);
    expect(dates).toEqual(["2025-01-15", "2025-03-02", "2025-07-04"]);
  });

  it("quotes a note containing a comma and doubles its quotes", () => {
    expect(transactionsToCsv(LEDGER)).toContain('"Trimmed, ""took profit"""');
  });

  it("leaves absent fees and optional columns empty rather than writing 0", () => {
    const btc = transactionsToCsv(LEDGER)
      .split("\n")
      .find((line) => line.startsWith("BTC"))!;
    expect(btc).toBe("BTC,buy,0.00000001,68400,,2025-03-02,,");
  });

  /**
   * The invariant that makes the pair safe to trust. Anything the app can hand
   * you it has to be able to take back, unchanged.
   */
  it("round-trips through the importer unchanged", () => {
    const result = parseTransactionsCsv(transactionsToCsv(LEDGER), {
      instruments: INSTRUMENTS,
    });

    expect(result.missing).toEqual([]);
    expect(result.invalid).toBe(0);
    expect(result.rows.map((r) => r.transaction)).toEqual(
      [...LEDGER]
        .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
        // Everything but the id, which the importer has no way to know and the
        // ledger reissues on insert.
        .map((tx) => ({
          symbol: tx.symbol,
          side: tx.side,
          quantity: tx.quantity,
          price: tx.price,
          fees: tx.fees,
          date: tx.date,
          account: tx.account,
          note: tx.note,
        })),
    );
  });

  it("produces a header-only file for an empty ledger", () => {
    expect(transactionsToCsv([])).toBe(
      "symbol,side,quantity,price,fees,date,account,note",
    );
  });
});

describe("transactionsToJson", () => {
  it("wraps the rows in enough metadata to identify the file", () => {
    const parsed = JSON.parse(transactionsToJson(LEDGER, Date.UTC(2026, 7, 13)));
    expect(parsed.app).toBe("ember");
    expect(parsed.schema).toBe(1);
    expect(parsed.count).toBe(3);
    expect(parsed.exportedAt).toBe("2026-08-13T00:00:00.000Z");
  });

  it("keeps ids, so a restore can preserve identity", () => {
    const parsed = JSON.parse(transactionsToJson(LEDGER));
    expect(parsed.transactions.map((t: Transaction) => t.id)).toEqual(["1", "2", "3"]);
  });
});

describe("exportFilename", () => {
  it("dates the file so exports sort chronologically", () => {
    expect(exportFilename("csv", Date.UTC(2026, 7, 13))).toBe(
      "ember-transactions-2026-08-13.csv",
    );
  });
});
