import { describe, expect, it } from "vitest";
import type { Instrument } from "@/lib/api/types";
import { detectDateOrder, parseDelimited, parseTransactionsCsv } from "./csv";

const INSTRUMENTS: Instrument[] = [
  { symbol: "AAPL", name: "Apple", market: "equity", currency: "USD", precision: 2 },
  { symbol: "BTC", name: "Bitcoin", market: "crypto", currency: "USD", precision: 0 },
];

const parse = (text: string) => parseTransactionsCsv(text, { instruments: INSTRUMENTS });

describe("parseDelimited", () => {
  it("keeps commas inside quoted fields", () => {
    const rows = parseDelimited('a,b,c\n1,"two, and a half",3');
    expect(rows[1].cells).toEqual(["1", "two, and a half", "3"]);
  });

  it("unescapes doubled quotes", () => {
    const rows = parseDelimited('note\n"He said ""buy"" and left"');
    expect(rows[1].cells).toEqual(['He said "buy" and left']);
  });

  it("handles CRLF and drops blank lines", () => {
    const rows = parseDelimited("a,b\r\n1,2\r\n\r\n3,4\r\n");
    expect(rows.map((r) => r.cells)).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("reads a spreadsheet paste as tab-separated", () => {
    const rows = parseDelimited("symbol\tside\tqty\nAAPL\tbuy\t10");
    expect(rows[1].cells).toEqual(["AAPL", "buy", "10"]);
  });

  it("reports the source line so the preview can point at a row", () => {
    const rows = parseDelimited('a\n"multi\nline"\nlast');
    expect(rows.map((r) => r.line)).toEqual([1, 2, 4]);
  });
});

describe("detectDateOrder", () => {
  it("recognises ISO", () => {
    expect(detectDateOrder(["2025-01-15", "2025-03-02"])).toBe("iso");
  });

  it("infers day-first from a day above twelve", () => {
    expect(detectDateOrder(["03/04/2025", "22/05/2025"])).toBe("dmy");
  });

  it("infers month-first from a day above twelve in the second slot", () => {
    expect(detectDateOrder(["03/04/2025", "05/22/2025"])).toBe("mdy");
  });

  it("refuses to guess when nothing in the file settles it", () => {
    // Every value here is valid both ways round. Picking one would silently
    // move trades between months.
    expect(detectDateOrder(["03/04/2025", "05/06/2025"])).toBe("ambiguous");
  });
});

describe("parseTransactionsCsv", () => {
  it("maps a plain export", () => {
    const result = parse(
      ["symbol,side,quantity,price,fees,date", "AAPL,buy,40,198.40,1.50,2025-01-15"].join("\n"),
    );

    expect(result.missing).toEqual([]);
    expect(result.valid).toBe(1);
    expect(result.rows[0].transaction).toEqual({
      symbol: "AAPL",
      side: "buy",
      quantity: 40,
      price: 198.4,
      fees: 1.5,
      date: "2025-01-15T00:00:00.000Z",
      account: undefined,
      note: undefined,
    });
  });

  it("accepts a broker's own column names", () => {
    const result = parse(
      ["Ticker,Action,Qty,Avg Price,Commission,Trade Date,Broker", "BTC,Bought,0.5,68400,12,2025-03-02,Coinbase"].join(
        "\n",
      ),
    );

    expect(result.valid).toBe(1);
    expect(result.rows[0].transaction?.symbol).toBe("BTC");
    expect(result.rows[0].transaction?.side).toBe("buy");
    expect(result.rows[0].transaction?.account).toBe("Coinbase");
  });

  it("strips currency symbols, separators and parentheses from numbers", () => {
    const result = parse(
      ["symbol,side,quantity,price,date", 'AAPL,sell,"1,200","$1,198.40",2025-01-15'].join("\n"),
    );

    expect(result.rows[0].transaction?.quantity).toBe(1200);
    expect(result.rows[0].transaction?.price).toBe(1198.4);
  });

  it("takes direction from the side column, not from a negative quantity", () => {
    // A signed quantity on a row already marked Sell would otherwise flip the
    // trade back to a buy.
    const result = parse(
      ["symbol,side,quantity,price,date", "AAPL,Sell,-40,241.10,2025-01-15"].join("\n"),
    );

    expect(result.rows[0].transaction?.side).toBe("sell");
    expect(result.rows[0].transaction?.quantity).toBe(40);
  });

  it("applies one date order to the whole file", () => {
    const result = parse(
      [
        "symbol,side,quantity,price,date",
        "AAPL,buy,1,100,03/04/2025",
        "AAPL,buy,1,100,22/05/2025",
      ].join("\n"),
    );

    expect(result.dateOrder).toBe("dmy");
    // 3 April, not 4 March — settled by the 22nd on the row below.
    expect(result.rows[0].transaction?.date).toBe("2025-04-03T00:00:00.000Z");
  });

  it("flags every slash date when the file can't settle the order", () => {
    const result = parse(
      ["symbol,side,quantity,price,date", "AAPL,buy,1,100,03/04/2025"].join("\n"),
    );

    expect(result.dateOrder).toBe("ambiguous");
    expect(result.valid).toBe(0);
    expect(result.rows[0].errors[0]).toContain("day-first or month-first");
  });

  it("rejects an unknown symbol without failing the whole file", () => {
    const result = parse(
      [
        "symbol,side,quantity,price,date",
        "TSLA,buy,1,300,2025-01-15",
        "AAPL,buy,1,200,2025-01-15",
      ].join("\n"),
    );

    expect(result.valid).toBe(1);
    expect(result.invalid).toBe(1);
    expect(result.rows[0].errors[0]).toContain("TSLA");
    expect(result.rows[1].transaction).not.toBeNull();
  });

  it("collects every problem on a row rather than stopping at the first", () => {
    const result = parse(
      ["symbol,side,quantity,price,date", ",wobble,abc,-,not-a-date"].join("\n"),
    );

    expect(result.rows[0].errors.length).toBeGreaterThanOrEqual(4);
  });

  it("rejects an impossible calendar date", () => {
    const result = parse(
      ["symbol,side,quantity,price,date", "AAPL,buy,1,100,2025-02-31"].join("\n"),
    );

    expect(result.valid).toBe(0);
  });

  it("rejects a trade dated in the future", () => {
    const nextYear = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);
    const result = parse(
      ["symbol,side,quantity,price,date", `AAPL,buy,1,100,${nextYear}`].join("\n"),
    );

    expect(result.rows[0].errors[0]).toContain("future");
  });

  it("names the columns it couldn't find", () => {
    const result = parse(["symbol,quantity", "AAPL,10"].join("\n"));

    expect(result.missing).toEqual(["side", "price", "date"]);
    expect(result.rows).toEqual([]);
  });

  it("returns nothing for empty input", () => {
    expect(parse("").rows).toEqual([]);
    expect(parse("   \n  ").valid).toBe(0);
  });
});
