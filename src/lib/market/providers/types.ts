import type {
  Candle,
  Currency,
  Instrument,
  NewsItem,
  Quote,
} from "@/lib/api/types";
import type { MarketEvent } from "@/lib/market/calendar";
import type { Fundamentals } from "@/lib/signals/types";

export interface OnChainMetrics {
  marketCap: number;
  /** Aggregate cost basis proxy — every coin priced when it last moved. */
  realizedCap: number;
  mvrvZ: number;
}

/**
 * The seam between ember and the market.
 *
 * Screens never import a provider. They call `lib/api/client.ts`, which calls
 * a route, which calls whichever provider is configured. Swapping generated
 * data for a live feed is an env var and a second implementation of this
 * interface — no component changes, and the signal engine cannot tell the
 * difference because both sides produce the same candles.
 */
export interface MarketDataProvider {
  readonly id: string;
  /** True when the data is generated. Surfaced in the UI — never hidden. */
  readonly synthetic: boolean;

  listInstruments(): Instrument[];

  /**
   * Symbol search — the seam that makes "add anything" possible later.
   *
   * The mock answers out of its compiled-in registry, so today this is a
   * filter over a hundred instruments and could have been done in the
   * browser. It is on the interface anyway, because a live provider answers it
   * from an upstream symbol-search endpoint over tens of thousands of listings
   * — and the difference between adding a method to a provider and rewriting
   * every screen that assumes a fixed universe is the whole reason this seam
   * exists (CLAUDE.md §4).
   */
  searchInstruments(query: string, limit?: number): Promise<Instrument[]>;

  /** Daily bars, oldest first. */
  getCandles(symbol: string, options?: { limit?: number }): Promise<Candle[]>;

  /** Intraday bars for the 1D range. */
  getIntraday(symbol: string, at?: number): Promise<Candle[]>;

  getQuote(symbol: string, at?: number): Promise<Quote | null>;
  getQuotes(symbols: readonly string[], at?: number): Promise<Quote[]>;

  getFundamentals(symbol: string): Promise<Fundamentals | null>;
  getOnChain(symbol: string): Promise<OnChainMetrics | null>;

  /** Annualised policy rates, for the FX carry signal. */
  getPolicyRates(): Promise<Record<Currency, number>>;
  /** USD per one unit of each currency, for base-currency conversion. */
  getConversionRates(): Promise<Record<Currency, number>>;

  getEvents(at?: number): Promise<MarketEvent[]>;

  /**
   * Headlines over the trailing window, newest first.
 *
 * Takes no timestamp. A live implementation caches and refreshes on its own
 * clock — possibly long after the request that triggered the refresh — so a
 * moment captured by the caller would date the window from the wrong one.
   *
   * On the seam like everything else, because the live implementation is
   * Finnhub's general + company news and the shape is the same either way.
   *
   * **Nothing downstream of `lib/signals` may call this.** News is context and
   * never evidence (ADR 0027, amending ADR 0005), and the fastest way for that
   * to erode is for it to be available to the engine and merely not used yet.
   * A test walks the engine's imports and fails if one appears.
   */
  getNews(): Promise<NewsItem[]>;
}
