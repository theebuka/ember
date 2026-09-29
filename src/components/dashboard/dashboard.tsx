"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Sparkles, Wallet } from "@/components/common/icon";
import { ErrorState } from "@/components/common/error-state";
import { PageBody, PageColumns } from "@/components/common/page-body";
import { Section } from "@/components/common/section";
import { GreetingLine } from "@/components/dashboard/greeting-line";
import { PinnedBanner } from "@/components/dashboard/pinned-banner";
import { FindingsInbox } from "@/components/findings/findings-inbox";
import { DataSourceChip } from "@/components/market/data-source-chip";
import { NotificationsButton } from "@/components/notifications/notifications-button";
import { MarketPulse, MarketPulseSkeleton, type PulseRow } from "@/components/market/market-pulse";
import {
  AllocationBar,
  PositionsList,
  PositionsListSkeleton,
} from "@/components/portfolio/positions-list";
import { ValueChart, ValueChartSkeleton } from "@/components/portfolio/value-chart";
import { ValueHero, ValueHeroSkeleton } from "@/components/portfolio/value-hero";
import { PageHeader } from "@/components/shell/page-header";
import { ProfileButton } from "@/components/shell/profile-button";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { useInstruments, useQuotes, useRates, useSeries } from "@/hooks/use-market-data";
import { ApiError } from "@/lib/api/client";
import type { Candle, Range } from "@/lib/api/types";
import type { Broadcast } from "@/lib/notifications/inbox";
import { USD_PER_UNIT } from "@/lib/market/universe";
import { derivePortfolio, portfolioValueSeries } from "@/lib/portfolio/derive";
import { sampleTransactions } from "@/lib/portfolio/sample";
import { usePortfolio } from "@/store/use-portfolio";
import { usePreferences } from "@/store/use-preferences";

/**
 * The home screen — the findings inbox.
 *
 * **The reading order inverted in phase 15, and that is the repositioning.**
 * v1 asked "what am I worth, what should I do, what do I hold, what moved" —
 * a portfolio dashboard with one advice card on it, which is a browser of
 * engine output. An alpha finder answers "what needs me" first and "what am I
 * worth" second, because the value figure is a fact you can look up and a
 * breached stop is a decision that expires.
 *
 * So the order is now: who you are, what ember found, what you're worth, and —
 * in the companion column on desktop — what you hold and what moved. The
 * greeting stays first because it is the one line on the screen that is not
 * asking anything of you.
 *
 * All data arrives through `lib/api/client` (CLAUDE.md §4). This file has no
 * idea whether the prices behind it are generated or live, which is exactly
 * what makes turning on a real feed a config change.
 */

/** How many of each list the dashboard shows before deferring to its own page. */
const TOP_POSITIONS = 4;
const PULSE_ROWS = 5;

export function Dashboard({
  /**
   * Pinned broadcasts, resolved on the server against the dismissal cookie so
   * the banner is in the first paint rather than inserted at hydration. Empty on
   * almost every visit.
   */
  pinned = [],
}: {
  pinned?: Broadcast[];
}) {
  const hydrated = useHydrated();
  const [range, setRange] = useState<Range>("3M");

  const transactions = usePortfolio((s) => s.transactions);
  const isSample = usePortfolio((s) => s.isSample);
  const loadSample = usePortfolio((s) => s.loadSample);
  const clearPortfolio = usePortfolio((s) => s.clear);

  const base = usePreferences((s) => s.baseCurrency);
  const markets = usePreferences((s) => s.markets);

  const instrumentsQuery = useInstruments();
  const quotesQuery = useQuotes();
  const ratesQuery = useRates();

  const instruments = useMemo(
    () => instrumentsQuery.data?.instruments ?? [],
    [instrumentsQuery.data],
  );

  // Held symbols drive the value chart; a stable sorted key stops React Query
  // refetching every render because the array identity changed.
  const heldSymbols = useMemo(() => {
    if (!hydrated) return [];
    return [...new Set(transactions.map((t) => t.symbol))].sort();
  }, [hydrated, transactions]);

  const pulseSymbols = useMemo(
    () => instruments.filter((i) => markets[i.market]).map((i) => i.symbol),
    [instruments, markets],
  );

  const historyQuery = useSeries(heldSymbols, range);
  // One month of closes behind every price in the pulse. Fixed range, so it
  // stays cached while the user switches the portfolio chart above it.
  const pulseSeriesQuery = useSeries(pulseSymbols, "1M");

  /**
   * Conversion falls back to the compiled-in table if `/api/fx` hasn't landed.
   *
   * A missing rate would otherwise value a JPY-quoted instrument at its raw
   * number — a ¥149 position showing as $149 — which is worse than briefly
   * using a stale rate. Only the JPY, CHF and CAD crosses are quoted in
   * anything but dollars, so the fallback is exact for 101 of 110 instruments.
   */
  const rates = ratesQuery.data?.rates ?? USD_PER_UNIT;

  const summary = useMemo(
    () =>
      derivePortfolio({
        transactions: hydrated ? transactions : [],
        quotes: quotesQuery.data?.quotes ?? [],
        instruments,
        rates,
        base,
      }),
    [hydrated, transactions, quotesQuery.data, instruments, rates, base],
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
    });
  }, [historyQuery.data, hydrated, transactions, instruments, rates, base]);

  const pulseRows = useMemo<PulseRow[]>(() => {
    const quotes = quotesQuery.data?.quotes ?? [];
    if (quotes.length === 0) return [];

    const bySymbol = new Map(instruments.map((i) => [i.symbol, i]));
    const candlesBy = new Map(
      (pulseSeriesQuery.data?.series ?? []).map((s) => [s.symbol, s.candles]),
    );

    return quotes
      .filter((q) => {
        const instrument = bySymbol.get(q.symbol);
        return instrument !== undefined && markets[instrument.market];
      })
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
      .slice(0, PULSE_ROWS)
      .map((quote) => ({
        instrument: bySymbol.get(quote.symbol)!,
        quote,
        candles: candlesBy.get(quote.symbol) ?? [],
      }));
  }, [quotesQuery.data, pulseSeriesQuery.data, instruments, markets]);

  const showEmptyBook = hydrated && transactions.length === 0;

  const quotesError = quotesQuery.error;

  /* Hoisted only for legibility — this branch is four deep and reads better
     out of the JSX than inside it. It renders in exactly one place. */
  const value = quotesError ? (
    <ErrorState
      message={
        quotesError instanceof ApiError
          ? quotesError.message
          : "Prices didn't load."
      }
      onRetry={() => quotesQuery.refetch()}
    />
  ) : showEmptyBook ? (
    <EmptyBook onLoadSample={() => loadSample(sampleTransactions())} />
  ) : !hydrated || quotesQuery.isPending || instrumentsQuery.isPending ? (
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
      {isSample && <SampleNotice onClear={clearPortfolio} />}
    </>
  );

  return (
    <>
      <PageHeader
        title="Home"
        brand
        actions={
          <>
            <DataSourceChip />
            <NotificationsButton />
            {/* Desktop already has one pinned to the bottom of the rail. */}
            <ProfileButton size="sm" className="md:hidden" />
          </>
        }
      />

      <PageBody className="pb-12">
        {/* Above the greeting, and capped well short of the 1600px page: a
            banner is a sentence, and a sentence set across a desktop column is
            unreadable however important it is. Renders nothing on almost every
            visit, and when it does render it is already in the server's HTML. */}
        {pinned.length > 0 && (
          <PinnedBanner notices={pinned} className="mb-6 max-w-3xl" />
        )}

        <GreetingLine className="mb-7 md:mb-9" />

        <PageColumns
          aside={
            <div className="space-y-10">
              <Section
                title="Your positions"
                hint={
                  summary.positions.length > TOP_POSITIONS
                    ? `top ${TOP_POSITIONS} of ${summary.positions.length}`
                    : undefined
                }
                href="/portfolio"
              >
                {!hydrated || quotesQuery.isPending ? (
                  <PositionsListSkeleton rows={TOP_POSITIONS} />
                ) : summary.positions.length === 0 ? (
                  <p className="text-caption text-stone">
                    Nothing held yet. Log a trade and it appears here with its
                    cost basis and P&amp;L.
                  </p>
                ) : (
                  <>
                    <AllocationBar positions={summary.positions} className="mb-5" />
                    <PositionsList
                      positions={summary.positions.slice(0, TOP_POSITIONS)}
                      base={base}
                    />
                  </>
                )}
              </Section>

              <Section title="Biggest moves today">
                {quotesQuery.isPending ? (
                  <MarketPulseSkeleton rows={PULSE_ROWS} />
                ) : pulseRows.length === 0 ? (
                  <p className="text-caption text-stone">
                    No markets switched on. Turn one back on in settings.
                  </p>
                ) : (
                  <MarketPulse rows={pulseRows} />
                )}
              </Section>
            </div>
          }
        >
          <div className="space-y-10">
            {/* Value first, under the greeting.

                The findings inbox led for one iteration and it was the wrong
                call: a home screen needs a focal point, and on a finance app
                that is the balance — it is what the user opened the app to
                see, it anchors every figure below it, and a screen that opens
                on a queue of warnings is a to-do list rather than a place you
                are glad to arrive at. Findings follow immediately, which is
                still a reordering of v1: they used to sit under the chart,
                the positions and the movers, behind a "Next window" heading
                that showed exactly one call.

                It also stays in the main column at every width. Putting it in
                the companion on desktop and here on mobile would mean
                rendering it twice and hiding one — two ValueCharts, two sets
                of geometry, one wasted. And it wants the width: the chart is
                the one thing on this page that genuinely improves with a
                wider column. */}
            {value}

            {/* Then what needs you. The inbox owns its own query, its own
                handled state and its own execute flow — this screen composes
                it rather than orchestrating it, because the same list is what
                a notification deep-links into. */}
            <FindingsInbox />

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
          </div>
        </PageColumns>
      </PageBody>
    </>
  );
}

/**
 * No transactions yet.
 *
 * Offers the sample book rather than seeding it silently. A finance app that
 * invents holdings the user never entered is unforgivable; one that offers to
 * show you around before you type anything is just good onboarding — and the
 * sample stays labelled everywhere it appears, with one tap to clear.
 */
function EmptyBook({ onLoadSample }: { onLoadSample: () => void }) {
  return (
    <div className="flex flex-col items-start py-2">
      <div className="mb-4 grid size-11 place-items-center rounded-2xl bg-surface-2 text-stone">
        <Wallet className="size-5" />
      </div>
      <h2 className="text-heading font-semibold text-ink">Nothing tracked yet</h2>
      <p className="mt-1.5 max-w-sm text-body text-stone">
        Log what you own and ember values it live, works out your cost basis and P&amp;L,
        and tells you when to act on it.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button size="lg" asChild>
          <Link href="/portfolio">Add your first holding</Link>
        </Button>
        <Button size="lg" variant="outline" onClick={onLoadSample}>
          <Sparkles />
          Explore with sample data
        </Button>
      </div>
    </div>
  );
}

function SampleNotice({ onClear }: { onClear: () => void }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3.5">
      <p className="text-micro text-stone">
        This is the sample book — none of these are your holdings.
      </p>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClear}
        className="h-6 px-2 text-micro"
      >
        Clear it
      </Button>
    </div>
  );
}
