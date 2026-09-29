import type { MarketEvent } from "@/lib/market/calendar";
import { hashString, mulberry32 } from "@/lib/market/random";
import { instrumentsIn } from "@/lib/market/universe";
import { easternTimestamp, firstFriday, nextWeekday } from "./calendar-dates";

const DAY = 86_400_000;
/** How far either side of now to generate. Comfortably covers a 72h window. */
const SPAN_DAYS = 14;

/**
 * Scheduled releases the execution window has to route around.
 *
 * Real dates follow real rules, so these are generated from those rules
 * rather than hard-coded: US CPI lands mid-month, payrolls on the first
 * Friday, the FOMC roughly every seven weeks. Earnings are seeded per company
 * within each quarter.
 *
 * Blackout widths differ by kind on purpose. A CPI print is violent for
 * twenty minutes and then over; an earnings release lands after the close and
 * the damage shows up in the next morning's gap, which is why its trailing
 * blackout runs overnight.
 */
export function generateEvents(now: number): MarketEvent[] {
  const events: MarketEvent[] = [];
  const from = now - SPAN_DAYS * DAY;
  const to = now + SPAN_DAYS * DAY;

  const start = new Date(from);
  const end = new Date(to);

  // Walk the months the span touches, plus one either side for safety.
  for (
    let year = start.getUTCFullYear(), month = start.getUTCMonth() - 1;
    year < end.getUTCFullYear() ||
    (year === end.getUTCFullYear() && month <= end.getUTCMonth() + 1);
    month++
  ) {
    if (month > 11) {
      month = 0;
      year++;
    }
    if (month < 0) {
      month = 11;
      year--;
    }

    // CPI — mid-month, 08:30 ET, pushed off a weekend.
    const cpi = nextWeekday(easternTimestamp(year, month, 13, 8, 30));
    events.push({
      id: `cpi-${year}-${month}`,
      kind: "cpi",
      at: cpi,
      label: "US CPI",
      symbols: [],
      markets: ["equity", "fx", "crypto"],
      blackoutHoursBefore: 2,
      blackoutHoursAfter: 1,
    });

    // Payrolls — first Friday, 08:30 ET.
    events.push({
      id: `nfp-${year}-${month}`,
      kind: "nfp",
      at: firstFriday(year, month),
      label: "US payrolls",
      symbols: [],
      markets: ["equity", "fx"],
      blackoutHoursBefore: 2,
      blackoutHoursAfter: 1,
    });
  }

  // FOMC — eight meetings a year, so roughly every seven weeks. Anchored to a
  // fixed reference so the schedule doesn't shift as `now` moves.
  const fomcAnchor = Date.UTC(2026, 0, 28);
  const cyclesSinceAnchor = Math.floor((from - fomcAnchor) / (49 * DAY));
  for (let i = cyclesSinceAnchor; i <= cyclesSinceAnchor + 2; i++) {
    const at = fomcAnchor + i * 49 * DAY;
    const date = new Date(at);
    events.push({
      id: `fomc-${i}`,
      kind: "fomc",
      at: easternTimestamp(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        14,
        0,
      ),
      label: "FOMC decision",
      symbols: [],
      markets: ["equity", "fx", "crypto"],
      blackoutHoursBefore: 3,
      blackoutHoursAfter: 2,
    });
  }

  // Earnings — quarterly, seeded per company, after the close.
  for (const instrument of instrumentsIn("equity")) {
    const rng = mulberry32(hashString(`${instrument.symbol}:earnings:v1`));
    // Where in the reporting month this company lands, and which month of the
    // quarter — real reporters are consistent about both year to year.
    const dayInMonth = 4 + Math.floor(rng() * 24);
    const monthOffset = Math.floor(rng() * 3);

    for (let quarter = -1; quarter <= 5; quarter++) {
      const base = new Date(now);
      const month = Math.floor(base.getUTCMonth() / 3) * 3 + quarter * 3 + monthOffset;
      const at = nextWeekday(
        easternTimestamp(base.getUTCFullYear(), month, dayInMonth, 16, 5),
      );
      if (at < from || at > to) continue;

      events.push({
        id: `earnings-${instrument.symbol}-${at}`,
        kind: "earnings",
        at,
        label: `${instrument.name} earnings`,
        symbols: [instrument.symbol],
        markets: ["equity"],
        blackoutHoursBefore: 4,
        // Released after the close; the move shows up in the next open.
        blackoutHoursAfter: 18,
      });
    }
  }

  return events
    .filter((e) => e.at >= from && e.at <= to)
    .sort((a, b) => a.at - b.at);
}
