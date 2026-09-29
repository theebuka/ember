import { zonedTime } from "@/lib/market/sessions";

const HOUR = 3_600_000;
const DAY = 86_400_000;

/**
 * An epoch timestamp for a wall-clock moment in New York.
 *
 * Scheduled US releases are defined in Eastern time — CPI at 08:30, the FOMC
 * statement at 14:00 — and the UTC offset for those shifts by an hour twice a
 * year. Guessing an offset would silently misplace every blackout for eight
 * months of the year, so this guesses once and then corrects against what
 * `Intl` actually reports.
 */
export function easternTimestamp(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): number {
  // Start from the EDT offset; correct if the date turns out to be EST.
  let guess = Date.UTC(year, month, day, hour + 4, minute);
  const actual = zonedTime(guess, "America/New_York");
  const drift = hour - actual.hour;
  if (drift !== 0) guess += drift * HOUR;
  return guess;
}

/** Day of the week in New York. 0 = Sunday. */
function easternWeekday(at: number): number {
  return zonedTime(at, "America/New_York").weekday;
}

/** The first Friday of a month — when US payrolls are released. */
export function firstFriday(year: number, month: number): number {
  for (let day = 1; day <= 7; day++) {
    const at = easternTimestamp(year, month, day, 8, 30);
    if (easternWeekday(at) === 5) return at;
  }
  return easternTimestamp(year, month, 1, 8, 30);
}

/** Nudge a timestamp forward off a weekend. */
export function nextWeekday(at: number): number {
  let result = at;
  for (let i = 0; i < 3; i++) {
    const weekday = easternWeekday(result);
    if (weekday !== 0 && weekday !== 6) break;
    result += DAY;
  }
  return result;
}
