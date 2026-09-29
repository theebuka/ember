import type { MarketKind } from "@/lib/api/types";

/**
 * Scheduled events that an execution should not be routed into.
 *
 * The reasoning is narrow and worth stating: none of the strategies in this
 * engine claim to predict an earnings surprise or a CPI print. Holding
 * through one is a position decision the user has already made; *entering*
 * into one minutes beforehand is taking an unrelated coin-flip on top of the
 * signal, at the worst spread of the week. So the window model excludes the
 * hours around a scheduled release rather than scoring them low.
 */

export type EventKind =
  | "earnings"
  | "cpi"
  | "fomc"
  | "nfp"
  | "central-bank"
  | "unlock";

export interface MarketEvent {
  id: string;
  kind: EventKind;
  /** Epoch millis of the scheduled release. */
  at: number;
  label: string;
  /** Symbols directly affected. Empty means the whole market. */
  symbols: string[];
  markets: MarketKind[];
  /** Hours either side to keep clear. */
  blackoutHoursBefore: number;
  blackoutHoursAfter: number;
}

export const EVENT_LABELS: Record<EventKind, string> = {
  earnings: "Earnings",
  cpi: "CPI release",
  fomc: "FOMC decision",
  nfp: "Payrolls",
  "central-bank": "Central bank decision",
  unlock: "Token unlock",
};

/**
 * How much of the window an event removes, at a given instant.
 *
 * Returns 1 for clear, 0 inside the blackout, and a ramp at the edges — the
 * risk of being caught by a release doesn't switch on at a fixed boundary,
 * and a hard step would make the window band look mechanical where it should
 * look considered.
 */
export function eventMask(
  at: number,
  symbol: string,
  market: MarketKind,
  events: readonly MarketEvent[],
): number {
  let mask = 1;

  for (const event of events) {
    const applies =
      (event.symbols.length === 0 || event.symbols.includes(symbol)) &&
      event.markets.includes(market);
    if (!applies) continue;

    const hoursUntil = (event.at - at) / 3_600_000;

    if (hoursUntil >= 0) {
      if (hoursUntil <= event.blackoutHoursBefore) {
        mask = 0;
      } else if (hoursUntil <= event.blackoutHoursBefore * 2) {
        // Ramp back in over an equal span before the blackout starts.
        const ratio =
          (hoursUntil - event.blackoutHoursBefore) / event.blackoutHoursBefore;
        mask = Math.min(mask, ratio);
      }
    } else {
      const hoursSince = -hoursUntil;
      if (hoursSince <= event.blackoutHoursAfter) {
        mask = 0;
      } else if (hoursSince <= event.blackoutHoursAfter * 2) {
        const ratio =
          (hoursSince - event.blackoutHoursAfter) / event.blackoutHoursAfter;
        mask = Math.min(mask, ratio);
      }
    }
  }

  return mask;
}

/** Events falling inside a span, for annotating the window band. */
export function eventsWithin(
  from: number,
  to: number,
  symbol: string,
  market: MarketKind,
  events: readonly MarketEvent[],
): MarketEvent[] {
  return events
    .filter(
      (e) =>
        e.at >= from &&
        e.at <= to &&
        e.markets.includes(market) &&
        (e.symbols.length === 0 || e.symbols.includes(symbol)),
    )
    .sort((a, b) => a.at - b.at);
}
