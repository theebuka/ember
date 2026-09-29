import "server-only";

import type {
  Candle,
  Currency,
  MarketKind,
  NewsItem,
  Range,
  RiskProfile,
  TrendingTopic,
} from "@/lib/api/types";
import { RISK_PROFILES } from "@/lib/api/types";
import { getProvider } from "@/lib/market/providers";
import { trendingFrom } from "@/lib/market/news";
import { INSTRUMENT_BY_SYMBOL } from "@/lib/market/universe";
import { buildContext, loadUniverse, type Universe } from "@/lib/signals/context";
import { assess, qualifies, type Assessment } from "@/lib/signals/ensemble";
import { buildFindings, type Finding } from "@/lib/signals/findings";
import type { HeldExposure } from "@/lib/signals/exposure";

/**
 * Server-side helpers shared by the route handlers.
 *
 * `server-only` is imported at the top so that importing this from a client
 * component is a build error rather than a runtime surprise. The whole point
 * of the data-flow rule in CLAUDE.md §4 is that the engine never reaches the
 * browser; this makes the rule enforced rather than merely documented.
 */

/* ── Query parsing ─────────────────────────────────────────────────────── */

const RANGES: Range[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

export function parseRange(value: string | null): Range {
  return RANGES.includes(value as Range) ? (value as Range) : "1M";
}

export function parseRiskProfile(value: string | null): RiskProfile {
  return value !== null && value in RISK_PROFILES ? (value as RiskProfile) : "balanced";
}

/** `?symbols=AAPL,BTC` — deduplicated, uppercased, empty means "everything". */
export function parseSymbols(value: string | null): string[] | null {
  if (!value) return null;
  const symbols = [
    ...new Set(
      value
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  return symbols.length > 0 ? symbols : null;
}

/**
 * How many daily bars a range asks for.
 *
 * Counted in *trading* bars, not calendar days, so a month of equities and a
 * month of crypto cover the same span of time despite crypto printing weekend
 * bars. Getting this wrong would make a crypto 1Y chart show sixteen months.
 */
export function barsForRange(range: Range, market: MarketKind): number | null {
  const perYear = market === "crypto" ? 365 : 252;
  switch (range) {
    case "1D":
    case "1W":
      return Math.round(perYear / 52);
    case "1M":
      return Math.round(perYear / 12);
    case "3M":
      return Math.round(perYear / 4);
    case "1Y":
      return perYear;
    case "ALL":
      return null;
  }
}

/* ── Advice ────────────────────────────────────────────────────────────── */

export interface AdviceResponse {
  riskProfile: RiskProfile;
  /** Every assessment, including holds. The feed filters; the dashboard ranks. */
  assessments: Assessment[];
  /** Symbols clearing the profile's bar, most convicted first. */
  actionable: string[];
  at: number;
  synthetic: boolean;
  /**
   * Instruments whose history had not arrived yet — reported, never hidden.
   *
   * Zero on generated data and on a warm server. Non-zero means the feed is
   * ranking a subset, and the screen says so rather than presenting a partial
   * universe as the whole one.
   */
  pending: number;
}

/**
 * A short cache on assessments, keyed by risk profile.
 *
 * One cold request runs ten strategies across 110 instruments over 420 bars
 * each, and generates the thousand-bar path behind every one of them:
 * measured at ~175ms, against ~5ms warm. Home, the feed and the watchlist all
 * want the same answer, and React Query refetches on every window focus, so
 * without this the app would pay that repeatedly for an answer that cannot
 * have changed. Sixty seconds is well inside the hourly resolution of the
 * execution window, so nothing the user sees is stale in a way that matters.
 *
 * Module scope, so it is per server instance and evaporates on redeploy. A
 * real cache (Upstash, per ADR 0008) lands with live data, where it also has
 * to protect a rate-limited upstream.
 */
const ADVICE_TTL = 60_000;
const adviceCache = new Map<RiskProfile, { at: number; response: AdviceResponse }>();

/**
 * The loaded universe, memoised on the same clock as the advice above.
 *
 * Three callers now want the *inputs* rather than the output — findings need
 * candles for the entry stop and past contexts for the entry read, and the
 * risk preview runs three profiles over one market. Loading it three times
 * would generate the same thousand bars per instrument three times over, and
 * at a hundred instruments that stops being free.
 *
 * The two TTLs are deliberately equal. If the universe expired while a cached
 * advice response was still warm, the candles a risk signal measures against
 * would be a minute newer than the assessment it is qualifying — a small
 * inconsistency, but the kind that produces an unreproducible number on a
 * screen whose whole claim is that you can check it.
 */
let universeCache: { at: number; universe: Universe } | null = null;

/**
 * A partial universe expires almost immediately.
 *
 * `loadUniverse` returns what arrived inside its deadline rather than waiting
 * out a cold free tier, and the instruments it abandoned keep loading into the
 * provider cache behind the response. Holding that partial result for the full
 * minute would throw away exactly the work the deadline was betting on — the
 * next request would be served a universe that is already stale in the one way
 * that matters. Five seconds is long enough to absorb the burst of requests one
 * page load makes, and short enough that a reader watching "assessing 24 more"
 * sees it fall.
 */
const PARTIAL_TTL = 5_000;

async function cachedUniverse(now: number): Promise<Universe> {
  if (universeCache) {
    const ttl = universeCache.universe.pending.length > 0 ? PARTIAL_TTL : ADVICE_TTL;
    if (now - universeCache.at < ttl) return universeCache.universe;
  }
  const universe = await loadUniverse(getProvider(), now);
  universeCache = { at: now, universe };
  return universe;
}

export async function getAdvice(riskProfile: RiskProfile): Promise<AdviceResponse> {
  const now = Date.now();
  const cached = adviceCache.get(riskProfile);
  // A response computed over a partial universe expires with that universe, or
  // the feed would keep reporting instruments as pending after they landed.
  const ttl = cached && cached.response.pending > 0 ? PARTIAL_TTL : ADVICE_TTL;
  if (cached && now - cached.at < ttl) return cached.response;

  const provider = getProvider();
  const universe = await cachedUniverse(now);

  const assessments: Assessment[] = [];
  for (const instrument of universe.instruments) {
    const context = buildContext(universe, instrument.symbol);
    if (!context) continue;

    const assessment = assess({ context, riskProfile, events: universe.events });
    if (assessment) assessments.push(assessment);
  }

  // Ranked by conviction weighted by confidence, so a score of 0.9 that the
  // strategies barely believe doesn't outrank a well-evidenced 0.6.
  assessments.sort(
    (a, b) => Math.abs(b.score) * b.confidence - Math.abs(a.score) * a.confidence,
  );

  const response: AdviceResponse = {
    riskProfile,
    assessments,
    actionable: assessments
      .filter((a) => qualifies(a, riskProfile))
      .map((a) => a.symbol),
    at: now,
    synthetic: provider.synthetic,
    pending: universe.pending.length,
  };

  adviceCache.set(riskProfile, { at: now, response });
  return response;
}

/**
 * How many full assessments `/api/advice` will serialise.
 *
 * An assessment is about 8 KB on the wire — ten contributions each carrying a
 * rationale and a citation, plus a 72-point window curve. At thirteen
 * instruments the route returned every read and the whole response was 82 KB.
 * At a hundred and ten it would be ~900 KB, for a screen nobody scrolls to the
 * bottom of.
 *
 * **The cap is unconditional, including over the actionable list.** The first
 * version of this exempted anything clearing the user's bar, reasoning that a
 * limit which could hide a recommendation is a bug rather than a budget.
 * Measured, that exemption *was* the problem: 36 of 110 clear the Balanced bar
 * on the expanded universe, so a "page of 25" served 38 assessments and
 * 315 KB, and it would have kept growing with the universe.
 *
 * The reasoning was wrong in an instructive way. Nothing is hidden — the
 * complete `actionable` list still ships, it is a few hundred bytes of
 * strings, and the feed states the count it did not draw. What is withheld is
 * the full working on the weakest of them, which is one tap away on its own
 * page. A feed of thirty-six cards is not restraint, and restraint is the
 * design.
 */
export const ADVICE_PAGE = 20;

export function trimAdvice(response: AdviceResponse, limit = ADVICE_PAGE) {
  return {
    ...response,
    // Already ranked by conviction × confidence in `getAdvice`, so the head of
    // this list is the head of the ranking.
    assessments: response.assessments.slice(0, limit),
    /** Instruments the engine formed a view on, before trimming. */
    assessed: response.assessments.length,
  };
}

/* ── Findings ──────────────────────────────────────────────────────────── */

/**
 * The only thing about the user's book that crosses the wire.
 *
 * Four numbers per symbol, all of them already derived. Not the transaction
 * log: no dates other than the opening one, no per-trade prices, no fees, no
 * account names, no closed positions, no realised P&L. It is the minimum that
 * makes the risk engine possible — a stop measured from a real entry needs an
 * average cost, a concentration warning needs a relative size — and it is
 * deliberately not a superset of that.
 *
 * Weight is *not* on it. The server can work out each position's share of the
 * book from the prices it already has, so asking the client for it would put a
 * number on the wire that the server could compute for free, and one it would
 * then be trusting a client to have computed correctly.
 */
export interface PositionInput {
  symbol: string;
  quantity: number;
  /** Average cost per unit, in the instrument's own quote currency. */
  averageCost: number;
  /** Epoch millis of the first trade in this symbol. */
  openedAt: number;
}

/**
 * Each position's share of the book, computed here rather than accepted.
 *
 * Everything is converted to USD purely as a common denominator — a *share* is
 * invariant to the unit, so the user's chosen base currency is irrelevant to
 * this calculation and is not asked for. Prices come from the assessments, so
 * the weight a concentration warning quotes is derived from the same price the
 * card beside it shows.
 */
function withWeights(
  positions: readonly PositionInput[],
  assessments: readonly Assessment[],
  rates: Record<Currency, number>,
): HeldExposure[] {
  const priceBy = new Map(assessments.map((a) => [a.symbol, a.price]));

  const valued = positions.map((position) => {
    const spec = INSTRUMENT_BY_SYMBOL.get(position.symbol);
    const price = priceBy.get(position.symbol);
    const usd =
      spec && price !== undefined && position.quantity > 0
        ? position.quantity * price * (rates[spec.currency] ?? 1)
        : 0;
    return { position, usd };
  });

  const total = valued.reduce((acc, v) => acc + v.usd, 0);

  return valued.map(({ position, usd }) => ({
    symbol: position.symbol,
    quantity: position.quantity,
    averageCost: position.averageCost,
    openedAt: position.openedAt,
    weight: total > 0 ? usd / total : 0,
  }));
}

/**
 * How many findings the inbox is served.
 *
 * Measured on the expanded universe: 24 opportunities and 7 risks on a
 * twelve-position book, which is 282 KB and, far worse, thirty-one things to
 * read. An inbox of thirty-one items is a list, and a list is what ember
 * already had — the whole repositioning is that it comes to you with what
 * matters rather than handing you everything it knows.
 *
 * Twelve, ranked by urgency across both kinds, with the totals reported
 * alongside so the screen can say what it left out. Risk is never the thing
 * that gets cut: seven risks on a twelve-position book is the ceiling, because
 * a position can raise at most one finding.
 */
export const FINDINGS_PAGE = 12;

export interface FindingsResponse {
  riskProfile: RiskProfile;
  findings: Finding[];
  /** Total found, before the page limit — what the inbox reports. */
  found: { opportunity: number; risk: number };
  /** Instruments the engine could form a view on at all. */
  assessed: number;
  at: number;
  synthetic: boolean;
  /** Instruments whose history had not arrived yet. See `AdviceResponse`. */
  pending: number;
}

/**
 * The alpha finder.
 *
 * Ownership enters here and nowhere earlier. `assess()` stays a pure function
 * of candles and a risk profile, which is what keeps the engine testable and
 * out of the browser bundle; the join against what the user actually holds
 * happens at the API boundary, on the server, over positions the client
 * derived from its own ledger.
 *
 * **What crosses the wire is derived positions, never the transaction log.**
 * Quantity, average cost and an opened-at date per symbol — enough to measure
 * a stop from a real entry and a weight against a real book, and not enough to
 * reconstruct anyone's trading history. This is a change to a property that
 * used to be absolute (nothing left the device), it is stated in settings and
 * in CLAUDE.md §8, and it is reasoned about in ADR 0025.
 */
export async function getFindings({
  riskProfile,
  positions,
  watching,
}: {
  riskProfile: RiskProfile;
  positions: readonly PositionInput[];
  watching: readonly string[] | null;
}): Promise<FindingsResponse> {
  const now = Date.now();
  const [advice, universe, rates] = await Promise.all([
    getAdvice(riskProfile),
    cachedUniverse(now),
    getProvider().getConversionRates(),
  ]);

  const exposures = withWeights(positions, advice.assessments, rates);

  const findings = buildFindings({
    assessments: advice.assessments,
    riskProfile,
    positions: exposures,
    watching,
    candles: universe.candles,
    instruments: new Map(universe.instruments.map((i) => [i.symbol, i])),
    entryAssessments: entryReads(universe, exposures, riskProfile),
    events: universe.events,
    now,
  });

  return {
    riskProfile,
    findings: findings.slice(0, FINDINGS_PAGE),
    found: {
      opportunity: findings.filter((f) => f.kind === "opportunity").length,
      risk: findings.filter((f) => f.kind === "risk").length,
    },
    assessed: advice.assessments.length,
    pending: advice.pending,
    at: now,
    synthetic: advice.synthetic,
  };
}

/**
 * The read as it stood on the day each position was opened.
 *
 * This is what makes "thesis decay" a measurement rather than a mood: the same
 * ensemble, run against the same instrument truncated to the bar the user
 * bought on, so the two contribution lists are comparable rule by rule.
 * `buildContext`'s `endIndex` is the mechanism the walk-forward backtest
 * already runs on, so there is no new lookahead surface here — nothing
 * downstream of it can see a bar after the entry.
 *
 * Silently skipped when the entry predates the available history, which is the
 * common case for a long-held position. Every exposure trigger works without
 * an entry read; two of them just get sharper wording when there is one.
 */
function entryReads(
  universe: Universe,
  positions: readonly HeldExposure[],
  riskProfile: RiskProfile,
): Map<string, Assessment> {
  const reads = new Map<string, Assessment>();

  for (const position of positions) {
    const candles = universe.candles.get(position.symbol);
    if (!candles || candles.length === 0) continue;

    // Last bar at or before the opening trade. `findLastIndex` rather than a
    // scan from the front because a position opened yesterday is the common
    // case and its bar is at the end.
    const index = candles.findLastIndex((candle) => candle.t <= position.openedAt);
    // The regime filter needs 200 bars plus a year of volatility history
    // before it will speak, so an entry inside the first stretch of the series
    // simply has no reconstructable read.
    if (index < 0) continue;

    const context = buildContext(universe, position.symbol, index);
    if (!context) continue;

    const assessment = assess({ context, riskProfile, events: universe.events });
    if (assessment) reads.set(position.symbol, assessment);
  }

  return reads;
}

/* ── News ──────────────────────────────────────────────────────────────── */

export interface NewsResponse {
  items: NewsItem[];
  trending: TrendingTopic[];
  at: number;
  synthetic: boolean;
}

/**
 * The provider owns freshness; this only avoids recomputing the strip.
 *
 * There used to be a five-minute TTL here as well, and two caches over one
 * feed with different clocks is one cache too many: the provider's own entry
 * goes stale after ten minutes and refreshes *behind* the response, but this
 * layer stopped the provider from being asked at all for five of those minutes,
 * so the refresh that accumulates company news kept being deferred. Measured:
 * three requests twenty seconds apart returned a byte-identical payload while
 * the pool underneath them never grew.
 *
 * So the provider is asked every time — a map lookup when its entry is fresh —
 * and the only thing memoised here is `trendingFrom`, which is a pass over the
 * whole feed and would otherwise run on every request for an unchanged answer.
 * Keyed on the array's identity, which is stable exactly while the provider's
 * cached value is.
 */
let trendingCache: { items: NewsItem[]; trending: TrendingTopic[] } | null = null;

export async function getNews(): Promise<NewsResponse> {
  const provider = getProvider();
  const items = await provider.getNews();

  if (trendingCache?.items !== items) {
    trendingCache = { items, trending: trendingFrom(items) };
  }

  return {
    items,
    trending: trendingCache.trending,
    at: Date.now(),
    synthetic: provider.synthetic,
  };
}

/* ── Series ────────────────────────────────────────────────────────────── */

export async function getSeries(
  symbol: string,
  range: Range,
  market: MarketKind,
): Promise<Candle[]> {
  const provider = getProvider();

  if (range === "1D") {
    const intraday = await provider.getIntraday(symbol);
    // Outside a session there are no intraday bars at all. A chart with no
    // line is a dead end, so fall back to the last week of daily closes —
    // the range selector's own label already says which is being shown.
    if (intraday.length > 1) return intraday;
    return provider.getCandles(symbol, { limit: barsForRange("1W", market) ?? undefined });
  }

  const limit = barsForRange(range, market);
  return provider.getCandles(symbol, limit === null ? undefined : { limit });
}
