import { describe, expect, it } from "vitest";
import type { Transaction } from "@/lib/api/types";
import {
  pickNewer,
  reconcileTransactions,
  type RemoteTransaction,
} from "./merge";

/**
 * This is the only code in ember that can destroy something the user typed.
 * Everything else recomputes from the ledger; this decides what the ledger is.
 */

const tx = (id: string, over: Partial<Transaction> = {}): Transaction => ({
  id,
  symbol: "AAPL",
  side: "buy",
  quantity: 10,
  price: 200,
  date: "2026-03-01",
  ...over,
});

const remote = (
  id: string,
  over: Partial<RemoteTransaction> = {},
): RemoteTransaction => ({
  ...tx(id),
  updatedAt: 1_000,
  deletedAt: null,
  ...over,
});

const ids = (rows: readonly { id: string }[]) => rows.map((r) => r.id).sort();

describe("reconcileTransactions", () => {
  it("pushes a row the server has never seen", () => {
    const result = reconcileTransactions({
      local: [tx("a", { updatedAt: 5_000 })],
      remote: [],
      tombstones: [],
    });

    expect(ids(result.next)).toEqual(["a"]);
    expect(ids(result.push)).toEqual(["a"]);
    expect(result.publishDeletes).toEqual([]);
  });

  it("pulls a row this device has never seen", () => {
    const result = reconcileTransactions({
      local: [],
      remote: [remote("b")],
      tombstones: [],
    });

    expect(ids(result.next)).toEqual(["b"]);
    expect(result.push).toEqual([]);
  });

  it("keeps both sides' rows rather than choosing a winner", () => {
    const result = reconcileTransactions({
      local: [tx("a", { updatedAt: 5_000 })],
      remote: [remote("b")],
      tombstones: [],
    });

    // The failure this guards against is whole-document last-write-wins,
    // where logging a trade on a phone silently discards the ones logged on a
    // laptop — and the survivor looks perfectly coherent, so nobody notices.
    expect(ids(result.next)).toEqual(["a", "b"]);
  });

  it("resolves an edit conflict in favour of the newer write", () => {
    const result = reconcileTransactions({
      local: [tx("a", { updatedAt: 9_000, quantity: 99 })],
      remote: [remote("a", { updatedAt: 1_000, quantity: 1 })],
      tombstones: [],
    });

    expect(result.next[0].quantity).toBe(99);
    expect(ids(result.push)).toEqual(["a"]);
  });

  it("resolves the other direction too, and pushes nothing", () => {
    const result = reconcileTransactions({
      local: [tx("a", { updatedAt: 1_000, quantity: 99 })],
      remote: [remote("a", { updatedAt: 9_000, quantity: 1 })],
      tombstones: [],
    });

    expect(result.next[0].quantity).toBe(1);
    expect(result.push).toEqual([]);
  });

  it("gives ties to the server, so two devices cannot disagree forever", () => {
    const result = reconcileTransactions({
      local: [tx("a", { updatedAt: 7_000, quantity: 99 })],
      remote: [remote("a", { updatedAt: 7_000, quantity: 1 })],
      tombstones: [],
    });

    expect(result.next[0].quantity).toBe(1);
  });

  it("treats a row with no timestamp as the oldest thing there is", () => {
    const result = reconcileTransactions({
      local: [tx("a", { quantity: 99 })],
      remote: [remote("a", { updatedAt: 1, quantity: 1 })],
      tombstones: [],
    });

    expect(result.next[0].quantity).toBe(1);
  });

  it("publishes a local deletion instead of re-pushing the row", () => {
    const result = reconcileTransactions({
      local: [],
      remote: [remote("a", { updatedAt: 1_000 })],
      tombstones: [{ id: "a", at: 5_000 }],
    });

    expect(result.next).toEqual([]);
    expect(result.publishDeletes).toEqual([{ id: "a", at: 5_000 }]);
  });

  it("does not resurrect a row the server deleted", () => {
    // The case tombstones exist for: without them, a local row the server has
    // soft-deleted looks like a row the server hasn't been told about.
    const result = reconcileTransactions({
      local: [tx("a", { updatedAt: 1_000 })],
      remote: [remote("a", { updatedAt: 5_000, deletedAt: 5_000 })],
      tombstones: [],
    });

    expect(result.next).toEqual([]);
    expect(result.push).toEqual([]);
  });

  it("lets a newer edit beat an older deletion", () => {
    const result = reconcileTransactions({
      local: [tx("a", { updatedAt: 9_000, quantity: 42 })],
      remote: [remote("a", { updatedAt: 5_000, deletedAt: 5_000 })],
      tombstones: [],
    });

    expect(result.next[0].quantity).toBe(42);
    expect(ids(result.push)).toEqual(["a"]);
  });

  it("forgets a tombstone the server already records", () => {
    const result = reconcileTransactions({
      local: [],
      remote: [remote("a", { updatedAt: 5_000, deletedAt: 5_000 })],
      tombstones: [{ id: "a", at: 1_000 }],
    });

    // Without this the list grows forever, and a device that syncs daily for
    // a year republishes a year of deletions on every pass.
    expect(result.settledTombstones).toEqual(["a"]);
  });

  it("forgets a tombstone for a row the server has never heard of", () => {
    const result = reconcileTransactions({
      local: [],
      remote: [],
      tombstones: [{ id: "ghost", at: 1_000 }],
    });

    expect(result.settledTombstones).toEqual(["ghost"]);
    expect(result.publishDeletes).toEqual([]);
  });

  it("forgets a tombstone that a newer remote edit overruled", () => {
    const result = reconcileTransactions({
      local: [],
      remote: [remote("a", { updatedAt: 9_000 })],
      tombstones: [{ id: "a", at: 1_000 }],
    });

    expect(ids(result.next)).toEqual(["a"]);
    // Kept, it would be republished every pass and would eventually win a tie.
    expect(result.settledTombstones).toEqual(["a"]);
  });

  it("converges to byte-identical state from either direction", () => {
    const a = tx("a", { updatedAt: 3_000, date: "2026-02-01" });
    const b = tx("b", { updatedAt: 2_000, date: "2026-01-01" });

    const one = reconcileTransactions({
      local: [a],
      remote: [{ ...b, updatedAt: 2_000, deletedAt: null }],
      tombstones: [],
    });
    const two = reconcileTransactions({
      local: [b],
      remote: [{ ...a, updatedAt: 3_000, deletedAt: null }],
      tombstones: [],
    });

    // Same set is not enough: two devices holding the same rows in a different
    // order would see a change on every sync and write to each other forever.
    expect(one.next.map((r) => r.id)).toEqual(two.next.map((r) => r.id));
  });

  it("strips columns that only exist on the wire", () => {
    const result = reconcileTransactions({
      local: [],
      remote: [remote("a")],
      tombstones: [],
    });

    expect(result.next[0]).not.toHaveProperty("deletedAt");
  });

  it("is idempotent — a second pass has nothing left to do", () => {
    const first = reconcileTransactions({
      local: [tx("a", { updatedAt: 5_000 })],
      remote: [remote("b", { updatedAt: 2_000 })],
      tombstones: [],
    });

    const second = reconcileTransactions({
      local: first.next,
      remote: [
        remote("a", { updatedAt: 5_000 }),
        remote("b", { updatedAt: 2_000 }),
      ],
      tombstones: [],
    });

    expect(second.push).toEqual([]);
    expect(second.publishDeletes).toEqual([]);
    expect(ids(second.next)).toEqual(["a", "b"]);
  });
});

describe("pickNewer", () => {
  it("keeps local when there is nothing on the server", () => {
    expect(pickNewer({ local: 1, localAt: 0, remote: null })).toEqual({
      value: 1,
      source: "local",
    });
  });

  it("prefers the server on a tie, like the row merge", () => {
    expect(pickNewer({ local: 1, localAt: 5, remote: { value: 2, at: 5 } })).toEqual({
      value: 2,
      source: "remote",
    });
  });

  it("keeps a newer local value", () => {
    expect(pickNewer({ local: 1, localAt: 9, remote: { value: 2, at: 5 } })).toEqual({
      value: 1,
      source: "local",
    });
  });

  /**
   * The one that changed the signature.
   *
   * `null` is a *value* on the watchlist — decision 023's "following
   * everything" sentinel — not an absence. Read as an absence, a server row
   * saying "everything" loses to a stale local list, which is then pushed back
   * up: the user's choice on another device is silently overwritten by the
   * device that happens to sync next.
   */
  it("tells a server row holding null from no server row at all", () => {
    expect(
      pickNewer<string[] | null>({
        local: ["AAPL"],
        localAt: 1,
        remote: { value: null, at: 9 },
      }),
    ).toEqual({ value: null, source: "remote" });

    expect(
      pickNewer<string[] | null>({ local: ["AAPL"], localAt: 1, remote: null }),
    ).toEqual({ value: ["AAPL"], source: "local" });
  });
});
