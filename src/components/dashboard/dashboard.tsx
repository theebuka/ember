"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles, Wallet } from "@/components/common/icon";
import { ErrorState } from "@/components/common/error-state";
import { PAGE_COLUMNS, PageBody, PageColumns } from "@/components/common/page-body";
import { Section } from "@/components/common/section";
import { GreetingLine } from "@/components/dashboard/greeting-line";
import { PinnedBanner } from "@/components/dashboard/pinned-banner";
import { FindingsInbox } from "@/components/findings/findings-inbox";
import { ChangeChip } from "@/components/market/change-chip";
import { DataSourceChip } from "@/components/market/data-source-chip";
import { NotificationsButton } from "@/components/notifications/notifications-button";
import { MarketPulse, MarketPulseSkeleton, type PulseRow } from "@/components/market/market-pulse";
import {
  AllocationBar,
  PositionsList,
  PositionsListSkeleton,
} from "@/components/portfolio/positions-list";
import { PageHeader } from "@/components/shell/page-header";
import { ProfileButton } from "@/components/shell/profile-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useHydrated } from "@/hooks/use-hydrated";
import { useInstruments, useQuotes, useRates, useSeries } from "@/hooks/use-market-data";
import { ApiError } from "@/lib/api/client";
import type { Broadcast } from "@/lib/notifications/inbox";
import { formatMoney, formatPercent, splitMoney } from "@/lib/market/format";
import { USD_PER_UNIT } from "@/lib/market/universe";
import { derivePortfolio, type PortfolioSummary } from "@/lib/portfolio/derive";
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
 * So the order is: who you are, what you're worth in one line, what ember
 * found, and — in the companion column on desktop — what you hold and what
 * moved. The greeting stays first because it is the one line on the screen
 * that is not asking anything of you.
 *
 * **The hero and the chart live on Portfolio only** (decision 267, superseding
 * 082). Home opened on the same 64px balance, three stats and chart as
 * Portfolio, which pushed "What ember found" ~900px down on desktop and ~1,100px
 * on a phone — the product's point below the fold on the screen meant to show
 * it, and two tabs that opened on the same picture. The balance stays as the
 * focal figure at display size, with the day's change, and links through.
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

  const pulseSymbols = useMemo(
    () => instruments.filter((i) => markets[i.market]).map((i) => i.symbol),
    [instruments, markets],
  );

  // One month of closes behind every price in the pulse.
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
    <BalanceSkeleton />
  ) : (
    <div>
      <Balance summary={summary} />
      {isSample && <SampleNotice onClear={clearPortfolio} />}
    </div>
  );

  const actions = (
    <>
      <DataSourceChip />
      <NotificationsButton />
    </>
  );

  return (
    <>
      {/* A phone keeps the sticky bar: the lockup, the bell and the profile
          control have nowhere else to go. On desktop the rail carries the
          brand and the title is never drawn on Home, so the bar was an empty
          80px band holding two controls — they sit on the greeting's line. */}
      <PageHeader
        title="Home"
        brand
        className="md:hidden"
        actions={
          <>
            {actions}
            <ProfileButton size="sm" />
          </>
        }
      />
      <h1 className="sr-only max-md:hidden">Home</h1>

      <PageBody className="pb-12 md:pt-7">
        {/* Above the greeting, and only as wide as the main column: a banner
            is a sentence, and its edge should be the findings' edge rather
            than a cap of its own. Renders nothing on almost every visit, and
            when it does render it is already in the server's HTML. */}
        {pinned.length > 0 && (
          <div className={PAGE_COLUMNS}>
            <PinnedBanner notices={pinned} className="mb-6" />
          </div>
        )}

        <div className="mb-7 flex items-start justify-between gap-6 md:mb-9">
          <GreetingLine className="min-w-0" />
          <div className="hidden shrink-0 items-center gap-2 md:flex">{actions}</div>
        </div>

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
            {/* The balance, in one block: still the focal figure, no longer a
                second Portfolio screen. */}
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
 * The balance and the day's change, linking through to Portfolio.
 *
 * Display size rather than the hero's figure size: it is the first number on
 * the screen, but the screen is about the findings under it.
 */
function Balance({ summary }: { summary: PortfolioSummary }) {
  const { sign, symbol, whole, fraction } = splitMoney(summary.totalValue, summary.base);

  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="eyebrow">Portfolio value</h2>
        <p className="figure mt-1 flex items-baseline text-display text-ink max-[374px]:text-title">
          <span>
            {sign}
            {symbol}
            {whole}
          </span>
          {fraction && (
            <span className="text-heading text-stone max-[374px]:text-body">.{fraction}</span>
          )}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <ChangeChip value={summary.dayChange}>
            {formatMoney(summary.dayChange, summary.base, { signed: true })}
          </ChangeChip>
          {summary.dayChangePct !== null && (
            <span className="num text-caption text-stone">
              {formatPercent(summary.dayChangePct, { signed: true })} today
            </span>
          )}
        </div>
      </div>
      <Button variant="ghost" size="sm" asChild className="shrink-0 text-stone">
        <Link href="/portfolio">
          Portfolio
          <ArrowRight />
        </Link>
      </Button>
    </div>
  );
}

/** The same boxes as `Balance`, by type class rather than by guessed height (ADR 0019). */
function BalanceSkeleton() {
  return (
    <div aria-hidden>
      <h2 className="eyebrow">Portfolio value</h2>
      <div className="figure mt-1 flex items-center text-display max-[374px]:text-title">
        <Skeleton className="flex w-[7ch] items-center rounded-lg">
          <span className="text-transparent">0</span>
        </Skeleton>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <Skeleton className="h-6 w-24 rounded-md" />
        <Skeleton className="h-4 w-20" />
      </div>
    </div>
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
  // The balance's own three boxes — eyebrow, one display-height line, one row
  // of controls — so the block it replaces after hydration is the same height
  // and the findings under it don't move. The full-size version pushed them
  // down 130px on a first visit, which is every Lighthouse run.
  return (
    <div>
      <h2 className="eyebrow">Portfolio value</h2>
      <div className="figure mt-1 flex items-center text-display max-[374px]:text-title">
        <span className="flex items-center gap-2 font-sans text-body font-normal tracking-normal text-stone">
          <Wallet className="size-4 shrink-0" />
          Nothing tracked yet.
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <Button size="sm" asChild>
          <Link href="/portfolio">Add your first holding</Link>
        </Button>
        <Button size="sm" variant="outline" onClick={onLoadSample}>
          <Sparkles />
          Explore with sample data
        </Button>
      </div>
    </div>
  );
}

function SampleNotice({ onClear }: { onClear: () => void }) {
  return (
    // One sentence with the action inside it: as a separate button it wrapped
    // to a line of its own on a phone, orphaned under the text it belonged to.
    <p className="mt-4 border-t border-line pt-3.5 text-micro text-stone">
      This is the sample book — none of these are your holdings.{" "}
      <button type="button" onClick={onClear} className="tap-target font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        Clear it
      </button>
    </p>
  );
}
