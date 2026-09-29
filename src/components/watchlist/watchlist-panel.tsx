"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Eye, Plus, Search } from "@/components/common/icon";
import { ErrorState } from "@/components/common/error-state";
import { Rows } from "@/components/common/section";
import { AddSymbols } from "@/components/watchlist/add-symbols";
import { WatchlistRow, WatchlistRowSkeleton, type WatchRow } from "@/components/watchlist/watchlist-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHydrated } from "@/hooks/use-hydrated";
import { useAdvice, useInstruments, useQuotes, useRates, useSeries } from "@/hooks/use-market-data";
import { ApiError } from "@/lib/api/client";
import type { MarketKind } from "@/lib/api/types";
import { MARKET_LABELS } from "@/lib/api/types";
import { USD_PER_UNIT } from "@/lib/market/universe";
import { derivePortfolio } from "@/lib/portfolio/derive";
import { undoableToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { usePortfolio } from "@/store/use-portfolio";
import { usePreferences } from "@/store/use-preferences";
import { resolveWatchlist, useWatchlist } from "@/store/use-watchlist";

/**
 * Everything the user is following, with ember's current read on each.
 *
 * This was `/watchlist`, a destination of its own. It is now the **Watching**
 * segment of Portfolio, because under an alpha-finder framing a watchlist is
 * not somewhere you go — it is one of the two lists that tell ember what to
 * watch for you, and the other one is your holdings. They belong on the same
 * screen.
 *
 * The point of difference from the signals feed survives the move: this list
 * is complete and it includes holds. The feed answers "what should I do
 * today"; this answers "where does ember stand on the things I care about",
 * and for most of them on most days the honest answer is nothing. Showing that
 * plainly is what makes the feed's restraint legible rather than making the
 * app look empty.
 *
 * Self-contained by design — it owns its search, sort and follow controls, so
 * the parent screen doesn't have to know a segment's state exists.
 */

type SortKey = "symbol" | "change" | "conviction";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "symbol", label: "Symbol" },
  { value: "change", label: "Biggest move" },
  { value: "conviction", label: "Strongest signal" },
];

const MARKET_ORDER: MarketKind[] = ["equity", "crypto", "fx"];

export function WatchlistPanel() {
  const hydrated = useHydrated();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("symbol");
  const [adding, setAdding] = useState(false);

  const watched = useWatchlist((s) => s.symbols);
  const removeFromWatchlist = useWatchlist((s) => s.remove);
  const addToWatchlist = useWatchlist((s) => s.add);
  const setWatchlist = useWatchlist((s) => s.setSymbols);
  const resetWatchlist = useWatchlist((s) => s.reset);

  const markets = usePreferences((s) => s.markets);
  const riskProfile = usePreferences((s) => s.riskProfile);
  const base = usePreferences((s) => s.baseCurrency);
  const transactions = usePortfolio((s) => s.transactions);

  const instrumentsQuery = useInstruments();
  const quotesQuery = useQuotes();
  const adviceQuery = useAdvice(riskProfile);
  const ratesQuery = useRates();

  const instruments = useMemo(
    () => instrumentsQuery.data?.instruments ?? [],
    [instrumentsQuery.data],
  );
  const universe = useMemo(() => instruments.map((i) => i.symbol), [instruments]);

  const seriesQuery = useSeries(universe, "1M");

  /** Symbols on the list, before the settings filter. */
  const followed = useMemo(
    () => (hydrated ? resolveWatchlist(watched, universe) : universe),
    [hydrated, watched, universe],
  );

  const positionWeights = useMemo(() => {
    const summary = derivePortfolio({
      transactions: hydrated ? transactions : [],
      quotes: quotesQuery.data?.quotes ?? [],
      instruments,
      rates: ratesQuery.data?.rates ?? USD_PER_UNIT,
      base,
    });
    return new Map(summary.positions.map((p) => [p.symbol, p.weight]));
  }, [hydrated, transactions, quotesQuery.data, instruments, ratesQuery.data, base]);

  const rows = useMemo<WatchRow[]>(() => {
    const bySymbol = new Map(instruments.map((i) => [i.symbol, i]));
    const quoteBy = new Map((quotesQuery.data?.quotes ?? []).map((q) => [q.symbol, q]));
    const candlesBy = new Map(
      (seriesQuery.data?.series ?? []).map((s) => [s.symbol, s.candles]),
    );
    const adviceBy = new Map(
      (adviceQuery.data?.assessments ?? []).map((a) => [a.symbol, a]),
    );
    // The route already applies `isActionable` for this risk profile, so the
    // feed's bar and the badge's tint can't drift apart.
    const actionable = new Set(adviceQuery.data?.actionable ?? []);

    return followed
      .map((symbol) => bySymbol.get(symbol))
      .filter((i): i is NonNullable<typeof i> => i !== undefined)
      .map((instrument) => ({
        instrument,
        quote: quoteBy.get(instrument.symbol) ?? null,
        candles: candlesBy.get(instrument.symbol) ?? [],
        assessment: adviceBy.get(instrument.symbol) ?? null,
        actionable: actionable.has(instrument.symbol),
        weight: positionWeights.get(instrument.symbol) ?? null,
      }));
  }, [followed, instruments, quotesQuery.data, seriesQuery.data, adviceQuery.data, positionWeights]);

  /** How many rows the settings market filter is holding back. */
  const hiddenByMarket = rows.filter((r) => !markets[r.instrument.market]).length;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const filtered = rows
      .filter((r) => markets[r.instrument.market])
      .filter(
        (r) =>
          needle === "" ||
          r.instrument.symbol.toLowerCase().includes(needle) ||
          r.instrument.name.toLowerCase().includes(needle),
      );

    const score = (r: WatchRow) =>
      r.assessment ? Math.abs(r.assessment.score) * r.assessment.confidence : -1;

    switch (sort) {
      case "change":
        return [...filtered].sort(
          (a, b) => Math.abs(b.quote?.changePct ?? 0) - Math.abs(a.quote?.changePct ?? 0),
        );
      case "conviction":
        return [...filtered].sort((a, b) => score(b) - score(a));
      case "symbol":
        return [...filtered].sort((a, b) =>
          a.instrument.symbol.localeCompare(b.instrument.symbol),
        );
    }
  }, [rows, markets, query, sort]);

  /**
   * Grouped only when sorting alphabetically.
   *
   * "Biggest move" and "strongest signal" are questions about the whole list —
   * splitting the answer into three market sections and re-ranking inside each
   * would hide the actual top of the list behind a heading.
   */
  const grouped = useMemo(() => {
    if (sort !== "symbol") return null;
    return MARKET_ORDER.map((market) => ({
      market,
      rows: visible.filter((r) => r.instrument.market === market),
    })).filter((g) => g.rows.length > 0);
  }, [visible, sort]);

  const unwatched = useMemo(
    () => instruments.filter((i) => !followed.includes(i.symbol)),
    [instruments, followed],
  );

  const handleRemove = (symbol: string) => {
    // Captured before the mutation, sentinel and all — see `setSymbols`.
    const previous = watched === null ? null : [...watched];
    removeFromWatchlist(symbol, universe);
    undoableToast(`Stopped following ${symbol}`, {
      onUndo: () => setWatchlist(previous),
    });
  };

  const loading = !hydrated || instrumentsQuery.isPending || quotesQuery.isPending;
  const error = instrumentsQuery.error ?? quotesQuery.error;

  if (error) {
    return (
      <ErrorState
        message={
          error instanceof ApiError ? error.message : "The watchlist didn't load."
        }
        onRetry={() => {
          void instrumentsQuery.refetch();
          void quotesQuery.refetch();
        }}
      />
    );
  }

  const list = (items: WatchRow[]) => (
    <Rows>
      {items.map((row) => (
        <WatchlistRow
          key={row.instrument.symbol}
          row={row}
          onRemove={() => handleRemove(row.instrument.symbol)}
        />
      ))}
    </Rows>
  );

  return (
    <div className="space-y-6">
      {/* No toolbar over an empty list — a search box above "you've unfollowed
          everything" is furniture with nothing to act on. */}
      <div
        className={cn(
          "flex items-center gap-2.5",
          (loading || followed.length === 0) && "hidden",
        )}
      >
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-[1.125rem] -translate-y-1/2 text-stone"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            aria-label="Search the watchlist"
            className="pl-11"
            autoComplete="off"
          />
        </div>

        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-44 shrink-0" aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {unwatched.length > 0 && (
          <Button
            size="icon-lg"
            onClick={() => setAdding(true)}
            aria-label="Follow an instrument"
            className="shrink-0"
          >
            <Plus />
          </Button>
        )}
      </div>

      {loading ? (
        <WatchlistRowSkeleton rows={6} />
      ) : followed.length === 0 ? (
        <EmptyWatchlist onAdd={() => setAdding(true)} onReset={resetWatchlist} />
      ) : visible.length === 0 ? (
        <p className="text-caption text-stone">
          {query.trim()
            ? `Nothing on your watchlist matches “${query.trim()}”.`
            : "Every instrument you follow belongs to a market that's switched off."}
        </p>
      ) : grouped ? (
        <div className="space-y-8">
          {grouped.map((group) => (
            <section key={group.market}>
              <h3 className="eyebrow mb-2">{MARKET_LABELS[group.market]}</h3>
              {list(group.rows)}
            </section>
          ))}
        </div>
      ) : (
        list(visible)
      )}

      {/* A filter the user set on another screen has to explain itself here,
          or the missing rows read as a bug. */}
      {hiddenByMarket > 0 && (
        <p className="text-micro text-stone">
          {hiddenByMarket} {hiddenByMarket === 1 ? "instrument is" : "instruments are"}{" "}
          hidden by your market filter.{" "}
          <Link href="/settings" className="underline underline-offset-2 hover:text-stone">
            Change it in settings
          </Link>
          .
        </p>
      )}

      {adviceQuery.isPending && (
        <p className="text-micro text-stone">Working out where ember stands…</p>
      )}

      <AddSymbols
        open={adding}
        onOpenChange={setAdding}
        available={unwatched}
        onAdd={addToWatchlist}
      />
    </div>
  );
}

function EmptyWatchlist({
  onAdd,
  onReset,
}: {
  onAdd: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col items-start">
      <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-surface-2 text-stone">
        <Eye size={22} />
      </div>
      <h2 className="text-heading font-semibold text-ink">
        You&apos;ve unfollowed everything
      </h2>
      <p className="mt-2 max-w-sm text-body text-stone">
        Follow the instruments you care about to see live prices and where ember stands
        on each — including the ones it says to leave alone.
      </p>
      <div className="mt-6 flex flex-wrap gap-2.5">
        <Button size="lg" onClick={onAdd}>
          <Plus />
          Follow an instrument
        </Button>
        <Button size="lg" variant="outline" onClick={onReset}>
          Follow everything again
        </Button>
      </div>
    </div>
  );
}
