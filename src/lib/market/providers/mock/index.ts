import type { Candle, Currency, Instrument, NewsItem, Quote } from "@/lib/api/types";
import type { MarketEvent } from "@/lib/market/calendar";
import {
  INSTRUMENT_BY_SYMBOL,
  INSTRUMENTS,
  POLICY_RATES,
  searchInstruments,
  toInstrument,
  USD_PER_UNIT,
} from "@/lib/market/universe";
import type { Fundamentals } from "@/lib/signals/types";
import type { MarketDataProvider, OnChainMetrics } from "../types";
import { generateEvents } from "./events";
import { generateNews } from "./news";
import { generateFundamentals } from "./fundamentals";
import { generateOnChain } from "./onchain";
import { candlesAsOf, dailyCandles, intradayCandles } from "./series";

/**
 * Generated market data.
 *
 * Everything here is deterministic given a symbol and a date, so the app is
 * fully usable with no API keys and screenshots and backtests reproduce
 * exactly. `synthetic` is true and the UI is required to say so — presenting
 * generated prices as real would be the single worst thing this product could
 * do.
 */
export class MockProvider implements MarketDataProvider {
  readonly id = "mock";
  readonly synthetic = true;

  listInstruments(): Instrument[] {
    return INSTRUMENTS.map(toInstrument);
  }

  async searchInstruments(query: string, limit = 20): Promise<Instrument[]> {
    return searchInstruments(query, limit).map(toInstrument);
  }

  async getCandles(symbol: string, options?: { limit?: number }): Promise<Candle[]> {
    const spec = INSTRUMENT_BY_SYMBOL.get(symbol);
    if (!spec) return [];

    const candles = candlesAsOf(spec, Date.now());
    return options?.limit ? candles.slice(-options.limit) : candles;
  }

  async getIntraday(symbol: string, at = Date.now()): Promise<Candle[]> {
    const spec = INSTRUMENT_BY_SYMBOL.get(symbol);
    if (!spec) return [];
    return intradayCandles(spec, at);
  }

  async getQuote(symbol: string, at = Date.now()): Promise<Quote | null> {
    const spec = INSTRUMENT_BY_SYMBOL.get(symbol);
    if (!spec) return null;

    const completed = dailyCandles(spec, at);
    const candles = candlesAsOf(spec, at);
    const current = candles[candles.length - 1];

    // When a live bar exists, "previous close" is the last completed session.
    // When it doesn't — market shut — it's the session before that.
    const previousClose =
      candles.length > completed.length
        ? completed[completed.length - 1].c
        : completed[completed.length - 2].c;

    const change = current.c - previousClose;

    return {
      symbol,
      price: current.c,
      change,
      changePct: previousClose === 0 ? 0 : change / previousClose,
      previousClose,
      dayHigh: current.h,
      dayLow: current.l,
      at,
    };
  }

  async getQuotes(symbols: readonly string[], at = Date.now()): Promise<Quote[]> {
    const quotes = await Promise.all(symbols.map((s) => this.getQuote(s, at)));
    return quotes.filter((q): q is Quote => q !== null);
  }

  async getFundamentals(symbol: string): Promise<Fundamentals | null> {
    const spec = INSTRUMENT_BY_SYMBOL.get(symbol);
    return spec ? generateFundamentals(spec) : null;
  }

  async getOnChain(symbol: string): Promise<OnChainMetrics | null> {
    const spec = INSTRUMENT_BY_SYMBOL.get(symbol);
    if (!spec) return null;
    return generateOnChain(spec, candlesAsOf(spec, Date.now()));
  }

  async getPolicyRates(): Promise<Record<Currency, number>> {
    return POLICY_RATES;
  }

  async getConversionRates(): Promise<Record<Currency, number>> {
    return USD_PER_UNIT;
  }

  async getEvents(at = Date.now()): Promise<MarketEvent[]> {
    return generateEvents(at);
  }

  async getNews(): Promise<NewsItem[]> {
    return generateNews(Date.now());
  }
}

export const mockProvider = new MockProvider();
