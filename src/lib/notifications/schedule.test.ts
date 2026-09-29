import { describe, expect, it } from "vitest";
import type { Finding } from "@/lib/api/client";
import type { AdviceAction } from "@/lib/api/types";
import type { RiskTrigger } from "@/lib/signals/exposure";
import type { HandledCall } from "@/store/use-advice-actions";
import type { AlertRecord } from "@/store/use-alert-log";
import {
  GRACE_MS,
  MAX_TIMER_MS,
  planAlerts,
  RISK_REPEAT_MS,
  timerDelay,
} from "./schedule";

const NOW = Date.UTC(2026, 7, 13, 12, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Only the fields `planAlerts` reads. The real `Finding` carries a full
 * assessment with a 72-point curve; building one here would test the fixture.
 */
function opportunity({
  symbol,
  action = "buy",
  opensAt = NOW + HOUR,
  closesAt = NOW + 6 * HOUR,
  hasWindow = true,
}: {
  symbol: string;
  action?: AdviceAction;
  opensAt?: number;
  closesAt?: number;
  hasWindow?: boolean;
}): Finding {
  return {
    id: `opportunity:${symbol}`,
    kind: "opportunity",
    symbol,
    createdAt: NOW,
    risk: null,
    assessment: { symbol, action, window: { opensAt, closesAt, hasWindow } },
  } as unknown as Finding;
}

function risk({
  symbol,
  trigger = "stop-breached",
  createdAt = NOW,
}: {
  symbol: string;
  trigger?: RiskTrigger;
  createdAt?: number;
}): Finding {
  return {
    id: `risk:${symbol}`,
    kind: "risk",
    symbol,
    createdAt,
    risk: { trigger },
    assessment: { symbol },
  } as unknown as Finding;
}

const plan = (
  findings: Finding[],
  options: {
    handled?: Record<string, HandledCall>;
    notified?: Record<string, AlertRecord>;
    now?: number;
    opportunities?: boolean;
    risks?: boolean;
  } = {},
) =>
  planAlerts({
    findings,
    handled: options.handled ?? {},
    notified: options.notified ?? {},
    now: options.now ?? NOW,
    opportunities: options.opportunities ?? true,
    risks: options.risks ?? true,
  });

describe("planAlerts — opportunities", () => {
  it("schedules a window that opens later", () => {
    const result = plan([opportunity({ symbol: "NVDA", opensAt: NOW + 3 * HOUR })]);
    expect(result.upcoming.map((a) => a.symbol)).toEqual(["NVDA"]);
    expect(result.due).toEqual([]);
    expect(result.stale).toEqual([]);
  });

  it("fires a window that opened inside the grace period", () => {
    const result = plan([opportunity({ symbol: "NVDA", opensAt: NOW - 5 * MINUTE })]);
    expect(result.due.map((a) => a.symbol)).toEqual(["NVDA"]);
    expect(result.upcoming).toEqual([]);
  });

  /**
   * The rule that stops a morning's first launch producing a pile of
   * notifications about windows that opened overnight.
   */
  it("records but never fires a window that opened long ago", () => {
    const result = plan([
      opportunity({ symbol: "NVDA", opensAt: NOW - GRACE_MS - MINUTE }),
    ]);
    expect(result.stale.map((a) => a.symbol)).toEqual(["NVDA"]);
    expect(result.due).toEqual([]);
    expect(result.upcoming).toEqual([]);
  });

  it("ignores a window that has already closed", () => {
    const result = plan([
      opportunity({ symbol: "NVDA", opensAt: NOW - 5 * HOUR, closesAt: NOW - HOUR }),
    ]);
    expect(result).toEqual({ upcoming: [], due: [], stale: [] });
  });

  it("ignores a read with no window at all", () => {
    const result = plan([opportunity({ symbol: "NVDA", hasWindow: false })]);
    expect(result.upcoming).toEqual([]);
  });

  it("stays quiet about a call the user already executed", () => {
    const result = plan([opportunity({ symbol: "NVDA", action: "buy" })], {
      handled: {
        "opportunity:NVDA": {
          kind: "executed",
          signature: "buy",
          at: NOW,
          until: NOW + 6 * HOUR,
        },
      },
    });
    expect(result.upcoming).toEqual([]);
  });

  /** A flipped read is a different call, and it deserves its own alert. */
  it("still alerts when the action has changed since the user handled it", () => {
    const result = plan([opportunity({ symbol: "NVDA", action: "sell" })], {
      handled: {
        "opportunity:NVDA": {
          kind: "dismissed",
          signature: "buy",
          at: NOW,
          until: NOW + 6 * HOUR,
        },
      },
    });
    expect(result.upcoming.map((a) => a.symbol)).toEqual(["NVDA"]);
  });

  it("does not alert twice about the same call", () => {
    const result = plan([opportunity({ symbol: "NVDA", action: "buy" })], {
      notified: {
        "opportunity:NVDA": { signature: "buy", at: NOW, until: NOW + 6 * HOUR },
      },
    });
    expect(result.upcoming).toEqual([]);
  });

  it("alerts again once the previous record has expired with its window", () => {
    const result = plan([opportunity({ symbol: "NVDA", action: "buy" })], {
      notified: {
        "opportunity:NVDA": { signature: "buy", at: NOW - 9 * HOUR, until: NOW - HOUR },
      },
    });
    expect(result.upcoming.map((a) => a.symbol)).toEqual(["NVDA"]);
  });

  it("orders upcoming alerts soonest first", () => {
    const result = plan([
      opportunity({ symbol: "LATE", opensAt: NOW + 5 * HOUR }),
      opportunity({ symbol: "SOON", opensAt: NOW + HOUR }),
      opportunity({ symbol: "MID", opensAt: NOW + 2 * HOUR }),
    ]);
    expect(result.upcoming.map((a) => a.symbol)).toEqual(["SOON", "MID", "LATE"]);
  });

  it("carries the window's close as the record's expiry", () => {
    const closesAt = NOW + 9 * HOUR;
    const result = plan([opportunity({ symbol: "NVDA", closesAt })]);
    expect(result.upcoming[0].until).toBe(closesAt);
  });
});

describe("planAlerts — risks", () => {
  /**
   * The structural change phase 15 needed. A breached stop has no `opensAt` to
   * wait for and nothing to route into a liquidity crest, because the position
   * is already on.
   */
  it("fires a risk immediately, with no window to wait for", () => {
    const result = plan([risk({ symbol: "TSLA" })]);
    expect(result.due.map((a) => a.symbol)).toEqual(["TSLA"]);
    expect(result.upcoming).toEqual([]);
  });

  it("suppresses a repeat of the same trigger for half a day", () => {
    const result = plan([risk({ symbol: "TSLA", trigger: "stop-breached" })], {
      notified: {
        "risk:TSLA": {
          signature: "stop-breached",
          at: NOW - HOUR,
          until: NOW + RISK_REPEAT_MS - HOUR,
        },
      },
    });
    expect(result.due).toEqual([]);
  });

  it("alerts again when a different trigger fires on the same position", () => {
    const result = plan([risk({ symbol: "TSLA", trigger: "regime-flip" })], {
      notified: {
        "risk:TSLA": {
          signature: "stop-breached",
          at: NOW - HOUR,
          until: NOW + RISK_REPEAT_MS,
        },
      },
    });
    expect(result.due.map((a) => a.signature)).toEqual(["regime-flip"]);
  });

  /**
   * The bug the `kind` key exists to prevent. Both stores keyed on the bare
   * symbol until phase 15, so whichever of these fired second was silently
   * swallowed by the other's log entry.
   */
  it("keeps a risk and an opportunity on the same symbol independent", () => {
    const result = plan([risk({ symbol: "NVDA" }), opportunity({ symbol: "NVDA" })], {
      notified: {
        "opportunity:NVDA": { signature: "buy", at: NOW, until: NOW + 6 * HOUR },
      },
    });
    expect(result.due.map((a) => a.id)).toEqual(["risk:NVDA"]);
    expect(result.upcoming).toEqual([]);
  });

  it("delivers risk before opportunity when both are due", () => {
    const result = plan([
      opportunity({ symbol: "AAPL", opensAt: NOW - 9 * MINUTE }),
      risk({ symbol: "TSLA" }),
    ]);
    expect(result.due.map((a) => a.kind)).toEqual(["risk", "opportunity"]);
  });

  it("respects each switch independently", () => {
    const findings = [risk({ symbol: "TSLA" }), opportunity({ symbol: "AAPL" })];

    expect(plan(findings, { risks: false }).due).toEqual([]);
    expect(
      plan(findings, { opportunities: false }).due.map((a) => a.kind),
    ).toEqual(["risk"]);
    expect(plan(findings, { opportunities: false }).upcoming).toEqual([]);
  });

  it("never fires a risk detected long ago without recording it", () => {
    const result = plan([
      risk({ symbol: "TSLA", createdAt: NOW - GRACE_MS - MINUTE }),
    ]);
    expect(result.stale.map((a) => a.symbol)).toEqual(["TSLA"]);
    expect(result.due).toEqual([]);
  });
});

describe("timerDelay", () => {
  it("waits exactly until a near window opens", () => {
    const result = plan([opportunity({ symbol: "NVDA", opensAt: NOW + 90_000 })]);
    expect(timerDelay(result, NOW)).toBe(90_000);
  });

  /**
   * A distant window must not become one long `setTimeout`. Sleep, throttling
   * and clock corrections all break a multi-hour timer silently.
   */
  it("caps a distant window at the re-evaluation interval", () => {
    const result = plan([opportunity({ symbol: "NVDA", opensAt: NOW + 40 * HOUR })]);
    expect(timerDelay(result, NOW)).toBe(MAX_TIMER_MS);
  });

  it("never returns a negative delay", () => {
    const result = plan([opportunity({ symbol: "NVDA", opensAt: NOW + MINUTE })]);
    expect(timerDelay(result, NOW + 5 * MINUTE)).toBe(0);
  });

  it("returns null when there is nothing to wait for", () => {
    expect(timerDelay({ upcoming: [], due: [], stale: [] }, NOW)).toBeNull();
  });
});
