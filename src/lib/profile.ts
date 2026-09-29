/**
 * Who the user is, to the extent ember needs to know.
 *
 * **Every field here has to earn its place, and two of them nearly didn't.**
 * The rule this file is written against is the one ADR 0025 and ADR 0031 both
 * turn on: collect what the product uses, and nothing because it might be
 * useful later. A finance app is exactly where "date of birth, address, income
 * bracket" starts feeling normal, and ember does no KYC, holds no money and
 * executes no trades — so it has no business asking.
 *
 * What survives:
 *
 * - **Preferred name** — the greeting says it. This is the one the user
 *   actually sees, so it is the one asked for first.
 * - **First and last name** — identity on a receipt when there is billing, and
 *   the fallback the greeting uses when there is no preferred name. Optional.
 * - **Country** — sets a sensible base currency, and is the field a tax or
 *   regulatory question would eventually hang off. Optional.
 * - **Timezone** — the execution windows are the product, and every one of
 *   them is quoted in the reader's local time. Detected, never asked.
 *
 * Email is deliberately *not* here: it belongs to the auth session, changing it
 * has to go through a verification round trip, and a second copy in a synced
 * store is a copy that can disagree with the thing you sign in with.
 */

export interface Profile {
  /** What the greeting calls you. Falls back to `firstName`. */
  preferredName: string | null;
  firstName: string | null;
  lastName: string | null;
  /** ISO 3166-1 alpha-2, or null. */
  country: string | null;
  /** IANA zone, detected on first run and overridable. */
  timezone: string | null;
}

export const EMPTY_PROFILE: Profile = {
  preferredName: null,
  firstName: null,
  lastName: null,
  country: null,
  timezone: null,
};

/**
 * The name the greeting uses, or null for the name-free form.
 *
 * Preferred first, then the first name. Never the last name alone and never
 * "Mr Nwaju" — the greeting is a salutation from an app you opened, not a
 * letter from a bank.
 */
export function greetingName(profile: Profile): string | null {
  return profile.preferredName?.trim() || profile.firstName?.trim() || null;
}

/** Both names, for the places that want to address someone properly. */
export function fullName(profile: Profile): string | null {
  const parts = [profile.firstName?.trim(), profile.lastName?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * One or two letters for the profile control.
 *
 * Two initials when there is a first and last name, one otherwise, and `null`
 * when there is nothing — the control falls back to an icon rather than
 * inventing a letter.
 */
export function initials(profile: Profile): string | null {
  const first = (profile.firstName ?? profile.preferredName ?? "").trim();
  const last = (profile.lastName ?? "").trim();
  if (first === "" && last === "") return null;
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase() || null;
}

/**
 * The user's timezone, as the browser reports it.
 *
 * Detected rather than asked, because it is knowable and a question you can
 * answer for someone is a question you shouldn't ask. Returns null on the
 * server, where there is no such thing — ADR 0017's rule, and the reason
 * anything reading local time renders after mount.
 */
export function detectTimezone(): string | null {
  if (typeof Intl === "undefined") return null;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * Every country, by ISO code, named through `Intl`.
 *
 * A curated list would be shorter and would mean deciding whose country counts
 * — and the cutoff is always arbitrary and always wrong for somebody. The full
 * set costs about a kilobyte.
 *
 * The locale is pinned to `en-US`, for the same reason `lib/market/format.ts`
 * pins it (ADR 0016's neighbour, decision 016): `Intl` otherwise resolves to
 * the runtime's locale, which is the server's during SSR and the browser's at
 * hydration, and a select whose options are named differently on the two sides
 * is a hydration mismatch on every row.
 */
const ISO_3166 =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " ",
  );

export interface CountryOption {
  code: string;
  name: string;
}

let cachedCountries: CountryOption[] | null = null;

export function countries(): CountryOption[] {
  if (cachedCountries) return cachedCountries;

  const names =
    typeof Intl !== "undefined" && "DisplayNames" in Intl
      ? new Intl.DisplayNames(["en-US"], { type: "region" })
      : null;

  cachedCountries = ISO_3166.map((code) => ({
    code,
    name: names?.of(code) ?? code,
  })).sort((a, b) => a.name.localeCompare(b.name, "en-US"));

  return cachedCountries;
}

export function countryName(code: string | null): string | null {
  if (!code) return null;
  return countries().find((c) => c.code === code)?.name ?? code;
}

/**
 * The base currency a country suggests.
 *
 * A *suggestion*, applied once during setup and never afterwards — changing
 * your country in settings must not silently re-denominate a book you have
 * been reading in dollars for a year. Only the nine currencies ember actually
 * converts to are here; everything else keeps the USD default.
 */
const CURRENCY_BY_COUNTRY: Record<string, string> = {
  US: "USD",
  GB: "GBP",
  NG: "NGN",
  JP: "JPY",
  CH: "CHF",
  AU: "AUD",
  CA: "CAD",
  NZ: "NZD",
  // The euro area.
  AT: "EUR", BE: "EUR", CY: "EUR", DE: "EUR", EE: "EUR", ES: "EUR", FI: "EUR",
  FR: "EUR", GR: "EUR", HR: "EUR", IE: "EUR", IT: "EUR", LT: "EUR", LU: "EUR",
  LV: "EUR", MT: "EUR", NL: "EUR", PT: "EUR", SI: "EUR", SK: "EUR",
};

export function suggestedCurrency(country: string | null): string | null {
  return country ? (CURRENCY_BY_COUNTRY[country] ?? null) : null;
}
