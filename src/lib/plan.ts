/**
 * What a plan lets you do — the only place that decides.
 *
 * Every gate in the app asks this file. No component asks "is this user pro" and
 * branches, because a feature check inlined in a component is a rule nobody can
 * find later, and a commercial rule you cannot find is one that drifts until the
 * app is quietly selling something different from what the pricing page says.
 *
 * ── What a gate has to justify ──────────────────────────────────────────────
 *
 * **A gate needs a reason that survives being said out loud to the person hitting
 * it.** Two kinds qualify: it costs ember something per use, or it is genuinely
 * *more of the same thing* where free still gets ember's best answer rather than a
 * deliberately worse one. What does not qualify is anything free to serve and
 * restricted only to create pressure — that is manufactured scarcity, and it is
 * indistinguishable from the register the brief exists to rule out. ADR 0038.
 *
 * ── What is never gated ─────────────────────────────────────────────────────
 *
 * The methodology page and the track record, which are ember's public argument
 * (decision 051) and are reachable unauthenticated. And **the engine's answer
 * itself**: a free user gets the same assessment, the same confidence, the same
 * execution window and the same sizing. Only how many findings are surfaced
 * differs. Degrading the analysis for non-payers would mean shipping two engines
 * and telling one group of users something ember does not believe.
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
 * `"email-digest"` rather than `"settings-alerts-email-row"`: a feature that is
 * named after where it is rendered has to be renamed when it moves, and the
 * rename is the moment somebody forgets a call site.
 */
export type Feature =
  /** The batched email digest. Costs a Resend quota per send. */
  | "email-digest"
  /** Findings past the free cap. More of the same, best-first. */
  | "unlimited-findings"
  /**
   * **Push** alerts past the free daily cap. Costs a push quota and runner
   * minutes per send.
   *
   * Scoped to push deliberately. In-app alerts — the ones the watcher fires while
   * a tab is open — are **not capped on any plan**, because they cost ember
   * nothing, and a gate with no cost behind it is manufactured scarcity by this
   * file's own rule. Capping them would have been the easy version of this feature
   * and the dishonest one.
   */
  | "unlimited-alerts"
  /** The absence of the sponsor slot, which is the thing being sold. */
  | "no-sponsors";

interface PlanRules {
  /** Findings the inbox will show. `null` means all of them. */
  findings: number | null;
  /**
   * **Push** notifications a day. `null` means uncapped.
   *
   * Enforced in `scripts/send-digests.mjs`, which is the only place it can be:
   * a client-side cap on something a server sends is decoration.
   */
  alertsPerDay: number | null;
  emailDigest: boolean;
  sponsors: boolean;
}

/**
 * The numbers, in one table, so the pricing copy and the code cannot disagree.
 *
 * Three of the free caps are deliberately generous-looking rather than punitive.
 * A free tier is how somebody decides whether ember is worth paying for, and one
 * that shows three findings out of twelve is still showing the three that matter —
 * the inbox is ranked by urgency, so the cap shortens the answer without worsening
 * it. A cap that hid the *good* ones would be selling a different product to
 * people who had not paid.
 */
export const PLAN_RULES: Record<Plan, PlanRules> = {
  free: {
    findings: 3,
    alertsPerDay: 3,
    emailDigest: false,
    sponsors: true,
  },
  pro: {
    findings: null,
    alertsPerDay: null,
    emailDigest: true,
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
    case "email-digest":
      return rules.emailDigest;
    case "unlimited-findings":
      return rules.findings === null;
    case "unlimited-alerts":
      return rules.alertsPerDay === null;
    case "no-sponsors":
      return !rules.sponsors;
  }
}

/** How many findings to show. `null` for all of them. */
export function findingLimit(plan: Plan): number | null {
  return PLAN_RULES[plan].findings;
}

/** How many push alerts a day. `null` for uncapped. */
export function alertLimit(plan: Plan): number | null {
  return PLAN_RULES[plan].alertsPerDay;
}

/** Whether a sponsor slot renders for this plan. */
export function showsSponsors(plan: Plan): boolean {
  return PLAN_RULES[plan].sponsors;
}

/**
 * The plan an entitlement row describes, right now.
 *
 * **`period_end` is a grace boundary, not a kill switch.** A lapsed subscription
 * reads as free at the next check and nothing anywhere deletes or hides what the
 * user entered while they were paying — a ledger somebody typed by hand is theirs
 * regardless of whether they are currently a customer. That rule is stated here
 * because this is the function that could break it.
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
 * What to say when a gate bites, keyed by the feature that bit.
 *
 * Copy lives beside the rule for the same reason `RISK_PROFILES` carries its own
 * consequence string: a sentence describing a limit, kept in a different file
 * from the limit, is a sentence that goes stale silently.
 *
 * The register is fixed and it is the positive form of what §7 rules out. Sentence
 * case, names its outcome, and **no countdowns, no "limited time", no counts of
 * what other people are doing, no urgency of any kind.** The phase 14–16 review
 * proposed a blurred timer reading "Pro users exited this trade 11 minutes ago
 * with a +2.4% peak gain"; that is manufactured anxiety pointed at ember's own
 * users, and it is permanently out.
 */
export const UPSELL: Record<Feature, { title: string; body: string }> = {
  "unlimited-findings": {
    title: "See every finding",
    body: "Free shows the three most urgent. Pro shows all of them, including the quieter ones ember is still watching.",
  },
  "unlimited-alerts": {
    title: "Push without a daily cap",
    body: "Free sends three pushes a day, most urgent first. Pro sends every window as it opens. Alerts inside the app aren't capped on either plan — they cost nothing to show, so there'd be nothing honest to charge for.",
  },
  "email-digest": {
    title: "Get the digest by email",
    body: "A batched note when instruments you follow match your risk profile, daily or weekly. It covers your watchlist — warnings about positions you hold stay in the app.",
  },
  "no-sponsors": {
    title: "Pro has no sponsor slots",
    body: "ember serves its own, one per screen, with no third-party script and nothing that tracks you. Pro removes them entirely.",
  },
};
