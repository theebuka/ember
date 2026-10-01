"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Eye, Plus } from "@/components/common/icon";
import { SignalCard, SignalCardSkeleton } from "@/components/signals/signal-card";
import { ErrorState } from "@/components/common/error-state";
import { PageBody } from "@/components/common/page-body";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { SectionHeader } from "@/components/common/section-header";
import { Segmented } from "@/components/common/segmented";
import { ChangeChip } from "@/components/market/change-chip";
import { DataSourceChip } from "@/components/market/data-source-chip";
import { PriceChart, PriceChartSkeleton } from "@/components/market/price-chart";
import { TransactionForm } from "@/components/portfolio/transaction-form";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  useAsset,
  useInstruments,
  useQuotes,
  useRates,
  useSeries,
  useTrackRecord,
} from "@/hooks/use-market-data";
import { ApiError } from "@/lib/api/client";
import {
  MARKET_LABELS,
  type AssetMetric,
  type Range,
  type Transaction,
} from "@/lib/api/types";
import {
  formatCompactMoney,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatQuotePrice,
  formatRatio,
  formatShortDate,
} from "@/lib/market/format";
import { USD_PER_UNIT } from "@/lib/market/universe";
import { derivePortfolio } from "@/lib/portfolio/derive";
import { undoableToast } from "@/lib/toast";
import { usePortfolio } from "@/store/use-portfolio";
import { usePreferences } from "@/store/use-preferences";
import { resolveWatchlist, useWatchlist } from "@/store/use-watchlist";
import { cn } from "@/lib/utils";

/**
 * One instrument, end to end.
 *
 * The metrics grid is the part worth defending. It isn't a generic tile wall
 * of whatever the provider happened to return — it is **the exact inputs the
 * strategies read for this asset class**: the Piotroski and Magic Formula
 * terms on an equity, the MVRV terms on a crypto, the two policy rates behind
 * carry on a pair. So a rationale on the advice card ("earns 8.5% on its
 * enterprise value") can be traced to the number that produced it, one page
 * away. That traceability is the product's whole argument, applied to a screen.
 */

const RANGES: { value: Range; label: string }[] = [
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "1Y", label: "1Y" },
  { value: "ALL", label: "All" },
];

export function AssetScreen({ symbol }: { symbol: string }) {
  const hydrated = useHydrated();
  const [range, setRange] = useState<Range>("3M");
  const [logging, setLogging] = useState(false);

  const riskProfile = usePreferences((s) => s.riskProfile);
  const base = usePreferences((s) => s.baseCurrency);
  const transactions = usePortfolio((s) => s.transactions);
  const addTransaction = usePortfolio((s) => s.add);
  const removeTransaction = usePortfolio((s) => s.remove);

  const watched = useWatchlist((s) => s.symbols);
  const addToWatchlist = useWatchlist((s) => s.add);
  const removeFromWatchlist = useWatchlist((s) => s.remove);
  const setWatchlist = useWatchlist((s) => s.setSymbols);

  const assetQuery = useAsset(symbol, riskProfile);
  const seriesQuery = useSeries([symbol], range);
  const trackRecordQuery = useTrackRecord(riskProfile);
  const instrumentsQuery = useInstruments();
  const quotesQuery = useQuotes();
  const ratesQuery = useRates();

  const asset = assetQuery.data;
  const instrument = asset?.instrument;

  const universe = useMemo(
    () => (instrumentsQuery.data?.instruments ?? []).map((i) => i.symbol),
    [instrumentsQuery.data],
  );
  const isWatched = hydrated && resolveWatchlist(watched, universe).includes(symbol);

  /**
   * Is there anything to reserve room for?
   *
   * A presence test, not arithmetic — nothing downstream reads this number, so
   * it does not violate "holdings are derived, never stored". It walks the
   * ledger rather than the derived summary because the summary needs three
   * network responses and this needs none: it is true one frame after
   * hydration, which is four seconds before `position` exists.
   *
   * Net, not "has ever traded", because a fully closed position must reserve
   * nothing — space held for a block that never arrives collapses upward,
   * which is the same shift pointing the other way.
   */
  const holdsSymbol = useMemo(() => {
    if (!hydrated) return false;
    let net = 0;
    for (const t of transactions) {
      if (t.symbol !== symbol) continue;
      net += t.side === "buy" ? t.quantity : -t.quantity;
    }
    return net > 1e-9;
  }, [hydrated, transactions, symbol]);

  const position = useMemo(() => {
    const summary = derivePortfolio({
      transactions: hydrated ? transactions : [],
      quotes: quotesQuery.data?.quotes ?? [],
      instruments: instrumentsQuery.data?.instruments ?? [],
      rates: ratesQuery.data?.rates ?? USD_PER_UNIT,
      base,
    });
    return summary.positions.find((p) => p.symbol === symbol) ?? null;
  }, [
    hydrated,
    transactions,
    quotesQuery.data,
    instrumentsQuery.data,
    ratesQuery.data,
    base,
    symbol,
  ]);

  /** Past calls the engine made on this instrument, newest first. */
  const pastCalls = useMemo(
    () =>
      (trackRecordQuery.data?.trades ?? [])
        .filter((t) => t.symbol === symbol)
        .sort((a, b) => b.entryAt - a.entryAt),
    [trackRecordQuery.data, symbol],
  );

  const candles = seriesQuery.data?.series[0]?.candles ?? [];

  const toggleWatch = () => {
    const previous = watched === null ? null : [...watched];
    if (isWatched) {
      removeFromWatchlist(symbol, universe);
      undoableToast(`Stopped following ${symbol}`, {
        onUndo: () => setWatchlist(previous),
      });
    } else {
      addToWatchlist(symbol);
      undoableToast(`Following ${symbol}`, {
        onUndo: () => setWatchlist(previous),
      });
    }
  };

  const handleLogged = (values: Omit<Transaction, "id">) => {
    const id = addTransaction(values);
    setLogging(false);
    undoableToast(`${values.side === "buy" ? "Buy" : "Sell"} logged`, {
      description: `${formatQuantity(values.quantity, instrument?.market ?? "equity")} ${symbol}`,
      onUndo: () => removeTransaction(id),
    });
  };

  if (assetQuery.error) {
    const notFound =
      assetQuery.error instanceof ApiError && assetQuery.error.status === 404;
    return (
      <>
        <PageHeader title={symbol} back="/portfolio?view=watching" />
        <PageBody>
          <ErrorState
            message={
              assetQuery.error instanceof ApiError
                ? assetQuery.error.message
                : "This asset didn't load."
            }
            onRetry={notFound ? undefined : () => assetQuery.refetch()}
          />
          {notFound && (
            <Link
              href="/portfolio?view=watching"
              className="mt-3 inline-block rounded-sm text-caption font-medium text-brand-text underline-offset-4 hover:underline"
            >
              See what ember does follow
            </Link>
          )}
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        narrow
        title={symbol}
        back={true}
        actions={
          <>
            {/* Three actions plus a back control don't fit beside a title at
                375px — the header was truncating "BTC" to "B…". The chip is
                the one that can go: the metrics notes on this page already say
                the figures are generated, and it returns at `sm`. */}
            <DataSourceChip className="hidden sm:inline-flex" />
            {/* Labelled, both. An eye and a plus beside a title were two
                guesses; the title steps down a size on a phone to make room. */}
            <Button
              variant="outline"
              size="sm"
              onClick={toggleWatch}
              aria-pressed={isWatched}
              title={isWatched ? `Stop following ${symbol}` : `Follow ${symbol}`}
            >
              {isWatched ? <Check /> : <Eye />}
              {isWatched ? "Watching" : "Watch"}
            </Button>
            <Button size="sm" onClick={() => setLogging(true)}>
              <Plus />
              Log trade
            </Button>
          </>
        }
      />

      <PageBody narrow className="space-y-9 pb-12">
        {/* ── Price ────────────────────────────────────────────────────── */}
        {!asset || !instrument ? (
          <HeroSkeleton />
        ) : (
          /**
           * One element, not a fragment of two — and that is a fix, not a tidy.
           *
           * `PageBody` here is `space-y-9`, which puts 36px between *siblings*.
           * A fragment made the name block and the price row two siblings, so
           * the `mt-3` below was overridden and the price sat 36px under the
           * name instead of the 12 it asks for. It also meant the skeleton
           * (one element, one gap) and the real hero (two elements, two gaps)
           * could never be the same height however carefully the rows were
           * sized — 50px of the asset screen's layout shift was this alone.
           */
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-title font-semibold text-ink">
                  {instrument.name}
                </h2>
                <p className="mt-0.5 flex items-center gap-2 text-micro text-stone">
                  <span className="mono-label">{instrument.symbol}</span>
                  <span className="text-stone">·</span>
                  {MARKET_LABELS[instrument.market]}
                  {instrument.sector && (
                    <>
                      <span className="text-stone">·</span>
                      {instrument.sector}
                    </>
                  )}
                </p>
              </div>
            </div>

            {asset.quote && (
              <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="figure text-display text-ink">
                  {formatQuotePrice(instrument, asset.quote.price)}
                </span>
                <ChangeChip value={asset.quote.changePct}>
                  {formatPercent(asset.quote.changePct, { signed: true })}
                </ChangeChip>
                <span className="num text-caption text-stone">
                  {formatQuotePrice(instrument, asset.quote.change)} today
                </span>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 border-t border-line pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="eyebrow">Price</h3>
            <Segmented
              value={range}
              onChange={setRange}
              options={RANGES}
              size="sm"
              aria-label="Chart range"
            />
          </div>
          {seriesQuery.isPending ? (
            <PriceChartSkeleton />
          ) : (
            <PriceChart candles={candles} instrument={instrument ?? null} />
          )}
        </div>

        {/* ── Your position ──────────────────────────────────────────────
            Reserved from the ledger, filled from the queries.

            `position` needs quotes, rates *and* `instrument`, and `instrument`
            arrives on the asset payload — the slowest call on the page. So
            this section used to be inserted around four seconds in, pushing
            ember's read and everything under it 185px down the page: 0.064 of
            layout shift, and by then the reader is looking at the thing that
            moves.

            Whether there is a position to show, though, is knowable from
            `localStorage` the moment hydration finishes. So the block is
            reserved on the ledger's answer and filled on the queries', which
            turns an insertion into a swap. */}
        {holdsSymbol && !(position && instrument) && <PositionSkeleton />}
        {position && instrument && (
          <section>
            <SectionHeader title="Your position" href="/portfolio" linkLabel="Portfolio" />
            <dl className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
              <Figure
                label="Quantity"
                value={formatQuantity(position.quantity, instrument.market)}
              />
              <Figure
                label="Average cost"
                value={formatQuotePrice(instrument, position.averageCost)}
              />
              <Figure
                label="Market value"
                value={formatMoney(position.marketValue, base)}
              />
              <Figure
                label="Unrealized"
                value={formatMoney(position.unrealized, base, { signed: true })}
                hint={
                  position.unrealizedPct === null
                    ? undefined
                    : formatPercent(position.unrealizedPct, { signed: true })
                }
                tone={position.unrealized}
              />
            </dl>
          </section>
        )}

        {/* ── ember's read ─────────────────────────────────────────────── */}
        <section>
          <SectionHeader title="ember's read" hint={`${riskProfile} profile`} />
          {!asset ? (
            // The real card is 500–700px. A 160px box here was most of a 0.61
            // cumulative layout shift on this page: every section below it
            // dropped half a screen when the read arrived.
            <SignalCardSkeleton />
          ) : asset.assessment && instrument ? (
            <SignalCard
              assessment={asset.assessment}
              instrument={instrument}
              base={base}
              actionable={asset.actionable}
              heldWeight={position?.weight ?? null}
              suggested={null}
              handled={null}
              blockedReason={
                asset.actionable
                  ? "Act on this from the signals feed, where it can be marked handled."
                  : null
              }
              onExecute={() => setLogging(true)}
              onUndo={() => undefined}
              // The page is about this instrument; the header and the hero
              // already name it, and a third time was the call repeating it.
              identity={false}
            />
          ) : instrument?.dataState === "collecting" ? (
            /**
             * A wait, not a judgement — and the difference is the whole reason
             * `dataState` exists.
             *
             * The Nigerian Exchange publishes today's board and no history at
             * all, so ember stores a session a day itself and cannot say
             * anything until it holds two hundred. Rendering the generic "not
             * enough history" line here would be true and misleading: it reads
             * as ember having looked, when ember has not been able to look yet
             * and is doing something about it.
             */
            <div className="rounded-xl bg-surface-2 px-4 py-3.5">
              <p className="text-caption font-medium text-ink">
                ember is still collecting history for {symbol}
              </p>
              <p className="mt-1.5 text-caption text-stone text-pretty">
                The Nigerian Exchange publishes today&rsquo;s prices and no past
                ones, and no free source carries them — so ember stores a
                session a day itself and will form a view once it has about two
                hundred of them. The price above is live; there is simply
                nothing yet to measure it against.
              </p>
            </div>
          ) : (
            <p className="py-2 text-caption text-stone">
              Not enough history to form a view on {symbol} yet. The regime filter
              needs about a year of bars before it will say anything.
            </p>
          )}
        </section>

        {/* ── The numbers the rules read ───────────────────────────────── */}
        {/* Placeholder groups while the asset request is in flight. The real
            count is class-dependent (two for FX, three for an equity), so this
            reserves the common case rather than pretending to know — better a
            small correction than a whole page of sections appearing at once. */}
        {!asset &&
          [0, 1].map((i) => (
            <section key={i}>
              <SectionHeader title=" " />
              <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 4 }, (_, j) => (
                  <div key={j} className="min-w-0">
                    <Skeleton className="w-20">
                      <span className="block text-micro text-transparent">l</span>
                    </Skeleton>
                    <Skeleton className="mt-1 w-24">
                      <span className="block text-body text-transparent">v</span>
                    </Skeleton>
                  </div>
                ))}
              </div>
            </section>
          ))}

        {asset?.groups.map((group) => (
          <section key={group.title}>
            <SectionHeader title={group.title} />
            <dl className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
              {group.metrics.map((metric) => (
                <Figure
                  key={metric.key}
                  label={metric.label}
                  value={renderMetric(metric, instrument)}
                  hint={metric.hint}
                />
              ))}
            </dl>
            {group.note && (
              <p className="mt-4 border-t border-line pt-3 text-micro text-stone">
                {group.note}
              </p>
            )}
          </section>
        ))}

        {/* ── What happened last time ──────────────────────────────────── */}
        <section>
          <SectionHeader
            title="Past calls on this asset"
            hint="from the walk-forward backtest"
            href="/signals/track-record"
            linkLabel="Full record"
          />
          {trackRecordQuery.isPending ? (
            <Skeleton className="h-20 w-full" />
          ) : pastCalls.length === 0 ? (
            <p className="py-2 text-caption text-stone">
              The engine never issued a call on {symbol} in the backtest window.
              That&apos;s a real result, not missing data — it never cleared the
              bar.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {pastCalls.map((trade) => (
                <li
                  key={trade.entryAt}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-caption text-ink capitalize">
                      {trade.action}
                    </p>
                    <p className="num text-micro text-stone">
                      {formatShortDate(trade.entryAt)} →{" "}
                      {formatShortDate(trade.exitAt)} · {trade.holdBars} bars
                      {trade.stopped && " · stopped out"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "num shrink-0 text-caption font-medium",
                      trade.return > 0
                        ? "text-up"
                        : trade.return < 0
                          ? "text-down"
                          : "text-stone",
                    )}
                  >
                    {formatPercent(trade.return, { signed: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-micro text-stone">
          ember gives information, not financial advice.{" "}
          <Link
            href="/signals/methodology"
            className="underline underline-offset-2 hover:text-stone"
          >
            How the signals are built
          </Link>
          .
        </p>
      </PageBody>

      <ResponsiveModal
        open={logging}
        onOpenChange={setLogging}
        title="Log a trade"
        description={`Pre-filled for ${symbol}. Everything stays editable.`}
      >
        <TransactionForm
          instruments={instrumentsQuery.data?.instruments ?? []}
          quotes={quotesQuery.data?.quotes ?? []}
          existing={transactions}
          defaults={{
            symbol,
            price: asset?.quote ? String(asset.quote.price) : "",
          }}
          onSubmit={handleLogged}
          onCancel={() => setLogging(false)}
        />
      </ResponsiveModal>
    </>
  );
}

/** Formatting stays on the client, where the locale is pinned. */
function renderMetric(
  metric: AssetMetric,
  instrument: { currency: string; precision: number } | undefined,
): string {
  switch (metric.format) {
    case "percent":
      return formatPercent(metric.value, { decimals: 1 });
    case "ratio":
      return formatRatio(metric.value);
    case "compact":
      return new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(metric.value);
    case "compactMoney":
      return formatCompactMoney(metric.value, "USD");
    case "price":
      return instrument
        ? formatMoney(metric.value, instrument.currency as "USD", {
            decimals: instrument.precision,
          })
        : String(metric.value);
    case "money":
      return formatMoney(metric.value, "USD");
  }
}

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: number;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-micro text-stone">{label}</dt>
      <dd
        className={cn(
          "num truncate text-body font-medium",
          tone === undefined || tone === 0
            ? "text-ink"
            : tone > 0
              ? "text-up"
              : "text-down",
        )}
      >
        {value}
      </dd>
      {/* The hint lives inside the <dd>, not beside it. A <div> child of a
          <dl> may only contain <dt> and <dd> — a stray <p> there is invalid
          markup and axe flags the whole list as unparseable. */}
      {hint && (
        <dd className="truncate text-micro text-stone">{hint}</dd>
      )}
    </div>
  );
}

/**
 * Your position, before the numbers land.
 *
 * The real block is a `SectionHeader` over a two-up grid of four `Figure`s,
 * one of which carries a hint line. This mirrors that exactly — same grid,
 * same gaps, same type classes, `h-[1lh]` throughout — so the swap costs
 * nothing. The header is rendered for real rather than as a grey bar: it says
 * something true before the data arrives, and a title is not a loading state.
 */
function PositionSkeleton() {
  return (
    <section aria-hidden>
      <SectionHeader title="Your position" href="/portfolio" linkLabel="Portfolio" />
      <dl className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
        {["Quantity", "Average cost", "Market value", "Unrealized"].map(
          (label, i) => (
            <div key={label} className="min-w-0">
              <dt className="text-micro text-stone">{label}</dt>
              <dd>
                <Skeleton className="h-[1lh] w-20 text-body" />
              </dd>
              {/* Only the last Figure has a hint, and it is the reason the
                  grid's rows are uneven. Reserving it on the wrong cell would
                  be a different height, not a matching one. */}
              {i === 3 && (
                <dd>
                  <Skeleton className="h-[1lh] w-12 text-micro" />
                </dd>
              )}
            </div>
          ),
        )}
      </dl>
    </section>
  );
}

/**
 * The one skeleton ADR 0019 missed.
 *
 * It shipped as `h-6` / `h-3` / `h-9` — flat pixel heights guessed against a
 * type scale that has since changed twice. Measured in phase 17 it stood 90px
 * tall where the real hero is 158: a 68px jump on load that pushed the chart,
 * the position block and the signal card down the page, and was most of the
 * asset screen's 0.118 layout shift on mobile. Exactly the failure the ADR was
 * written about, in the one place the sweep after it didn't reach.
 *
 * Every row is now `h-[1lh]` in the *real* type class, so the height is the
 * font's line box rather than a number anybody chose. The wrapper repeats the
 * live element's flex classes for the same reason — `items-baseline` and
 * `gap-y-1` are what let the row wrap the way it really wraps at 375px.
 */
function HeroSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="h-[1lh] w-40 text-title" />
      <Skeleton className="mt-0.5 h-[1lh] w-32 text-micro" />
      {/* The widths are chosen so the row *wraps where the real one wraps*:
          160 + 72 fits a 335px column, the third does not. The heights come
          from the type scale, so once the wrap matches the block matches. A
          five-figure price is wider than the four-figure one this was measured
          against and would wrap a step earlier — the residue of that is the
          only shift left here, and it is a few thousandths. */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Skeleton className="h-[1lh] w-40 text-display" />
        <Skeleton className="h-[26px] w-[72px] rounded-md" />
        <Skeleton className="h-[1lh] w-20 text-caption" />
      </div>
    </div>
  );
}
