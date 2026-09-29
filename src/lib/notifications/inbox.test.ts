import { describe, expect, it } from "vitest";
import {
  buildInbox,
  standingWarnings,
  type Broadcast,
  type StoredAlert,
} from "./inbox";

const alert = (id: string, at: number): StoredAlert => ({
  id,
  tone: "neutral",
  title: `Alert ${id}`,
  body: "…",
  at,
});

const broadcast = (id: string, publishedAt: string): Broadcast => ({
  id,
  title: `Notice ${id}`,
  body: "…",
  publishedAt,
});

describe("buildInbox", () => {
  it("interleaves alerts and broadcasts by time, newest first", () => {
    const inbox = buildInbox({
      alerts: [alert("a", 3_000), alert("b", 1_000)],
      broadcasts: [broadcast("n", new Date(2_000).toISOString())],
      warnings: [],
      readAt: 0,
    });

    expect(inbox.history.map((n) => n.id)).toEqual(["a", "n", "b"]);
  });

  it("counts only what arrived after the last visit", () => {
    const inbox = buildInbox({
      alerts: [alert("old", 1_000), alert("new", 9_000)],
      broadcasts: [],
      warnings: [],
      readAt: 5_000,
    });

    expect(inbox.unread).toBe(1);
  });

  /**
   * The rule the whole design hangs on. A badge that includes a standing
   * condition can never reach zero, and a badge that can never reach zero is
   * one the user stops seeing — at which point it has stopped working for the
   * alerts too, which are the ones that expire.
   */
  it("never counts a warning as unread", () => {
    const warnings = standingWarnings({
      synthetic: true,
      signedIn: false,
      authAvailable: true,
      alertsArmed: false,
    });

    const inbox = buildInbox({
      alerts: [],
      broadcasts: [],
      warnings,
      readAt: 0,
    });

    expect(warnings.length).toBeGreaterThan(0);
    expect(inbox.warnings).toHaveLength(warnings.length);
    expect(inbox.unread).toBe(0);
    expect(inbox.history).toEqual([]);
  });

  it("drops a broadcast with an unparseable date rather than floating it to the top", () => {
    const inbox = buildInbox({
      alerts: [alert("a", 1_000)],
      broadcasts: [broadcast("bad", "not a date")],
      warnings: [],
      readAt: 0,
    });

    // `NaN` sorts unpredictably and compares false against `readAt`, so a bad
    // timestamp would be both first in the list and permanently unread.
    expect(inbox.history.map((n) => n.id)).toEqual(["a"]);
    expect(inbox.unread).toBe(1);
  });

  it("is empty and quiet for someone with nothing", () => {
    const inbox = buildInbox({ alerts: [], broadcasts: [], warnings: [], readAt: 0 });
    expect(inbox).toEqual({ warnings: [], history: [], unread: 0 });
  });
});

describe("standingWarnings", () => {
  it("says nothing when every condition is fine", () => {
    expect(
      standingWarnings({
        synthetic: false,
        signedIn: true,
        authAvailable: true,
        alertsArmed: true,
      }),
    ).toEqual([]);
  });

  it("does not offer to sign in when there is nothing to sign in to", () => {
    // With no Supabase project configured, "your ledger is local" is simply
    // how ember works rather than something the user could change.
    const warnings = standingWarnings({
      synthetic: false,
      signedIn: false,
      authAvailable: false,
      alertsArmed: true,
    });

    expect(warnings).toEqual([]);
  });

  it("gives every warning somewhere to go", () => {
    const warnings = standingWarnings({
      synthetic: true,
      signedIn: false,
      authAvailable: true,
      alertsArmed: false,
    });

    // "No dead ends: every empty state and every error names the next action"
    // — CLAUDE.md §5. A warning that only tells you something is wrong is the
    // purest form of a dead end.
    for (const warning of warnings) {
      expect(warning.href, warning.id).toBeTruthy();
      expect(warning.action, warning.id).toBeTruthy();
    }
  });

  it("carries no timestamp, because a condition did not happen at a time", () => {
    const warnings = standingWarnings({
      synthetic: true,
      signedIn: true,
      authAvailable: true,
      alertsArmed: true,
    });

    for (const warning of warnings) expect(warning.at).toBe(0);
  });
});
