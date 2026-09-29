import type { Candle, Instrument, MarketKind } from "@/lib/api/types";
import type { CrossSection } from "./cross-section";

/* ── Strategy identity ─────────────────────────────────────────────────── */

export type StrategyId =
  | "ts-momentum"
  | "xs-momentum"
  | "clenow"
  | "dual-momentum"
  | "donchian-breakout"
  | "connors-rsi2"
  | "piotroski"
  | "magic-formula"
  | "fx-carry"
  | "crypto-mvrv"
  | "bab"
  | "residual-momentum"
  | "week52-high"
  | "short-reversal"
  | "industry-momentum"
  | "currency-momentum";

export type StrategyFamily =
  | "trend"
  | "momentum"
  | "mean-reversion"
  | "value"
  | "quality"
  | "carry"
  | "valuation"
  /**
   * The low-risk anomaly — high-beta assets have historically underperformed
   * their risk. Its own family rather than a kind of value, because the regime
   * filter and the risk profiles have to treat it differently from everything
   * else: it is the only family whose edge *improves* when the market falls.
   */
  | "defensive";

/**
 * Where a strategy comes from.
 *
 * Every strategy carries one, and the methodology page renders it. A rule set
 * that can't be cited doesn't ship — see docs/decisions/0005.
 */
export interface Citation {
  authors: string;
  year: number;
  title: string;
  /** Journal, publisher or institution, so a reader can go and check. */
  where: string;
  /** What the source actually claims, in one sentence. */
  claim: string;
}

/* ── Inputs ────────────────────────────────────────────────────────────── */

/** Annual fundamentals for the equity strategies. Current year and prior. */
export interface Fundamentals {
  netIncome: number;
  netIncomePrior: number;
  operatingCashFlow: number;
  totalAssets: number;
  totalAssetsPrior: number;
  longTermDebt: number;
  longTermDebtPrior: number;
  currentAssets: number;
  currentLiabilities: number;
  currentAssetsPrior: number;
  currentLiabilitiesPrior: number;
  sharesOutstanding: number;
  sharesOutstandingPrior: number;
  grossProfit: number;
  grossProfitPrior: number;
  revenue: number;
  revenuePrior: number;
  /** Magic Formula inputs. */
  ebit: number;
  netWorkingCapital: number;
  netFixedAssets: number;
  enterpriseValue: number;
}

/** A peer in the same market, for cross-sectional ranking. */
export interface PeerSeries {
  symbol: string;
  market: MarketKind;
  candles: Candle[];
  fundamentals?: Fundamentals;
  /** Equities only. Industry momentum groups on it. */
  sector?: string;
  /**
   * FX only — the pair's annualised interest differential, base less quote.
   *
   * Precomputed here rather than looked up inside a strategy, because deriving
   * it needs the policy-rate table and the pair's legs, and a strategy that
   * reaches for either has stopped being a pure function of its context.
   */
  carry?: number;
}

export interface StrategyContext {
  instrument: Instrument;
  /** Daily bars, oldest first. */
  candles: Candle[];
  /** Same-market peers including the subject itself. */
  peers: PeerSeries[];
  /**
   * The whole market's measures on this evaluation day, computed once and
   * shared by every cross-sectional rule. See `cross-section.ts`.
   *
   * Optional because a hand-built context in a test can omit it, and the
   * strategies that need it abstain rather than throw — silence is a valid
   * answer everywhere else in this engine and there is no reason for it not to
   * be here.
   */
  crossSection?: CrossSection;
  fundamentals?: Fundamentals;
  /** Annualised short rates for the two legs of an FX pair. */
  fx?: { baseRate: number; quoteRate: number };
  /** On-chain valuation inputs for crypto. */
  onchain?: { marketCap: number; realizedCap: number; mvrvZ: number };
  /** Annualised risk-free rate — the hurdle for absolute momentum. */
  riskFreeRate: number;
  /** 252 for exchange-traded instruments, 365 for crypto. */
  periodsPerYear: number;
  /** Epoch millis of the evaluation. Never read the clock inside a strategy. */
  now: number;
}

/* ── Output ────────────────────────────────────────────────────────────── */

export interface StrategySignal {
  strategyId: StrategyId;
  /** −1 (strongest sell) … +1 (strongest buy). */
  score: number;
  /** 0…1 — how much this strategy trusts its own read here. */
  confidence: number;
  /**
   * One sentence, citing the numbers that produced the score. Rendered to the
   * user verbatim, so it must read as plain English and never as a log line.
   */
  rationale: string;
  /** Typical holding period the strategy implies, in days. */
  horizonDays: number;
  /**
   * Empirical half-life of the edge, in days. Drives how fast the execution
   * window decays — a two-day mean-reversion edge and a six-month trend
   * signal should not produce the same window.
   */
  halfLifeDays: number;
}

export interface Strategy {
  id: StrategyId;
  name: string;
  family: StrategyFamily;
  citation: Citation;
  appliesTo: MarketKind[];
  /** Bars required before the strategy is allowed an opinion. */
  minBars: number;
  /**
   * Returns null when the strategy genuinely has no view — insufficient
   * history, missing fundamentals, or conditions its rules don't cover.
   * Silence is a valid answer and is shown to the user as such.
   */
  evaluate(ctx: StrategyContext): StrategySignal | null;
}
