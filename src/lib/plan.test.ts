import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canUse,
  inFreeMarkets,
  PLAN_RULES,
  planFrom,
  rangeAllowed,
  subscriptionFrom,
  unlockedCalls,
} from "./plan";

/**
 * Two rules about money that should fail a build rather than a review.
 *
 * Deliberately not a general test of the plan module — `canUse` is a switch over a
 * table and testing that a table contains what it contains proves nothing. These
 * are the two places where getting it wrong would be both consequential and
 * silent.
 */

describe("the public argument stays public", () => {
  const src = (path: string) => readFileSync(join(process.cwd(), "src", path), "utf8");

  /**
   * The single most self-defeating change anyone could make to this product.
   *
   * The methodology page and the track record are how a reader checks whether any
   * of ember's claims hold (decision 051). Putting either behind a plan — or behind
   * a session — would mean the answer to "does this work" is available only to
   * people who already paid to find out.
   *
   * Asserted as an *absence of imports* rather than by rendering, because the
   * failure mode is somebody adding a gate, and an import is the first thing that
   * has to appear for a gate to exist.
   */
  it("neither screen can reach a plan gate at all", () => {
    for (const file of [
      "components/signals/methodology-screen.tsx",
      "components/signals/track-record-screen.tsx",
    ]) {
      const source = src(file);
      expect(source, `${file} imports the plan module`).not.toMatch(
        /from\s+["']@\/lib\/plan["']/,
      );
      expect(source, `${file} imports usePlan`).not.toMatch(/use-plan/);
      expect(source, `${file} imports an upsell`).not.toMatch(/plan\/upsell/);
    }
  });

  /** And the first-run gate lets a stranger reach both without a cookie. */
  it("both are exempt from the first-run redirect", () => {
    const proxy = src("proxy.ts");
    expect(proxy).toContain('"/signals/methodology"');
    expect(proxy).toContain('"/signals/track-record"');
  });
});

describe("a lapsed plan takes nothing away", () => {
  const DAY = 86_400_000;
  const now = Date.UTC(2026, 7, 17);

  it("reads an expired period as free rather than as broken", () => {
    expect(planFrom({ plan: "pro", period_end: new Date(now + DAY).toISOString() }, now))
      .toBe("pro");
    expect(planFrom({ plan: "pro", period_end: new Date(now - DAY).toISOString() }, now))
      .toBe("free");
  });

  /**
   * A plan granted by hand has no term, and must not be read as already expired.
   * This is the state every Pro account is in until a checkout exists, so getting
   * it wrong would mean the Pro path could never be exercised at all.
   */
  it("treats a plan with no period as current", () => {
    expect(planFrom({ plan: "pro", period_end: null }, now)).toBe("pro");
  });

  /** Every uncertainty resolves to free, never to Pro. */
  it("defaults to free for anything it cannot read", () => {
    expect(planFrom(null, now)).toBe("free");
    expect(planFrom(undefined, now)).toBe("free");
    expect(planFrom({}, now)).toBe("free");
    expect(planFrom({ plan: "enterprise" }, now)).toBe("free");
  });

  /**
   * Free is a taste, not nothing. If this ever reads 0, a free reader opens
   * Signals to a wall of locks and concludes the app is broken.
   */
  it("never leaves a free reader with nothing", () => {
    expect(PLAN_RULES.free.calls).toBeGreaterThan(0);
    expect(PLAN_RULES.free.holdings).toBeGreaterThan(0);
    expect(canUse("all-calls", "free")).toBe(false);
    expect(canUse("all-calls", "pro")).toBe(true);
  });
});

describe("which calls a plan sees in full", () => {
  const ranked = ["7203", "AAPL", "EURUSD", "BTC", "MSFT", "NVDA", "ETH"].map((symbol) => ({ symbol }));
  const free = new Set(["AAPL", "BTC", "MSFT", "NVDA", "ETH"]);
  const isFree = (s: string) => free.has(s);

  it("gives Pro every call", () => {
    expect(unlockedCalls("pro", ranked, new Set(["AAPL"]), isFree)).toBeNull();
  });

  it("gives free the strongest that match the profile, on free markets only", () => {
    const actionable = new Set(["7203", "AAPL", "EURUSD", "BTC", "NVDA", "ETH"]);
    // 7203 and EURUSD rank higher but are outside free's markets; MSFT doesn't match.
    expect([...unlockedCalls("free", ranked, actionable, isFree)!]).toEqual(["AAPL", "BTC", "NVDA"]);
  });

  it("never unlocks a read that doesn't match the profile", () => {
    expect(unlockedCalls("free", ranked, new Set(), isFree)!.size).toBe(0);
  });

  it("covers US stocks and crypto, and nothing else", () => {
    expect(inFreeMarkets({ market: "equity", exchange: "XNYS" })).toBe(true);
    expect(inFreeMarkets({ market: "crypto" })).toBe(true);
    expect(inFreeMarkets({ market: "equity", exchange: "XLON" })).toBe(false);
    expect(inFreeMarkets({ market: "equity", exchange: "XNSA" })).toBe(false);
    expect(inFreeMarkets({ market: "fx" })).toBe(false);
  });

  it("charts the last month on free and everything on Pro", () => {
    expect(rangeAllowed("1M", "free")).toBe(true);
    expect(rangeAllowed("1Y", "free")).toBe(false);
    expect(rangeAllowed("ALL", "pro")).toBe(true);
  });
});

describe("what the plan page says", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  const DAY = 86_400_000;
  const iso = (t: number) => new Date(t).toISOString();

  it("agrees with the gate on who is Pro", () => {
    for (const row of [
      null,
      { plan: "free" },
      { plan: "pro", period_end: null },
      { plan: "pro", period_end: iso(now + DAY) },
      { plan: "pro", period_end: iso(now - DAY) },
    ]) {
      const active = subscriptionFrom(row, now).status === "active";
      expect(active).toBe(planFrom(row, now) === "pro");
    }
  });

  it("says when Pro ended, rather than reading a lapse as never having had it", () => {
    expect(subscriptionFrom({ plan: "pro", period_end: iso(now - DAY) }, now)).toEqual({
      status: "lapsed",
      endedAt: now - DAY,
    });
  });

  it("renews only with a period end and no cancellation", () => {
    const end = iso(now + 30 * DAY);
    const at = (row: Parameters<typeof subscriptionFrom>[0]) => {
      const sub = subscriptionFrom(row, now);
      return sub.status === "active" ? sub.renews : null;
    };
    expect(at({ plan: "pro", period_end: end, billing: "monthly" })).toBe(true);
    expect(at({ plan: "pro", period_end: end, cancel_at_period_end: true })).toBe(false);
    // Granted by hand: nothing to renew.
    expect(at({ plan: "pro", period_end: null })).toBe(false);
  });

  it("ignores a billing value it does not know", () => {
    const sub = subscriptionFrom({ plan: "pro", period_end: null, billing: "weekly" }, now);
    expect(sub.status === "active" && sub.billing).toBeNull();
  });
});
