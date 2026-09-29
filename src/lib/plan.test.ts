import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canUse, findingLimit, planFrom } from "./plan";

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
   * The cap shortens the answer; it never removes the engine's view. If this ever
   * reads 0, a free user opens Home to an empty inbox and concludes the app is
   * broken rather than that it is free.
   */
  it("never leaves a free reader with nothing", () => {
    expect(findingLimit("free")).toBeGreaterThan(0);
    expect(findingLimit("pro")).toBeNull();
    expect(canUse("unlimited-findings", "free")).toBe(false);
    expect(canUse("unlimited-findings", "pro")).toBe(true);
  });
});
