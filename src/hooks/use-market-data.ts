"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchAdvice,
  fetchAsset,
  fetchFindings,
  fetchInstruments,
  fetchNews,
  fetchQuotes,
  fetchRates,
  fetchRiskPreview,
  fetchSeries,
  fetchStrategies,
  fetchTrackRecord,
  fetchSymbolCalls,
  queryKeys,
  type PositionInput,
} from "@/lib/api/client";
import type { Range, RiskProfile } from "@/lib/api/types";

/**
 * React Query bindings over `lib/api/client`.
 *
 * Cadences differ by how fast the underlying thing actually changes, rather
 * than one interval for everything: quotes tick constantly, the instrument
 * list never does, and an assessment built on daily bars does not become a
 * different assessment thirty seconds later.
 */

/** Prices move; everything else on the page is downstream of them. */
const QUOTE_INTERVAL = 20_000;

export function useInstruments() {
  return useQuery({
    queryKey: queryKeys.instruments,
    queryFn: ({ signal }) => fetchInstruments(signal),
    // The universe is fixed until a release adds to it.
    staleTime: Infinity,
  });
}

export function useQuotes(symbols?: readonly string[]) {
  return useQuery({
    queryKey: queryKeys.quotes(symbols),
    queryFn: ({ signal }) => fetchQuotes(symbols, signal),
    // Polling pauses when the tab is hidden — the default, and the right one.
    // Nobody needs a phone in a pocket refetching prices every twenty seconds.
    refetchInterval: QUOTE_INTERVAL,
    staleTime: QUOTE_INTERVAL / 2,
  });
}

export function useSeries(symbols: readonly string[], range: Range) {
  return useQuery({
    queryKey: queryKeys.series(symbols, range),
    queryFn: ({ signal }) => fetchSeries(symbols, range, signal),
    enabled: symbols.length > 0,
    // Historical bars only change when a session closes. Keeping them warm is
    // what makes the range selector feel instant on a second visit.
    staleTime: 5 * 60_000,
    // Switching from 1M to 3M should redraw the line, not blank the chart.
    placeholderData: (previous) => previous,
  });
}

/**
 * How often to look again while the universe is still filling.
 *
 * A cold server hands back a partial universe and keeps loading behind the
 * response (`LOAD_DEADLINE_MS`), so the honest thing is to come back for the
 * rest rather than leave a reader looking at a ranked subset until the ordinary
 * five-minute refresh. Fifteen seconds is frequent enough that "assessing 24
 * more" visibly falls, and it stops the moment the count reaches zero.
 */
const PENDING_POLL_MS = 15_000;

export function useAdvice(profile: RiskProfile, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.advice(profile),
    queryFn: ({ signal }) => fetchAdvice(profile, signal),
    // The alert watcher runs on every screen, including ones with no advice on
    // them. `enabled` is what stops it pulling an 82 KB feed into the
    // portfolio page for a user who has alerts switched off.
    enabled: options.enabled ?? true,
    staleTime: 60_000,
    refetchInterval: (query) =>
      (query.state.data?.pending ?? 0) > 0 ? PENDING_POLL_MS : 5 * 60_000,
  });
}

/**
 * The findings inbox.
 *
 * A `useQuery` despite being a POST, because it is a read — the verb is about
 * carrying a body, not about changing anything on the server (see the route).
 * Making it a mutation would cost the cache, the shared subscription between
 * Home and the alert watcher, and the refetch-on-focus that keeps a returning
 * user's inbox current.
 *
 * `enabled` gates it on hydration: the positions come from `localStorage`, and
 * firing before the store has rehydrated would ask the server what it thinks
 * about an empty book and then immediately ask again.
 */
export function useFindings(
  profile: RiskProfile,
  positions: readonly PositionInput[],
  watching: readonly string[] | null,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.findings(profile, positions, watching),
    queryFn: ({ signal }) => fetchFindings(profile, positions, watching, signal),
    enabled: options.enabled ?? true,
    staleTime: 60_000,
    refetchInterval: (query) =>
      (query.state.data?.pending ?? 0) > 0 ? PENDING_POLL_MS : 5 * 60_000,
    // The book changes more often than the market does, and re-deriving the
    // key on every logged trade would otherwise blank the inbox mid-read.
    placeholderData: (previous) => previous,
  });
}

/** Everything one asset page needs, in a single request. */
export function useAsset(symbol: string, profile: RiskProfile) {
  return useQuery({
    queryKey: queryKeys.asset(symbol, profile),
    queryFn: ({ signal }) => fetchAsset(symbol, profile, signal),
    enabled: symbol.length > 0,
    // Carries a live quote, so it follows the quote cadence rather than the
    // advice one.
    refetchInterval: QUOTE_INTERVAL,
    staleTime: QUOTE_INTERVAL / 2,
  });
}

/**
 * The walk-forward backtest.
 *
 * It only changes when the daily bar grid rolls, so it is fetched once and
 * held for the session — no interval, no refetch on focus. The route caches
 * per UTC day for the same reason.
 */
export function useTrackRecord(profile: RiskProfile) {
  return useQuery({
    queryKey: queryKeys.trackRecord(profile),
    queryFn: ({ signal }) => fetchTrackRecord(profile, signal),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/** One instrument's past calls — what the asset page shows, without the rest. */
export function useSymbolCalls(profile: RiskProfile, symbol: string) {
  return useQuery({
    queryKey: queryKeys.symbolCalls(profile, symbol),
    queryFn: ({ signal }) => fetchSymbolCalls(profile, symbol, signal),
    enabled: symbol.length > 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/** The strategy registry and its weight tables. Changes only on release. */
export function useStrategies(profile: RiskProfile) {
  return useQuery({
    queryKey: queryKeys.strategies(profile),
    queryFn: ({ signal }) => fetchStrategies(profile, signal),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/**
 * What each risk profile would recommend, for the settings comparison.
 *
 * Follows the advice cadence rather than the quote one — it's the same
 * assessments underneath — but doesn't poll. Nobody sits on the settings
 * screen waiting for the counts to move.
 */
export function useRiskPreview() {
  return useQuery({
    queryKey: queryKeys.riskPreview,
    queryFn: ({ signal }) => fetchRiskPreview(signal),
    staleTime: 60_000,
  });
}

/**
 * Headlines.
 *
 * The slowest-moving thing ember serves, and the only query with no
 * dependencies at all — no profile, no book, no symbol list. The "your assets"
 * filter runs in the browser against this one cached feed, which is why it
 * stays a single key rather than one per filter state.
 */
export function useNews() {
  return useQuery({
    queryKey: queryKeys.news,
    queryFn: ({ signal }) => fetchNews(signal),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });
}

export function useRates() {
  return useQuery({
    queryKey: queryKeys.fx,
    queryFn: ({ signal }) => fetchRates(signal),
    staleTime: 10 * 60_000,
  });
}
