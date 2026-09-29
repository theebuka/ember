import { afterEach, describe, expect, it, vi } from "vitest";
import { cached, clearCache } from "./cache";

/**
 * The cache is load-bearing for every live request, and it had no tests.
 *
 * Three of its properties are the difference between a usable app and a
 * minute-long page load against a free tier — stale-while-revalidate, single
 * flight, and handing the loader what is already stored — and each of them is
 * the kind of thing that keeps working right up until somebody reorders two
 * lines. The accumulating news feed depends on all three at once.
 *
 * Namespaces here are prefixed `test-` because the disk tier is real: a flush
 * writes `.cache/market/<namespace>.json`, which is gitignored, and using
 * distinctive names keeps test writes from colliding with a warm cache.
 */

const FRESH = { ttl: 60, maxAge: 600 };

afterEach(() => {
  clearCache();
  vi.useRealTimers();
});

describe("cached", () => {
  it("calls the loader once and serves the stored value after", async () => {
    const loader = vi.fn().mockResolvedValue("first");

    expect(await cached("test-fresh", "k", FRESH, loader)).toBe("first");
    expect(await cached("test-fresh", "k", FRESH, loader)).toBe("first");

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("hands the loader what is already stored", async () => {
    const seen: Array<string | undefined> = [];

    await cached<string>("test-previous", "k", { ttl: 0, maxAge: 600 }, async (previous) => {
      seen.push(previous);
      return "one";
    });
    await cached<string>("test-previous", "k", { ttl: 0, maxAge: 600 }, async (previous) => {
      seen.push(previous);
      return "two";
    });

    // `undefined` on the first pass, the stored value on the second. This is
    // what lets the news feed add a slice of company headlines to the pool
    // instead of replacing it.
    expect(seen).toEqual([undefined, "one"]);
  });

  it("accumulates across refreshes, one reader behind", async () => {
    const options = { ttl: 0, maxAge: 600 };
    const append = (item: string) => async (previous: string[] | undefined) =>
      [...(previous ?? []), item];

    // First call is a cold miss, so it blocks and returns its own result.
    expect(await cached("test-accumulate", "k", options, append("a"))).toEqual(["a"]);

    /**
     * Every call after that is a stale hit: it is served what is stored and the
     * append happens *behind* the response. So a reader always sees the pool as
     * of the previous refresh, never their own.
     *
     * That is the property the news feed is built on and it is worth stating
     * plainly, because the naive expectation — that asking three times gets you
     * three slices — is wrong and would look like a bug. The pool grows for the
     * next reader, which is what makes a ten-minute TTL over a twenty-second
     * upstream cost nobody anything.
     */
    /**
     * Settled between steps, on purpose.
     *
     * A background refresh is in flight when the stale value is returned, and
     * `cached` collapses a second miss into that same flight — so firing the
     * next call before the previous refresh has stored simply joins it and the
     * append never happens. Two earlier versions of this test raced exactly
     * that and read like a bug in the cache.
     */
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

    expect(await cached("test-accumulate", "k", options, append("b"))).toEqual(["a"]);
    await settle();
    expect(await cached("test-accumulate", "k", options, append("c"))).toEqual(["a", "b"]);
    await settle();

    // A live TTL, so this reports what is stored without invoking the loader —
    // which is what "did the background refresh land" actually means.
    expect(
      await cached("test-accumulate", "k", { ttl: 600, maxAge: 600 }, append("unused")),
    ).toEqual(["a", "b", "c"]);
  });

  it("serves a stale value immediately and refreshes behind it", async () => {
    let resolveRefresh: (value: string) => void = () => {};
    const loader = vi
      .fn()
      .mockResolvedValueOnce("first")
      .mockImplementationOnce(
        () => new Promise<string>((resolve) => (resolveRefresh = resolve)),
      );

    const options = { ttl: 0, maxAge: 600 };
    expect(await cached("test-swr", "k", options, loader)).toBe("first");

    // Stale, and the refresh is deliberately left hanging. The point is that
    // the caller does not wait for it — that is the whole reason a ten-minute
    // TTL on a twenty-second upstream is survivable.
    expect(await cached("test-swr", "k", options, loader)).toBe("first");
    expect(loader).toHaveBeenCalledTimes(2);

    resolveRefresh("second");
    await vi.waitFor(async () => {
      expect(await cached("test-swr", "k", options, loader)).toBe("second");
    });
  });

  it("blocks rather than serving something past maxAge", async () => {
    const loader = vi.fn().mockResolvedValueOnce("stale").mockResolvedValueOnce("fresh");

    // `maxAge: 0` makes everything already too old to serve, which is the
    // condition this guard exists for: a provider that has been down for a day
    // must not keep answering under a chart labelled live.
    const options = { ttl: 0, maxAge: 0 };
    expect(await cached("test-maxage", "k", options, loader)).toBe("stale");
    expect(await cached("test-maxage", "k", options, loader)).toBe("fresh");
  });

  it("collapses concurrent misses into one upstream call", async () => {
    let release: (value: string) => void = () => {};
    const loader = vi
      .fn()
      .mockImplementation(() => new Promise<string>((resolve) => (release = resolve)));

    const all = Promise.all([
      cached("test-flight", "k", FRESH, loader),
      cached("test-flight", "k", FRESH, loader),
      cached("test-flight", "k", FRESH, loader),
    ]);

    release("once");
    expect(await all).toEqual(["once", "once", "once"]);
    // Ten components asking for AAPL on one page load is one Yahoo request.
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("keeps a stale value when a background refresh throws", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce("good")
      .mockRejectedValue(new Error("upstream down"));

    const options = { ttl: 0, maxAge: 600 };
    expect(await cached("test-throw", "k", options, loader)).toBe("good");
    // An upstream blip must not blank a chart, so the rejection is swallowed
    // and the stored value stands.
    expect(await cached("test-throw", "k", options, loader)).toBe("good");
  });

  it("propagates a throw when there is nothing to serve", async () => {
    const loader = vi.fn().mockRejectedValue(new Error("upstream down"));
    await expect(cached("test-cold-throw", "k", FRESH, loader)).rejects.toThrow(
      "upstream down",
    );
  });
});
