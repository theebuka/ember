import { describe, expect, it } from "vitest";
import type { Transaction } from "@/lib/api/types";
import {
  toTransaction,
  transactionSchema,
  type TransactionFormValues,
} from "./transaction-schema";

/**
 * The ledger's write-path guards.
 *
 * `derive.ts` clamps an impossible sell so one bad row can't poison every
 * figure on the screen. That clamp is a safety net, not a policy — this is
 * where the user is actually told, and these tests exist because the
 * later-row case shipped broken once already: the check bailed out early on
 * buys, so reducing a buy past a sale three months later went straight
 * through.
 */

const LOG: Transaction[] = [
  { id: "buy-55", symbol: "NVDA", side: "buy", quantity: 55, price: 121.3, date: "2025-03-12" },
  { id: "sell-20", symbol: "NVDA", side: "sell", quantity: 20, price: 174.6, date: "2025-07-03" },
  { id: "buy-aapl", symbol: "AAPL", side: "buy", quantity: 40, price: 198.4, date: "2024-12-16" },
];

const form = (over: Partial<TransactionFormValues> = {}): TransactionFormValues => ({
  symbol: "NVDA",
  side: "buy",
  quantity: "55",
  price: "121.30",
  fees: "",
  date: "2025-03-12",
  account: "",
  note: "",
  ...over,
});

function check(values: TransactionFormValues, editingId?: string) {
  const result = transactionSchema({ existing: LOG, editingId }).safeParse(values);
  return {
    ok: result.success,
    messages: result.success ? [] : result.error.issues.map((i) => i.message),
  };
}

describe("field validation", () => {
  it("accepts a well-formed trade", () => {
    expect(check(form({ symbol: "AAPL", date: "2025-01-02" })).ok).toBe(true);
  });

  it("distinguishes a blank number from a bad one", () => {
    expect(check(form({ quantity: "" })).messages).toEqual(["How many did you trade?"]);
    expect(check(form({ quantity: "abc" })).messages).toEqual([
      "Quantity has to be a number above zero.",
    ]);
  });

  it("rejects zero and negative quantities", () => {
    expect(check(form({ quantity: "0" })).ok).toBe(false);
    expect(check(form({ quantity: "-5" })).ok).toBe(false);
  });

  it("treats blank fees as none", () => {
    expect(check(form({ symbol: "AAPL", date: "2025-01-02", fees: "" })).ok).toBe(true);
    expect(check(form({ symbol: "AAPL", date: "2025-01-02", fees: "-1" })).ok).toBe(false);
  });

  it("rejects a future date", () => {
    const nextYear = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);
    expect(check(form({ date: nextYear })).messages).toEqual([
      "That date is in the future.",
    ]);
  });
});

describe("oversell guard", () => {
  it("blocks a sale larger than the holding, naming the real figure", () => {
    const { ok, messages } = check(
      form({ symbol: "AAPL", side: "sell", quantity: "100", date: "2025-06-01" }),
    );

    expect(ok).toBe(false);
    expect(messages).toEqual(["You held 40 AAPL on that date, not 100."]);
  });

  it("allows a sale the holding covers", () => {
    expect(
      check(form({ symbol: "AAPL", side: "sell", quantity: "40", date: "2025-06-01" })).ok,
    ).toBe(true);
  });

  it("blocks reducing a buy below a later sale", () => {
    // The regression. NVDA: buy 55 in March, sell 20 in July. Editing the buy
    // down to 10 leaves the July sale with nothing behind it — and because the
    // edited row is a *buy*, an oversell check scoped to sells never sees it.
    const { ok, messages } = check(form({ quantity: "10" }), "buy-55");

    expect(ok).toBe(false);
    expect(messages[0]).toContain("later sale of 20 NVDA");
    expect(messages[0]).toContain("only 10 to sell");
  });

  it("allows reducing a buy to exactly the later sale", () => {
    expect(check(form({ quantity: "20" }), "buy-55").ok).toBe(true);
  });

  it("blocks retargeting a buy at another symbol when sales depend on it", () => {
    // Moving the NVDA buy to AAPL orphans the NVDA sale. Checking only the
    // symbol now in the form would miss it entirely.
    const { ok, messages } = check(form({ symbol: "AAPL" }), "buy-55");

    expect(ok).toBe(false);
    expect(messages[0]).toContain("NVDA");
  });

  it("lets a user repair a ledger that is already short", () => {
    // A CSV import warns about an oversell but imports anyway, so a symbol can
    // already be short. The fix is to add the missing buy — which must not be
    // rejected for failing to fully repair the ledger in one step.
    const broken: Transaction[] = [
      { id: "sell", symbol: "SOL", side: "sell", quantity: 100, price: 200, date: "2025-05-01" },
    ];

    const result = transactionSchema({ existing: broken }).safeParse(
      form({ symbol: "SOL", side: "buy", quantity: "60", price: "186", date: "2025-01-01" }),
    );

    expect(result.success).toBe(true);
  });

  it("still blocks a change that deepens an existing shortfall", () => {
    const broken: Transaction[] = [
      { id: "sell", symbol: "SOL", side: "sell", quantity: 100, price: 200, date: "2025-05-01" },
    ];

    const result = transactionSchema({ existing: broken, editingId: "sell" }).safeParse(
      form({ symbol: "SOL", side: "sell", quantity: "500", price: "200", date: "2025-05-01" }),
    );

    expect(result.success).toBe(false);
  });
});

describe("toTransaction", () => {
  it("normalises dates to UTC midnight so they line up with the candle grid", () => {
    expect(toTransaction(form({ date: "2025-03-12" })).date).toBe(
      "2025-03-12T00:00:00.000Z",
    );
  });

  it("drops blank optional fields rather than storing empty strings", () => {
    const tx = toTransaction(form({ fees: "", account: "  ", note: "" }));
    expect(tx.fees).toBeUndefined();
    expect(tx.account).toBeUndefined();
    expect(tx.note).toBeUndefined();
  });

  it("keeps the values that were filled in", () => {
    const tx = toTransaction(form({ fees: "1.50", account: " Brokerage ", note: " Trimmed " }));
    expect(tx.fees).toBe(1.5);
    expect(tx.account).toBe("Brokerage");
    expect(tx.note).toBe("Trimmed");
  });
});

describe("the holdings limit (decision 288)", () => {
  // NVDA and AAPL are open; a limit of 2 is full.
  const limited = (values: TransactionFormValues) =>
    transactionSchema({ existing: LOG, holdingLimit: 2 }).safeParse(values);

  it("refuses a buy that opens a new position past the limit", () => {
    const result = limited(form({ symbol: "MSFT" }));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["symbol"]);
  });

  it("lets a buy add to a position already held", () => {
    expect(limited(form({ symbol: "AAPL", date: "2025-08-01" })).success).toBe(true);
  });

  it("never stops a sell", () => {
    expect(limited(form({ side: "sell", quantity: "5", date: "2025-08-01" })).success).toBe(true);
  });

  it("has no limit when none is given", () => {
    expect(transactionSchema({ existing: LOG }).safeParse(form({ symbol: "MSFT" })).success).toBe(true);
  });
});
