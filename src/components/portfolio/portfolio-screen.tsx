"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Sparkles, Upload, Wallet } from "@/components/common/icon";
import { undoableToast } from "@/lib/toast";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { ErrorState } from "@/components/common/error-state";
import { PageBody } from "@/components/common/page-body";
import { Section, Rows, Row } from "@/components/common/section";
import { Segmented } from "@/components/common/segmented";
import { DataSourceChip } from "@/components/market/data-source-chip";
import { NotificationsButton } from "@/components/notifications/notifications-button";
import { CsvImport } from "@/components/portfolio/csv-import";
import {
  AllocationBar,
  PositionsListSkeleton,
} from "@/components/portfolio/positions-list";
import { PositionsTable } from "@/components/portfolio/positions-table";
import { Fab } from "@/components/common/fab";
import { TransactionForm } from "@/components/portfolio/transaction-form";
import { TransactionHistory } from "@/components/portfolio/transaction-history";
import { ValueChart, ValueChartSkeleton } from "@/components/portfolio/value-chart";
import { ValueHero, ValueHeroSkeleton } from "@/components/portfolio/value-hero";
import { PageHeader } from "@/components/shell/page-header";
import { WatchlistPanel } from "@/components/watchlist/watchlist-panel";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { useInstruments, useQuotes, useRates, useSeries } from "@/hooks/use-market-data";
import { ApiError } from "@/lib/api/client";
import type { Candle, Range, Transaction } from "@/lib/api/types";
import { formatMoney } from "@/lib/market/format";
import { USD_PER_UNIT } from "@/lib/market/universe";
import { derivePortfolio, portfolioValueSeries } from "@/lib/portfolio/derive";
import { sampleTransactions } from "@/lib/portfolio/sample";
import { usePortfolio } from "@/store/use-portfolio";
import { usePreferences } from "@/store/use-preferences";

/**
 * Everything the user's money is doing, and everything ember watches for them.
 *
 * The value block is always on top, because it is the context for all three
 * segments below it. Then:
 *
 *   **Holdings** — what you own now, with cost basis and unrealized P&L.
 *   **Watching** — the old `/watchlist`, folded in. A watchlist is not a
 *     destination; it is the second of the two lists that tell ember what to
 *     watch for you, and it belongs beside the first.
 *   **Activity** — realized P&L and the transaction log. The log is load
 *     bearing: it is the audit trail for every other number on the page, and
 *     a user who doesn't trust a figure has to be able to walk back to the row
 *     that produced it.
 *
 * v1 stacked all four vertically, which made the page long enough that the
 * ledger — the thing that makes the rest checkable — was three screens down.
 *
 * The segment lives in the URL so `/watchlist` can redirect straight to it and
 * so the browser's back button steps between segments the way people expect.
 *
 * Every mutation is optimistic with an undo, per the UX bar. There are no
 * confirmation dialogs here: a delete is one tap and a toast, because "are you
 * sure?" moves the decision to the wrong moment and gets clicked through
 * anyway.
 */

type Editing = { mode: "add"; symbol?: string } | { mode: "edit"; tx: Transaction };

const VIEWS = [
  { value: "holdings", label: "Holdings" },
  { value: "watching", label: "Watching" },
  { value: "activity", label: "Activity" },
] as const;

type View = (typeof VIEWS)[number]["value"];

function parseView(value: string | null): View {
  return VIEWS.some((v) => v.value === value) ? (value as View) : "holdings";
}

export function PortfolioScreen() {
  const hydrated = useHydrated();
  const router = useRouter();
  const params = useSearchParams();
  const view = parseView(params.get("view"));
  const [range, setRange] = useState<Range>("3M");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [importing, setImporting] = useState(false);

  const transactions = usePortfolio((s) => s.transactions);
  const isSample = usePortfolio((s) => s.isSample);
  const add = usePortfolio((s) => s.add);
  const addMany = usePortfolio((s) => s.addMany);
  const update = usePortfolio((s) => s.update);
  const remove = usePortfolio((s) => s.remove);
  const removeMany = usePortfolio((s) => s.removeMany);
  const restore = usePortfolio((s) => s.restore);
  const loadSample = usePortfolio((s) => s.loadSample);
  const clearPortfolio = usePortfolio((s) => s.clear);

  const base = usePreferences((s) => s.baseCurrency);

  const instrumentsQuery = useInstruments();
  const quotesQuery = useQuotes();
  const ratesQuery = useRates();

  const instruments = useMemo(
    () => instrumentsQuery.data?.instruments ?? [],
    [instrumentsQuery.data],
  );
  const quotes = useMemo(() => quotesQuery.data?.quotes ?? [], [quotesQuery.data]);
  const rates = ratesQuery.data?.rates ?? USD_PER_UNIT;

  const heldSymbols = useMemo(() => {
    if (!hydrated) return [];
    return [...new Set(transactions.map((t) => t.symbol))].sort();
  }, [hydrated, transactions]);

  const historyQuery = useSeries(heldSymbols, range);

  const summary = useMemo(
    () =>
      derivePortfolio({
        transactions: hydrated ? transactions : [],
        quotes,
        instruments,
        rates,
        base,
      }),
    [hydrated, transactions, quotes, instruments, rates, base],
  );

  const valuePoints = useMemo(() => {
    const series = historyQuery.data?.series ?? [];
    if (series.length === 0) return [];
    const candles = new Map<string, readonly Candle[]>(
      series.map((s) => [s.symbol, s.candles]),
    );
    return portfolioValueSeries({
      transactions: hydrated ? transactions : [],
      candles,
      instruments,
      rates,
      base,
      // So the line ends on the same number the hero above it is showing.
      quotes,
    });
  }, [historyQuery.data, hydrated, transactions, instruments, rates, base, quotes]);

  /**
   * Where the realized figure in the hero came from.
   *
   * Includes symbols the user still holds. Booking a profit by trimming a
   * position is realized P&L exactly as much as closing one out is, and
   * listing only full exits left the sample book showing +$1,063.95 in the
   * hero with nothing on the page accounting for it — a number with no
   * provenance, on a screen whose whole argument is that every number has one.
   */
  const realized = useMemo(() => {
    const rows = [
      ...summary.positions
        .filter((p) => p.realized !== 0)
        .map((p) => ({ symbol: p.symbol, realized: p.realized, stillHeld: true })),
      ...summary.closed.map((c) => ({ ...c, stillHeld: false })),
    ];
    return rows.sort((a, b) => b.realized - a.realized);
  }, [summary.positions, summary.closed]);

  /* ── Mutations ───────────────────────────────────────────────────────── */

  const handleSubmit = (values: Omit<Transaction, "id">) => {
    if (editing?.mode === "edit") {
      const previous = editing.tx;
      update(previous.id, values);
      setEditing(null);
      undoableToast("Trade updated", {
        // Undo restores the whole previous row rather than diffing: an edit can
        // change six fields and reverting five of them is not an undo.
        onUndo: () => update(previous.id, previous),
      });
      return;
    }

    const id = add(values);
    setEditing(null);
    undoableToast(`${values.side === "buy" ? "Buy" : "Sell"} logged`, {
      description: `${values.quantity} ${values.symbol}`,
      onUndo: () => remove(id),
    });
  };

  const handleDelete = (tx: Transaction) => {
    const removed = remove(tx.id);
    if (!removed) return;
    undoableToast("Trade deleted", {
      description: `${removed.side === "buy" ? "Buy" : "Sell"} ${removed.quantity} ${removed.symbol}`,
      onUndo: () => restore(removed),
    });
  };

  const handleImport = (rows: Omit<Transaction, "id">[]) => {
    const ids = addMany(rows);
    undoableToast(`${rows.length} ${rows.length === 1 ? "trade" : "trades"} imported`, {
      onUndo: () => removeMany(ids),
    });
  };

  const handleClearSample = () => {
    // Captured before the clear, and stripped of ids so `loadSample` reissues
    // them — the flag it sets is the point, otherwise undo would restore the
    // rows without restoring the "this isn't yours" label.
    const previous = transactions.map((tx) => ({
      symbol: tx.symbol,
      side: tx.side,
      quantity: tx.quantity,
      price: tx.price,
      fees: tx.fees,
      date: tx.date,
      account: tx.account,
      note: tx.note,
    }));

    clearPortfolio();
    undoableToast("Sample book cleared", {
      onUndo: () => loadSample(previous),
    });
  };

  /* ── Render ──────────────────────────────────────────────────────────── */

  const loading = !hydrated || quotesQuery.isPending || instrumentsQuery.isPending;
  const isEmpty = hydrated && transactions.length === 0;
  const quotesError = quotesQuery.error;

  return (
    <>
      <PageHeader
        title="Portfolio"
        actions={
          <>
            <DataSourceChip />
            <NotificationsButton />
            {/* Desktop only — on a phone this action is the FAB below, which
                is the same control at thumb height rather than a second one
                (decision 212's duplicate CTA, in a different costume). */}
            <Button
              size="sm"
              onClick={() => setEditing({ mode: "add" })}
              // `hydrated` first: a warm instruments cache can answer before
              // hydration, and the server always renders this disabled.
              disabled={!hydrated || instruments.length === 0}
              className="hidden md:inline-flex"
            >
              <Plus />
              Log trade
            </Button>
          </>
        }
      />

      {/* `AppShell` already clears the bottom nav for every screen. The FAB
          stands 84px above that, so the last rows of the ledger would otherwise
          finish underneath it — the one thing a floating button must never be
          allowed to hide is the end of the list it acts on. */}
      <PageBody className="pb-12 max-md:pb-24">
        {quotesError ? (
          <ErrorState
            message={
              quotesError instanceof ApiError
                ? quotesError.message
                : "Prices didn't load, so your positions can't be valued."
            }
            onRetry={() => quotesQuery.refetch()}
          />
        ) : isEmpty ? (
          <EmptyLedger
            onAdd={() => setEditing({ mode: "add" })}
            onImport={() => setImporting(true)}
            onLoadSample={() => loadSample(sampleTransactions())}
          />
        ) : (
          <div className="space-y-9">
            {/* ── Value ───────────────────────────────────────────────── */}
            <div>
              {loading ? (
                <>
                  <ValueHeroSkeleton />
                  <div className="mt-6">
                    <ValueChartSkeleton />
                  </div>
                </>
              ) : (
                <>
                  <ValueHero summary={summary} />
                  <div className="mt-6">
                    {historyQuery.isPending ? (
                      <ValueChartSkeleton />
                    ) : (
                      <ValueChart
                        points={valuePoints}
                        range={range}
                        onRangeChange={setRange}
                        base={base}
                      />
                    )}
                  </div>
                  {isSample && (
                    <p className="mt-5 text-micro text-stone">
                      This is the sample book — none of these are your holdings.{" "}
                      <button type="button" onClick={handleClearSample} className="tap-target font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                        Clear it
                      </button>
                    </p>
                  )}
                </>
              )}
            </div>

            {/* ── Segments ────────────────────────────────────────────── */}
            <Segmented
              value={view}
              onChange={(next) =>
                // `replace`, not `push` — a segment is a view of one screen,
                // and pushing would make Back walk through every tab you
                // glanced at before it left the page.
                router.replace(next === "holdings" ? "/portfolio" : `/portfolio?view=${next}`, {
                  scroll: false,
                })
              }
              options={VIEWS.map((v) => ({ value: v.value, label: v.label }))}
              aria-label="Portfolio view"
              className="w-full sm:w-auto"
            />

            {view === "holdings" && (
              <Section
                title="Positions"
                hint={
                  summary.positions.length > 0
                    ? `${summary.positions.length} open`
                    : undefined
                }
              >
                {loading ? (
                  <PositionsListSkeleton rows={5} />
                ) : summary.positions.length === 0 ? (
                  <p className="text-caption text-stone">
                    Everything you&apos;ve traded has been closed out. The realized
                    P&amp;L under Activity is what came of it.
                  </p>
                ) : (
                  <>
                    <AllocationBar positions={summary.positions} className="mb-5" />
                    <PositionsTable
                      positions={summary.positions}
                      base={base}
                      onSelect={(symbol) => setEditing({ mode: "add", symbol })}
                    />
                  </>
                )}
              </Section>
            )}

            {view === "watching" && <WatchlistPanel />}

            {view === "activity" && (
              <div className="space-y-9">
                {realized.length > 0 && (
                  <Section
                    title="Realized"
                    hint="booked on sales, lifetime"
                    action={
                      <span className={cnTone(summary.realized)}>
                        {formatMoney(summary.realized, base, { signed: true })}
                      </span>
                    }
                  >
                    <Rows>
                      {realized.map((entry) => (
                        <Row
                          key={entry.symbol}
                          trailing={
                            <span className={cnTone(entry.realized)}>
                              {formatMoney(entry.realized, base, { signed: true })}
                            </span>
                          }
                        >
                          <span className="flex items-baseline gap-2">
                            <span className="mono-label text-caption text-ink">
                              {entry.symbol}
                            </span>
                            <span className="text-micro text-stone">
                              {entry.stillHeld ? "trimmed" : "closed out"}
                            </span>
                          </span>
                        </Row>
                      ))}
                    </Rows>
                  </Section>
                )}

                <Section
                  title="Transactions"
                  hint={`${transactions.length} logged`}
                  action={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setImporting(true)}
                      className="h-7 px-2.5 text-micro"
                    >
                      <Upload />
                      Import
                    </Button>
                  }
                >
                  <TransactionHistory
                    transactions={transactions}
                    instruments={instruments}
                    onEdit={(tx) => setEditing({ mode: "edit", tx })}
                    onDelete={handleDelete}
                  />
                </Section>
              </div>
            )}

            <p className="text-micro text-stone">
              Cost basis is average-cost. Everything here is computed from your
              transactions — nothing is stored twice, so these figures can&apos;t drift
              apart.{" "}
              <Link
                href="/settings"
                className="underline underline-offset-2 hover:text-stone"
              >
                Export or clear your data
              </Link>
              .
            </p>
          </div>
        )}
      </PageBody>

      {/* ── Modals ────────────────────────────────────────────────────── */}
      {/* Not over the empty state: `EmptyLedger` already leads with Log a
          trade as its own primary action, and a floating copy of a button that
          is already the largest thing on the screen is noise. */}
      {/* And not until there is something to log a trade *in*. It was rendered
          disabled while instruments loaded — a half-transparent 56px pill for
          up to eight seconds on a cold live universe, which reads as broken
          rather than as waiting. Fixed-position, so arriving late moves
          nothing. */}
      {hydrated && !isEmpty && instruments.length > 0 && (
        <Fab
          onClick={() => setEditing({ mode: "add" })}
          label="Log trade"
          icon={<Plus weight="bold" className="size-5" />}
        />
      )}

      <ResponsiveModal
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing?.mode === "edit" ? "Edit trade" : "Log a trade"}
        description={
          editing?.mode === "edit"
            ? "Changing this recalculates every figure derived from it."
            : "Cost basis, P&L and allocation all fall out of what you enter here."
        }
      >
        {editing && (
          <TransactionForm
            // Remounts on every open so a cancelled edit doesn't leave its
            // values sitting in the form the next time it's opened.
            key={editing.mode === "edit" ? editing.tx.id : `add-${editing.symbol ?? ""}`}
            instruments={instruments}
            quotes={quotes}
            existing={transactions}
            editing={editing.mode === "edit" ? editing.tx : undefined}
            defaults={
              editing.mode === "add" && editing.symbol
                ? { symbol: editing.symbol }
                : undefined
            }
            onSubmit={handleSubmit}
            onCancel={() => setEditing(null)}
          />
        )}
      </ResponsiveModal>

      <CsvImport
        open={importing}
        onOpenChange={setImporting}
        instruments={instruments}
        existing={transactions}
        onImport={handleImport}
      />
    </>
  );
}

function cnTone(value: number): string {
  const colour = value > 0 ? "text-up" : value < 0 ? "text-down" : "text-stone";
  return `num text-caption font-medium ${colour}`;
}

function EmptyLedger({
  onAdd,
  onImport,
  onLoadSample,
}: {
  onAdd: () => void;
  onImport: () => void;
  onLoadSample: () => void;
}) {
  return (
    <div className="flex flex-col items-start py-2">
      <div className="mb-4 grid size-11 place-items-center rounded-2xl bg-surface-2 text-stone">
        <Wallet className="size-5" />
      </div>
      <h2 className="text-heading font-semibold text-ink">Nothing logged yet</h2>
      <p className="mt-1.5 max-w-md text-body text-stone">
        Add a trade and ember works out the rest — quantity, average cost, market value,
        and profit both realized and on paper. Holdings are never entered directly;
        they&apos;re derived from what you actually bought and sold.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button size="lg" onClick={onAdd}>
          <Plus />
          Log your first trade
        </Button>
        <Button size="lg" variant="outline" onClick={onImport}>
          <Upload />
          Import a CSV
        </Button>
        <Button size="lg" variant="ghost" onClick={onLoadSample}>
          <Sparkles />
          Use sample data
        </Button>
      </div>
    </div>
  );
}
