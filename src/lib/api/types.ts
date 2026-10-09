/**
 * Core domain types.
 *
 * These describe the shape of market data and the user's ledger, and they are
 * deliberately provider-agnostic: the mock generator and a live feed both
 * produce exactly these, so screens never learn where their data came from.
 */

/* ── Markets & instruments ─────────────────────────────────────────────── */

export type MarketKind = "equity" | "crypto" | "fx";

export const MARKET_LABELS: Record<MarketKind, string> = {
  equity: "Stocks",
  crypto: "Crypto",
  fx: "Forex",
};

/**
 * Whether ember has enough history to form a view.
 *
 * `assessed` is the normal state. `collecting` exists for one venue: the NGX
 * publishes today's prices and no history at all, so ember stores a snapshot a
 * day and cannot say anything until it holds enough sessions. That is a real
 * distinction a reader has to see — a priced instrument with no signal looks
 * identical to one the engine simply had no view on, and the second is a
 * judgement while the first is a wait.
 */
export type DataState = "assessed" | "collecting";

export interface Instrument {
  symbol: string; // AAPL | BTC | EURUSD
  name: string; // Apple Inc.
  market: MarketKind;
  currency: Currency; // the currency the instrument is quoted in
  /** Decimal places this instrument is conventionally quoted to. */
  precision: number;
  /** Equities only — used by the fundamental strategies. */
  sector?: string;
  /**
   * The venue, for equities. See `lib/market/exchanges.ts`.
   *
   * Load-bearing rather than descriptive: it decides the time zone and hours
   * the execution window is computed in. Absent means New York, which is what
   * every instrument was before the universe went global.
   */
  exchange?: string;
  /** Absent means `assessed`. Only ever set to `collecting` for NGX today. */
  dataState?: DataState;
}

/* ── Currency ──────────────────────────────────────────────────────────── */

/**
 * Every currency ember quotes an instrument in or converts a book into.
 *
 * The first nine are the FX universe's own legs plus the naira. The seven after
 * them arrived with the international listings and are **quote** currencies
 * only — nothing trades a pair in them, but a Tokyo or Johannesburg equity is
 * priced in them and a portfolio has to be able to convert out.
 */
export type Currency =
  | "USD"
  | "NGN"
  | "GBP"
  | "EUR"
  | "JPY"
  | "CHF"
  | "AUD"
  | "CAD"
  | "NZD"
  | "ZAR"
  | "EGP"
  | "HKD"
  | "KRW"
  | "INR"
  | "SGD"
  | "TWD";

export const CURRENCY_META: Record<
  Currency,
  { symbol: string; label: string; decimals: number }
> = {
  USD: { symbol: "$", label: "US dollar", decimals: 2 },
  NGN: { symbol: "₦", label: "Nigerian naira", decimals: 2 },
  GBP: { symbol: "£", label: "British pound", decimals: 2 },
  EUR: { symbol: "€", label: "Euro", decimals: 2 },
  JPY: { symbol: "¥", label: "Japanese yen", decimals: 0 },
  CHF: { symbol: "CHF ", label: "Swiss franc", decimals: 2 },
  AUD: { symbol: "A$", label: "Australian dollar", decimals: 2 },
  CAD: { symbol: "C$", label: "Canadian dollar", decimals: 2 },
  NZD: { symbol: "NZ$", label: "New Zealand dollar", decimals: 2 },
  ZAR: { symbol: "R", label: "South African rand", decimals: 2 },
  EGP: { symbol: "E£", label: "Egyptian pound", decimals: 2 },
  HKD: { symbol: "HK$", label: "Hong Kong dollar", decimals: 2 },
  // Won and yen are quoted in whole units; showing ₩274,500.00 for Samsung is
  // two digits of precision the market does not have.
  KRW: { symbol: "₩", label: "South Korean won", decimals: 0 },
  INR: { symbol: "₹", label: "Indian rupee", decimals: 2 },
  SGD: { symbol: "S$", label: "Singapore dollar", decimals: 2 },
  TWD: { symbol: "NT$", label: "New Taiwan dollar", decimals: 2 },
};

/**
 * Currencies offered as a portfolio base.
 *
 * Deliberately not every currency in the union. The four added in phase 15
 * exist because FX crosses are *quoted* in them — a `USDCHF` position is
 * denominated in francs whether or not anyone wants their book totalled in
 * them — and offering nine bases in a settings dropdown to serve a handful of
 * pairs would be a menu built by the type system rather than for a person.
 */
export const BASE_CURRENCIES = ["USD", "NGN", "GBP", "EUR"] as const;
export type BaseCurrency = (typeof BASE_CURRENCIES)[number];

/* ── Prices ────────────────────────────────────────────────────────────── */

export interface Quote {
  symbol: string;
  price: number;
  /** Absolute and proportional change over the trailing session / 24h. */
  change: number;
  changePct: number;
  previousClose: number;
  dayHigh: number;
  dayLow: number;
  /** Epoch millis of the last tick. */
  at: number;
}

/** A single OHLCV bar. Everything in `lib/signals` consumes these. */
export interface Candle {
  /** Epoch millis at the bar's open. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type Range = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";

export interface Series {
  symbol: string;
  range: Range;
  candles: Candle[];
}

/* ── Advice vocabulary ─────────────────────────────────────────────────── */

/**
 * The five things ember can tell you to do.
 *
 * This lives here rather than in the engine so a component can label an action
 * without importing `lib/signals`. Pulling the ensemble into a client bundle
 * to read five strings would drag ten strategies and every indicator with it.
 */
export type AdviceAction = "buy" | "accumulate" | "hold" | "reduce" | "sell";

export const ACTION_LABELS: Record<AdviceAction, string> = {
  buy: "Buy",
  accumulate: "Accumulate",
  hold: "Hold",
  reduce: "Reduce",
  sell: "Sell",
};

/** Which way an action points, for tinting chips and badges. */
export const ACTION_DIRECTION: Record<AdviceAction, "up" | "down" | "flat"> = {
  buy: "up",
  accumulate: "up",
  hold: "flat",
  reduce: "down",
  sell: "down",
};

/**
 * How each family of rules is described to a reader.
 *
 * Keyed loosely by string rather than by the engine's `StrategyFamily` union,
 * because this is read by client components and the union lives in
 * `lib/signals` where they cannot reach.
 */
export const STRATEGY_FAMILY_LABELS: Record<string, string> = {
  trend: "Trend",
  momentum: "Momentum",
  "mean-reversion": "Mean reversion",
  value: "Value",
  quality: "Quality",
  carry: "Carry",
  valuation: "Valuation",
  defensive: "Defensive",
  lottery: "Lottery demand",
  attention: "Attention",
  investment: "Investment",
};

/**
 * What the methodology route serves.
 *
 * These live here rather than beside the route handler because both sides of
 * the wire need them, and a client component importing a type out of
 * `app/api/**` would put a `server-only` module one careless `import type`
 * removal away from the browser bundle.
 */
export interface StrategySummary {
  id: string;
  name: string;
  family: string;
  citation: {
    authors: string;
    year: number;
    title: string;
    where: string;
    claim: string;
  };
  appliesTo: MarketKind[];
  /** Bars of history the rule needs before it will speak. */
  minBars: number;
}

/**
 * One figure on the asset page's metrics grid.
 *
 * The value stays a number and carries a formatting hint rather than arriving
 * pre-rendered. Formatting lives in `lib/market/format.ts`, where the locale is
 * pinned and the money/percent rules are enforced — a server that formatted its
 * own strings would be a second, quietly diverging implementation of all of it.
 */
export interface AssetMetric {
  key: string;
  label: string;
  value: number;
  format: "money" | "compactMoney" | "percent" | "ratio" | "compact" | "price";
  /** A short qualifier shown beneath the figure. */
  hint?: string;
}

/** Grouped so the page can title each block without knowing the asset class. */
export interface AssetMetricGroup {
  title: string;
  /** Why these particular numbers, and which strategies read them. */
  note?: string;
  metrics: AssetMetric[];
}

/**
 * What one risk profile would do on today's market.
 *
 * Lives here rather than beside the route for the same reason
 * `StrategySummary` does: settings renders it, and a client component reaching
 * into `app/api/**` for a type puts a `server-only` module one careless edit
 * away from the browser bundle.
 */
export interface RiskProfilePreview {
  profile: RiskProfile;
  label: string;
  consequence: string;
  /** Instruments the engine could form a view on at all. */
  assessed: number;
  /** Of those, how many clear this profile's bar and reach the feed. */
  actionable: number;
  /** Mean suggested position size across the actionable calls, or null. */
  typicalSize: number | null;
  actionThreshold: number;
  confidenceFloor: number;
  maxWeight: number;
  volTarget: number;
}

export interface RegimeScenario {
  key: string;
  label: string;
  description: string;
  /** Multiplier per family, computed by calling the engine's own function. */
  weights: Record<string, number>;
}

/* ── News ──────────────────────────────────────────────────────────────── */

/**
 * A headline.
 *
 * **News is context, never evidence.** ADR 0005 rules out sentiment as a
 * signal input — it is not citable, it is not verifiable, and the methodology
 * page renders that rejection to users. Nothing here changes that: this type
 * deliberately carries no sentiment score, no directional label and no
 * relevance weight, because those are the fields that would make it *look*
 * like an input and invite someone to wire it up. What it carries is what a
 * reader needs to go and read the thing.
 *
 * There is a test that fails if anything under `lib/signals` imports a news
 * module. The boundary is enforced, not merely intended — same discipline as
 * `server-only` on the engine.
 */
export interface NewsItem {
  id: string;
  headline: string;
  /** One sentence under the headline. Never an interpretation. */
  summary: string;
  source: string;
  /** Epoch millis of publication. */
  at: number;
  url: string;
  /** Instruments the story is about. Empty means market-wide. */
  symbols: string[];
  /**
   * What the story is about, as plain lowercase phrases.
   *
   * These are what the trending strip counts. They come from the provider
   * rather than being extracted client-side, because a live feed supplies its
   * own taxonomy and re-deriving one from headline text would be a worse
   * version of a thing the upstream already did.
   */
  topics: string[];
  category: NewsCategory;
}

export type NewsCategory = "markets" | "company" | "macro" | "crypto";

export const NEWS_CATEGORY_LABELS: Record<NewsCategory, string> = {
  markets: "Markets",
  company: "Companies",
  macro: "Macro",
  crypto: "Crypto",
};

/** One entry in the trending strip. Computed from frequency, never authored. */
export interface TrendingTopic {
  topic: string;
  /** Stories in the window mentioning it — the whole basis for the ranking. */
  mentions: number;
  /** The instruments those stories were about, most-mentioned first. */
  symbols: string[];
}

/* ── Ledger ────────────────────────────────────────────────────────────── */

/**
 * The only persisted portfolio object.
 *
 * Holdings are derived from this log rather than stored alongside it, so cost
 * basis and realized P&L can never drift out of sync with the trades that
 * produced them. See CLAUDE.md §5.
 */
export interface Transaction {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  /** Per-unit price, in the instrument's own quote currency. */
  price: number;
  fees?: number;
  /** ISO date string. */
  date: string;
  account?: string;
  note?: string;
  /**
   * When this row was last written, epoch millis. Sync metadata, not a fact
   * about the trade — `date` is when it happened, this is when it was typed.
   *
   * Optional because it has to be: it is absent on every row written before
   * sync existed, on every row parsed from a CSV, and on the fixtures in the
   * portfolio tests. `lib/sync/merge.ts` reads a missing value as the
   * beginning of time, which resolves in favour of whatever the server holds
   * — the safe direction, since an undated row is by definition one nobody
   * has touched since sync was added.
   */
  updatedAt?: number;
}

/* ── User preferences ──────────────────────────────────────────────────── */

export type RiskProfile = "conservative" | "balanced" | "aggressive";

export interface RiskProfileConfig {
  label: string;
  /** Plain-language consequence, shown under the slider in settings. */
  consequence: string;
  /** Annualised portfolio volatility the sizing model aims for. */
  volTarget: number;
  /** Hard cap on any single position, as a fraction of the book. */
  maxWeight: number;
  /** Minimum blended conviction before a recommendation is surfaced. */
  actionThreshold: number;
  /**
   * Minimum confidence, 0–100, before a recommendation is surfaced.
   *
   * Separate from `actionThreshold` because conviction and evidence are
   * different things: a strong score the strategies barely trust is not a
   * recommendation, and neither is a confident shrug.
   *
   * This was a fixed 35 for every profile until the settings screen made the
   * consequence visible and showed all three profiles surfacing the identical
   * three calls. Confidence lands in roughly 10–55 in practice, so a shared
   * floor of 35 was the binding constraint in nearly every case and the
   * conviction threshold almost never bit — which made "fewer signals" and
   * "more signals" false claims. A conservative investor wanting *more*
   * evidence before acting is also just the right model of the person.
   */
  confidenceFloor: number;
}

export const RISK_PROFILES: Record<RiskProfile, RiskProfileConfig> = {
  conservative: {
    label: "Conservative",
    consequence:
      "Fewer, smaller trades, and none in choppy markets. You'll miss some moves.",
    volTarget: 0.08,
    maxWeight: 0.08,
    actionThreshold: 0.35,
    /**
     * ── The floors are calibrated to the engine, and the engine moved ────────
     *
     * These were 45 / 35 / 28, calibrated in ADR 0013 against a ten-rule
     * ensemble. Phase 24 took it to sixteen and the confidence distribution
     * shifted down as a whole — mean 26, maximum 54 — because `assess()` reduces
     * confidence for both disagreement and abstention, and **both grow with the
     * number of rules whether or not the new rules are informative**. Measured on
     * the old floors, Conservative surfaced **4 of 214**, which is not a cautious
     * profile, it is a broken one.
     *
     * So the floors are re-derived from the distribution the engine now produces,
     * restoring the shares ADR 0013 chose: roughly 9%, 36% and 64% of the
     * universe. Measured after the change: 19 / 77 / 136 of 214, against 20 / 78 /
     * 136 before this phase.
     *
     * **This is maintenance of a documented calibration, not tuning to a
     * preferred answer** — and it is the second time the same thing has happened,
     * which is the real finding. A fixed floor on a relative scale is not portable
     * across a change in ensemble size, so every future phase that adds or removes
     * a rule has to re-measure this. The durable fix is to stop confidence
     * depending on rule count at all: `coverage` divides by every applicable rule,
     * so a rule that honestly abstains still costs the others, and dispersion
     * rises with independent voices that are each well-founded. That is an
     * ensemble change which moves every number in the app, and it is in §9 rather
     * than folded in here.
     *
     * **And a third time** (decision 303): three more rules took the floors to
     * 33 / 25 / 20.
     *
     * **Decision 304 removed the bookkeeping half of that.** A rule that cannot
     * assess an instrument, or is waiting for an event, no longer counts against
     * it, and the three momentum rules that are one opinion count as one voice.
     * Tests pin it: adding such a rule leaves every confidence unchanged. That
     * moved the scale once more, so the floors were re-derived to the shares ADR
     * 0013 chose (about 9%, 36% and 64% of 214): 32 / 24 / 17, measuring
     * 21 / 75 / 136.
     *
     * What can still move them is a change in the *evidence*: a new rule that is
     * weaker or more independent than the average lowers the average, because
     * confidence is an average of how sure the rules are and how much they agree.
     * That is a real change and wants re-measuring, not a count artefact.
     */
    confidenceFloor: 32,
  },
  balanced: {
    label: "Balanced",
    consequence:
      "Moderate-sized trades, scaled back when markets turn volatile.",
    volTarget: 0.14,
    maxWeight: 0.15,
    actionThreshold: 0.22,
    // Re-derived with the other two — see the note above. Now below the
    // "Moderate" label's boundary, so Balanced surfaces some calls badged `Low`
    // where previously only Aggressive did. The badge says so on the card.
    confidenceFloor: 24,
  },
  aggressive: {
    label: "Aggressive",
    consequence:
      "More and larger trades. Expect bigger swings along the way.",
    volTarget: 0.22,
    maxWeight: 0.25,
    actionThreshold: 0.15,
    // Well below the "Moderate" boundary, so an aggressive profile surfaces a
    // lot of calls badged `Low`. That's the trade it asked for, and the badge
    // says so on the card.
    confidenceFloor: 17,
  },
};

/**
 * A call the reader's plan doesn't show in full: the instrument, its price and
 * whether it clears their risk profile — never the direction, the window, the
 * size or the stop. Built on the server, so the rest never reaches the browser.
 */
export interface LockedCall {
  symbol: string;
  market: MarketKind;
  price: number;
  /** Whether it matches the reader's risk profile. Says ember would act, not which way. */
  actionable: boolean;
  /** What Pro adds here: more calls, or a market free doesn't cover. */
  reason: "calls" | "markets";
}
