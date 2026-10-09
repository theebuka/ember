/**
 * What a plan lets you do — the only place that decides.
 *
 * Every gate in the app asks this file. No component asks "is this user pro" and
 * branches, because a feature check inlined in a component is a rule nobody can
 * find later, and a commercial rule you cannot find is one that drifts until the
 * app is quietly selling something different from what the pricing page says.
 *
 * ── The split (decision 288) ────────────────────────────────────────────────
 *
 * **Free is a taste; Pro is the product.** Free sees every call ember has made
 * but only three a day in full — the strongest on US stocks and crypto. The rest
 * show their instrument and a lock: the reader can see ember found something and
 * not which way it points. Free also tracks five holdings, watches ten
 * instruments, gets alerts only while ember is open, keeps its data on one
 * device, charts the last month, and sees past calls from four weeks back.
 *
 * **A lapse is a return to free, and nothing is deleted** (decision 289). An
 * account over a limit keeps every row — on the device and, synced, on the
 * server — and sees what free sees: its five largest holdings, its first five
 * watched instruments. Resubscribing shows the rest again at once.
 *
 * ── What is never gated ─────────────────────────────────────────────────────
 *
 * - **The methodology page and the track record's figures.** They are how a
 *   stranger decides whether to trust ember. Free sees every summary figure and
 *   every call older than four weeks; only the newest calls are Pro.
 * - **Warnings about what you hold.** Free holds five; every warning on those
 *   five is shown. Withholding "your stop broke" to sell a subscription is the one
 *   gate that would make people hate the app.
 * - **The quality of a call.** An unlocked call is exactly what Pro sees. Locked
 *   is withheld, never worsened — two engines would be two products.
 *
 * **A locked call never reaches the browser.** The server strips it before the
 * response leaves (`lib/api/plan-server.ts`); hiding it on screen would leave it
 * one developer-tools tab away.
 *
 * No import of anything. This is deliberately a leaf module so the server, the
 * client and a test can all read the same rules with no chance of a second copy.
 */

export type Plan = "free" | "pro";

export const PLAN_LABELS: Record<Plan, string> = {
  free: "Free",
  pro: "Pro",
};

/**
 * Everything a plan can gate, named as a capability rather than as a screen.
 *
 * A feature named after where it is rendered has to be renamed when it moves,
 * and the rename is the moment somebody forgets a call site.
 */
export type Feature =
  /** Every call in full: direction, window, size and stop. */
  | "all-calls"
  /** Calls on international stocks and currencies. */
  | "all-markets"
  | "more-holdings"
  | "bigger-watchlist"
  /** Push to a closed app. Costs a push quota and runner minutes per send. */
  | "push-alerts"
  /** The batched email digest. Costs a Resend quota per send. */
  | "email-digest"
  | "sync"
  /** Value-chart ranges past the last month. */
  | "chart-history"
  /** The newest calls in the track record and an asset's past calls. */
  | "recent-calls"
  /** The absence of the sponsor slot. */
  | "no-sponsors";

/** The value chart's ranges. Restated rather than imported: this is a leaf. */
export type ChartRange = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";

interface PlanRules {
  /** Calls a day shown in full. `null` means every call. */
  calls: number | null;
  /** Open positions the portfolio will take. `null` means no limit. */
  holdings: number | null;
  /** Instruments on the watchlist. `null` means no limit. */
  watchlist: number | null;
  /** Calls on international stocks and currencies. */
  allMarkets: boolean;
  /** Enforced in `scripts/send-digests.mjs`; a client gate on a server send is decoration. */
  push: boolean;
  emailDigest: boolean;
  sync: boolean;
  /** Value-chart ranges. `null` means every one. */
  chartRanges: readonly ChartRange[] | null;
  /**
   * Days of the newest past calls the track record leaves out. A call made last
   * week usually still points the same way today, so without this the record
   * would hand a free reader the direction of a locked call. The summary figures
   * still count every call. `null` shows them all.
   */
  recentCallsHiddenDays: number | null;
  sponsors: boolean;
}

/** The numbers, in one table, so the pricing copy and the code cannot disagree. */
export const PLAN_RULES: Record<Plan, PlanRules> = {
  free: {
    calls: 3,
    holdings: 5,
    watchlist: 5,
    allMarkets: false,
    push: false,
    emailDigest: false,
    sync: false,
    chartRanges: ["1D", "1W", "1M"],
    recentCallsHiddenDays: 28,
    sponsors: true,
  },
  pro: {
    calls: null,
    holdings: null,
    watchlist: null,
    allMarkets: true,
    push: true,
    emailDigest: true,
    sync: true,
    chartRanges: null,
    recentCallsHiddenDays: null,
    sponsors: false,
  },
};

/**
 * What Pro costs, in US dollars — the only place a price is written.
 *
 * $12 a month or $120 a year, chosen by the user and set against the category:
 * Copilot is $13 / $95, Monarch $14.99 / $99.99. The yearly figure is two months
 * free rather than a discount invented to make a toggle look generous, and the
 * saving shown beside it is computed from these two numbers, never typed.
 */
export const PRO_PRICE_USD = { monthly: 12, yearly: 120 } as const;

export type Billing = keyof typeof PRO_PRICE_USD;

/** The yearly plan's saving against twelve monthly payments, as a fraction. */
export function yearlySaving(): number {
  return 1 - PRO_PRICE_USD.yearly / (PRO_PRICE_USD.monthly * 12);
}

/** Whether this plan may use a capability at all. */
export function canUse(feature: Feature, plan: Plan): boolean {
  const rules = PLAN_RULES[plan];
  switch (feature) {
    case "all-calls":
      return rules.calls === null;
    case "all-markets":
      return rules.allMarkets;
    case "more-holdings":
      return rules.holdings === null;
    case "bigger-watchlist":
      return rules.watchlist === null;
    case "push-alerts":
      return rules.push;
    case "email-digest":
      return rules.emailDigest;
    case "sync":
      return rules.sync;
    case "chart-history":
      return rules.chartRanges === null;
    case "recent-calls":
      return rules.recentCallsHiddenDays === null;
    case "no-sponsors":
      return !rules.sponsors;
  }
}

/** How many open positions this plan tracks. `null` for no limit. */
export function holdingLimit(plan: Plan): number | null {
  return PLAN_RULES[plan].holdings;
}

/** How many instruments this plan watches. `null` for no limit. */
export function watchlistLimit(plan: Plan): number | null {
  return PLAN_RULES[plan].watchlist;
}

/** Whether the value chart may show this range. */
export function rangeAllowed(range: ChartRange, plan: Plan): boolean {
  const ranges = PLAN_RULES[plan].chartRanges;
  return ranges === null || ranges.includes(range);
}

/** Whether a sponsor slot renders for this plan. */
export function showsSponsors(plan: Plan): boolean {
  return PLAN_RULES[plan].sponsors;
}

/**
 * Whether free covers calls on this instrument: US stocks and crypto.
 *
 * `XNYS` is every US listing in the universe (`lib/market/exchanges.ts`).
 */
export function inFreeMarkets(instrument: { market: string; exchange?: string }): boolean {
  if (instrument.market === "crypto") return true;
  return instrument.market === "equity" && instrument.exchange === "XNYS";
}

/**
 * The calls a plan sees in full, or `null` for every one.
 *
 * Free gets the strongest few that clear the reader's risk profile, on the
 * markets free covers. `ranked` is the feed's order (conviction × confidence), so
 * "strongest" means the same thing here as at the top of the Signals feed. The
 * same for every free reader on a profile; nothing about the person picks them.
 *
 * **Buys come first.** A sell is only useful to someone who holds the
 * instrument, and the picks can't know who does, so a sell spent one of the
 * three on "you don't hold ORCL, so there's nothing to sell". Sells fill the
 * remaining slots only when there aren't enough buys. Anyone who does hold a
 * position already gets its warnings free.
 */
export function unlockedCalls(
  plan: Plan,
  ranked: readonly { symbol: string; action?: string }[],
  actionable: ReadonlySet<string>,
  isFreeMarket: (symbol: string) => boolean,
): Set<string> | null {
  const limit = PLAN_RULES[plan].calls;
  if (limit === null) return null;
  const eligible = ranked.filter(
    ({ symbol }) => actionable.has(symbol) && isFreeMarket(symbol),
  );
  const isBuy = (action?: string) => action === undefined || action === "buy" || action === "accumulate";
  const ordered = [...eligible.filter((c) => isBuy(c.action)), ...eligible.filter((c) => !isBuy(c.action))];
  return new Set(ordered.slice(0, limit).map((c) => c.symbol));
}

/**
 * The plan an entitlement row describes, right now.
 *
 * **A lapsed subscription reads as free at the next check**, and gets free's
 * limits (decision 289). Nothing is deleted: what is past a limit is hidden, on
 * the device and the server alike, and returns the moment Pro does.
 *
 * A null row means free, which is also what a signed-out visitor gets: ember has
 * always worked with no account (ADR 0031) and a free plan is not a blocked one.
 */
export function planFrom(
  row: { plan?: string | null; period_end?: string | null } | null | undefined,
  now: number = Date.now(),
): Plan {
  if (!row || row.plan !== "pro") return "free";
  if (!row.period_end) return "pro"; // granted by hand, or a plan with no term
  return Date.parse(row.period_end) > now ? "pro" : "free";
}

/**
 * What an account's subscription looks like, for the screens that describe it.
 *
 * `planFrom` answers "may this account do X"; this answers "what do we tell the
 * subscriber". They differ in one case that matters: a lapsed row is `free` to
 * every gate, and `lapsed` here, so the plan page can say when Pro ended and that
 * nothing was taken away (decision 185).
 */
export type Subscription =
  | { status: "none" }
  | {
      status: "active";
      /** Null when Pro was granted by hand rather than bought. */
      periodEnd: number | null;
      billing: Billing | null;
      /** False once cancelled: Pro runs to `periodEnd`, then lapses. */
      renews: boolean;
    }
  | { status: "lapsed"; endedAt: number };

export type EntitlementRow = {
  plan?: string | null;
  period_end?: string | null;
  billing?: string | null;
  cancel_at_period_end?: boolean | null;
};

export function subscriptionFrom(
  row: EntitlementRow | null | undefined,
  now: number = Date.now(),
): Subscription {
  if (!row || row.plan !== "pro") return { status: "none" };
  const end = row.period_end ? Date.parse(row.period_end) : null;
  if (end !== null && Number.isFinite(end) && end <= now) {
    return { status: "lapsed", endedAt: end };
  }
  return {
    status: "active",
    periodEnd: end !== null && Number.isFinite(end) ? end : null,
    billing: row.billing === "monthly" || row.billing === "yearly" ? row.billing : null,
    renews: end !== null && !row.cancel_at_period_end,
  };
}


/**
 * What to say when a gate bites, keyed by the feature that bit.
 *
 * Copy lives beside the rule so a sentence describing a limit cannot go stale
 * apart from it. Sentence case, names its outcome. **No countdowns, no "limited
 * time", no counts of what other people are doing** — the lock already says what
 * the reader is missing; pressure on top of it is the casino register.
 */
export const UPSELL: Record<Feature, { title: string; body: string }> = {
  "all-calls": {
    title: "See every call",
    body: `Free shows ${PLAN_RULES.free.calls} calls a day in full. Pro shows every call: buy or sell, when to act, how much, and where to get out.`,
  },
  "all-markets": {
    title: "Calls on every market",
    body: "Free covers US stocks and crypto. Pro adds international stocks and currencies.",
  },
  "more-holdings": {
    title: "Track every holding",
    body: `Free tracks up to ${PLAN_RULES.free.holdings} holdings. Pro has no limit, and watches every one for trouble.`,
  },
  "bigger-watchlist": {
    title: "Watch as many as you like",
    body: `Free watches up to ${PLAN_RULES.free.watchlist} instruments. Pro has no limit.`,
  },
  "push-alerts": {
    title: "Alerts when ember is closed",
    body: "Pro sends a push alert when a window opens or something you hold needs attention, even with ember closed.",
  },
  "email-digest": {
    title: "Get the digest by email",
    body: "A daily or weekly email when instruments you follow match your risk profile. Warnings about what you hold stay in the app.",
  },
  sync: {
    title: "Sync across devices",
    body: "Pro keeps your trades, watchlist and settings the same on every device you sign in on.",
  },
  "chart-history": {
    title: "See your whole history",
    body: "Free charts the last month. Pro charts every range.",
  },
  "recent-calls": {
    title: "See the latest calls",
    body: `Free shows past calls from more than ${(PLAN_RULES.free.recentCallsHiddenDays ?? 0) / 7} weeks ago. Pro shows them up to today.`,
  },
  "no-sponsors": {
    title: "Pro has no sponsor slots",
    body: "Free shows one ember-run sponsor per screen, with no tracking. Pro removes them.",
  },
};
