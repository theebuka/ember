import type {
  AssetMetricGroup,
  Currency,
  Instrument,
  MarketKind,
  NewsItem,
  Quote,
  Range,
  RegimeScenario,
  RiskProfile,
  RiskProfilePreview,
  Series,
  StrategySummary,
  TrendingTopic,
} from "@/lib/api/types";
import type { BacktestResult } from "@/lib/signals/backtest";
import type { Assessment } from "@/lib/signals/ensemble";
import type { Finding } from "@/lib/signals/findings";

/**
 * The only data entry point components are allowed to use.
 *
 * Everything here is a fetch against `/api/*`. No component imports a
 * provider, mock data or the signal engine — that indirection is what lets a
 * live feed drop in without a single screen changing (CLAUDE.md §4).
 *
 * `Assessment` is imported as a *type only*. It's erased at build, so the
 * engine never reaches the browser bundle; the runtime values behind it live
 * on the server side of the route.
 */

export type { Assessment } from "@/lib/signals/ensemble";
export type { Contribution, Stance } from "@/lib/signals/ensemble";
export type { Finding, FindingKind } from "@/lib/signals/findings";
export type {
  RiskAction,
  RiskSeverity,
  RiskSignal,
  RiskTrigger,
} from "@/lib/signals/exposure";
export type { ExecutionWindow, WindowSample } from "@/lib/signals/window";
export type { Regime } from "@/lib/signals/regime";
export type { PositionSize } from "@/lib/signals/sizing";
export type {
  BacktestResult,
  BacktestTrade,
  StrategyRecord,
} from "@/lib/signals/backtest";
export type { Citation, StrategyId } from "@/lib/signals/types";

/* ── Transport ─────────────────────────────────────────────────────────── */

/**
 * A failed request the UI can actually say something about.
 *
 * "Something went wrong" is a dead end, and the UX bar rules those out. The
 * status is carried so an error state can distinguish "we're offline" from
 * "that symbol doesn't exist" and name the right next action.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { signal, headers: { accept: "application/json" } });
  } catch (cause) {
    // A thrown fetch is the network, not the server — almost always offline.
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError("No connection. ember will retry when you're back online.", 0);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(
      body?.error ?? `Something went wrong (${response.status}). Try again.`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

/**
 * The one route that sends something rather than only asking.
 *
 * Same error vocabulary as `get`, deliberately — a findings request that fails
 * offline has to produce the identical "No connection" state as a quotes
 * request, or the inbox gets its own private way of being broken.
 */
async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError("No connection. ember will retry when you're back online.", 0);
  }

  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    throw new ApiError(
      problem?.error ?? `Something went wrong (${response.status}). Try again.`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

/* ── Query keys ────────────────────────────────────────────────────────── */

/**
 * Keys are built in one place so an invalidation can't miss a cache entry
 * through a typo. Symbol lists are sorted before joining — `AAPL,BTC` and
 * `BTC,AAPL` are the same request and should share one cache entry.
 */
export const queryKeys = {
  instruments: ["instruments"] as const,
  quotes: (symbols?: readonly string[]) =>
    ["quotes", symbols ? [...symbols].sort().join(",") : "all"] as const,
  series: (symbols: readonly string[], range: Range) =>
    ["series", [...symbols].sort().join(","), range] as const,
  advice: (profile: RiskProfile) => ["advice", profile] as const,
  /**
   * Keyed by the *content* of the book, not by its identity.
   *
   * Findings depend on what you hold, so a logged trade has to produce a new
   * key or the inbox keeps answering yesterday's question. Symbols and
   * quantities are enough — a changed average cost implies a changed quantity
   * in every case a ledger can produce.
   */
  findings: (
    profile: RiskProfile,
    positions: readonly { symbol: string; quantity: number }[],
    watching: readonly string[] | null,
  ) =>
    [
      "findings",
      profile,
      [...positions]
        .map((p) => `${p.symbol}:${p.quantity}`)
        .sort()
        .join(","),
      watching === null ? "all" : [...watching].sort().join(","),
    ] as const,
  asset: (symbol: string, profile: RiskProfile) => ["asset", symbol, profile] as const,
  trackRecord: (profile: RiskProfile) => ["track-record", profile] as const,
  strategies: (profile: RiskProfile) => ["strategies", profile] as const,
  // Not keyed by profile — it answers for all three at once, which is the
  // whole point of it.
  riskPreview: ["risk-preview"] as const,
  fx: ["fx"] as const,
  news: ["news"] as const,
};

/* ── Responses ─────────────────────────────────────────────────────────── */

export interface InstrumentsResponse {
  instruments: Instrument[];
  /** True when prices are generated. The UI is required to say so. */
  synthetic: boolean;
  providerId: string;
}

export interface QuotesResponse {
  quotes: Quote[];
  at: number;
  synthetic: boolean;
}

export interface SeriesResponse {
  series: Series[];
  at: number;
  synthetic: boolean;
}

export interface AdviceResponse {
  riskProfile: RiskProfile;
  /** The top of the ranking, plus everything clearing the bar. Trimmed. */
  assessments: Assessment[];
  actionable: string[];
  /** Instruments assessed before trimming — what the feed's counts quote. */
  assessed: number;
  at: number;
  synthetic: boolean;
  /**
   * Instruments whose history had not arrived when the server answered.
   *
   * Zero on generated data and on a warm server. Non-zero means the ranking is
   * over a subset, the screens say so, and the query polls until it clears —
   * a feed silently ranking 80 of 110 is a feed making a claim it cannot keep.
   */
  pending: number;
}

/** What the user's book looks like to the server. Four derived numbers, no log. */
export interface PositionInput {
  symbol: string;
  quantity: number;
  averageCost: number;
  openedAt: number;
}

export interface FindingsResponse {
  riskProfile: RiskProfile;
  /** The top of the ranking. `found` says how many there were. */
  findings: Finding[];
  found: { opportunity: number; risk: number };
  assessed: number;
  at: number;
  synthetic: boolean;
  /**
   * Instruments whose history had not arrived when the server answered.
   *
   * Zero on generated data and on a warm server. Non-zero means the ranking is
   * over a subset, the screens say so, and the query polls until it clears —
   * a feed silently ranking 80 of 110 is a feed making a claim it cannot keep.
   */
  pending: number;
}

export interface NewsResponse {
  items: NewsItem[];
  /** Computed from headline frequency across the feed, never authored. */
  trending: TrendingTopic[];
  at: number;
  synthetic: boolean;
}

export interface FxResponse {
  rates: Record<Currency, number>;
  at: number;
  synthetic: boolean;
}

export interface TrackRecordResponse extends BacktestResult {
  riskProfile: RiskProfile;
  at: number;
  synthetic: boolean;
}

export interface AssetResponse {
  instrument: Instrument;
  quote: Quote | null;
  assessment: Assessment | null;
  actionable: boolean;
  groups: AssetMetricGroup[];
  riskProfile: RiskProfile;
  at: number;
  synthetic: boolean;
}

export interface StrategiesResponse {
  strategies: StrategySummary[];
  families: string[];
  regimes: RegimeScenario[];
  riskProfile: RiskProfile;
  /** Family multipliers for the chosen profile. A missing family means 1. */
  profileWeights: Partial<Record<string, number>>;
  /**
   * How far ahead each market's window looks, in hours. Read from
   * `HORIZON_HOURS` so the page describing the window cannot say "three days"
   * about a market whose horizon is a day and a half.
   */
  horizonHours: Record<MarketKind, number>;
  at: number;
}

export interface RiskPreviewResponse {
  profiles: RiskProfilePreview[];
  at: number;
  synthetic: boolean;
}

/* ── Fetchers ──────────────────────────────────────────────────────────── */

export function fetchInstruments(signal?: AbortSignal) {
  return get<InstrumentsResponse>("/api/instruments", signal);
}

export function fetchQuotes(symbols?: readonly string[], signal?: AbortSignal) {
  const query = symbols?.length ? `?symbols=${symbols.join(",")}` : "";
  return get<QuotesResponse>(`/api/quotes${query}`, signal);
}

export function fetchSeries(
  symbols: readonly string[],
  range: Range,
  signal?: AbortSignal,
) {
  return get<SeriesResponse>(
    `/api/series?symbols=${symbols.join(",")}&range=${range}`,
    signal,
  );
}

export function fetchAdvice(profile: RiskProfile, signal?: AbortSignal) {
  return get<AdviceResponse>(`/api/advice?profile=${profile}`, signal);
}

/**
 * What ember has found, for this book.
 *
 * The only call in the app that sends rather than asks. See `PositionInput`
 * and ADR 0025 for exactly what goes and what deliberately doesn't.
 */
export function fetchFindings(
  profile: RiskProfile,
  positions: readonly PositionInput[],
  watching: readonly string[] | null,
  signal?: AbortSignal,
) {
  return post<FindingsResponse>(
    "/api/findings",
    { profile, positions, watching },
    signal,
  );
}

/** What every risk profile would recommend right now — settings reads this. */
export function fetchRiskPreview(signal?: AbortSignal) {
  return get<RiskPreviewResponse>("/api/risk-preview", signal);
}

export function fetchNews(signal?: AbortSignal) {
  return get<NewsResponse>("/api/news", signal);
}

export function fetchRates(signal?: AbortSignal) {
  return get<FxResponse>("/api/fx", signal);
}

export function fetchTrackRecord(profile: RiskProfile, signal?: AbortSignal) {
  return get<TrackRecordResponse>(`/api/track-record?profile=${profile}`, signal);
}

export function fetchStrategies(profile: RiskProfile, signal?: AbortSignal) {
  return get<StrategiesResponse>(`/api/strategies?profile=${profile}`, signal);
}

export function fetchAsset(
  symbol: string,
  profile: RiskProfile,
  signal?: AbortSignal,
) {
  return get<AssetResponse>(
    `/api/asset?symbol=${encodeURIComponent(symbol)}&profile=${profile}`,
    signal,
  );
}
