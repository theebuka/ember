/**
 * Redemption codes — the shape, the periods an admin can pick, and what each
 * refusal from `redeem_code` (migration 0011) means to the person who typed it.
 *
 * A leaf module: the admin panel and the Plan tab both read it, and the
 * database's check constraint is the same pattern as `CODE_PATTERN`.
 */

/** No 0/O, 1/I/L: a code read aloud or copied from a screenshot survives. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** XXXX-XXXX-XXXX. Matches the `code` check constraint in 0011. */
export const CODE_PATTERN = /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

/**
 * A new code, from the browser's CSPRNG. Twelve characters from 31 is ~59 bits,
 * which is what lets `redeem_code` go without an attempt limit.
 *
 * Rejection sampling, because 256 is not a multiple of 31 and a plain modulo
 * would make the first eight letters slightly likelier than the rest.
 */
export function generateCode(random: (bytes: Uint8Array) => Uint8Array = defaultRandom): string {
  const limit = 256 - (256 % CODE_ALPHABET.length);
  const chars: string[] = [];
  while (chars.length < 12) {
    for (const byte of random(new Uint8Array(16))) {
      if (byte < limit && chars.length < 12) chars.push(CODE_ALPHABET[byte % CODE_ALPHABET.length]);
    }
  }
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8).join("")}`;
}

function defaultRandom(bytes: Uint8Array): Uint8Array {
  return crypto.getRandomValues(bytes);
}

/**
 * What somebody typed, as a code: upper case, spaces and stray punctuation
 * dropped, dashes put back every four characters. Run on every keystroke, so a
 * pasted code with or without dashes lands the same way.
 */
export function normaliseCode(input: string): string {
  const bare = input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  return bare.match(/.{1,4}/g)?.join("-") ?? "";
}

export function isCompleteCode(value: string): boolean {
  return CODE_PATTERN.test(value);
}

/** The periods offered in the admin panel. Days, to match the column. */
export const CODE_PERIODS = [
  { days: 7, label: "1 week" },
  { days: 30, label: "1 month" },
  { days: 90, label: "3 months" },
  { days: 182, label: "6 months" },
  { days: 365, label: "1 year" },
] as const;

/** How long a code stays redeemable. `null` days is never. */
export const CODE_EXPIRIES = [
  { days: null, label: "Never" },
  { days: 7, label: "In 7 days" },
  { days: 30, label: "In 30 days" },
  { days: 90, label: "In 90 days" },
] as const;

/** "1 month", "3 months", "45 days" — a custom period still reads as a period. */
export function describePeriod(days: number): string {
  const named = CODE_PERIODS.find((period) => period.days === days);
  if (named) return named.label;
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export type RedeemError =
  | "signed_out"
  | "code_invalid"
  | "code_used"
  | "code_redeemed"
  | "already_unlimited"
  | "subscribed";

const REDEEM_MESSAGES: Record<RedeemError, string> = {
  signed_out: "Sign in to redeem a code.",
  // One sentence for unknown, revoked and expired alike: telling them apart
  // would confirm to a guesser which codes exist.
  code_invalid: "That code isn't valid, or it has expired.",
  code_used: "That code has already been used.",
  code_redeemed: "You've already redeemed this code.",
  already_unlimited: "Your Pro doesn't end, so there's nothing to add.",
  subscribed: "You have a subscription that renews. A code can't be added to it.",
};

/** The sentence for a refusal. Anything unrecognised is a network or server fault. */
export function redeemMessage(raw: string | undefined): string {
  const key = Object.keys(REDEEM_MESSAGES).find((k) => raw?.includes(k));
  return key
    ? REDEEM_MESSAGES[key as RedeemError]
    : "That didn't go through. Check your connection and try again.";
}
