"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "@/components/common/icon";
import { ActionBadge } from "@/components/signals/action-badge";
import { EquityCurve, ReturnDistribution } from "@/components/signals/equity-curve";
import { ErrorState } from "@/components/common/error-state";
import { PageBody } from "@/components/common/page-body";
import { SectionHeader } from "@/components/common/section-header";
import { Segmented } from "@/components/common/segmented";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useStrategies, useTrackRecord } from "@/hooks/use-market-data";
import { ApiError, type BacktestTrade } from "@/lib/api/client";
import { RISK_PROFILES } from "@/lib/api/types";
import { formatPercent, formatRatio, formatShortDate } from "@/lib/market/format";
import { usePreferences } from "@/store/use-preferences";
import { cn } from "@/lib/utils";

/**
 * How the calls actually did.
 *
 * **This page is the product's credibility, and it is computed rather than
 * authored.** It is walk-forward output from the same `assess()` the feed
 * calls — no lookahead, no overlapping positions, no post-hoc parameter
 * choices. If the engine is bad at something, this page says so.
 *
 * Two consequences that shape the layout:
 *
 *   **The caveats go first.** Every app in this category buries them, and the
 *   single most important fact here is that the prices are generated — a
 *   random walk has no structure to find, so results near chance are the
 *   *expected* outcome and say nothing about real markets. Putting that under
 *   a fold, after a headline number, would be a lie of arrangement.
 *
 *   **Every call is listed, losers included.** A track record you can only see
 *   in aggregate is a marketing claim. The table below is the raw output.
 */

type Filter = "all" | "wins" | "losses";

export function TrackRecordScreen() {
  const riskProfile = usePreferences((s) => s.riskProfile);
  const [filter, setFilter] = useState<Filter>("all");
  // How many calls are drawn. All 2,000-odd were, in two tables (one per
  // width), which made this the heaviest page in the app to render.
  const [shown, setShown] = useState(TRADES_PAGE);

  const query = useTrackRecord(riskProfile);
  const strategiesQuery = useStrategies(riskProfile);

  const result = query.data;

  const strategyNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of strategiesQuery.data?.strategies ?? []) map.set(s.id, s.name);
    return map;
  }, [strategiesQuery.data]);

  const trades = useMemo(() => {
    const all = result?.trades ?? [];
    const filtered =
      filter === "wins"
        ? all.filter((t) => t.return > 0)
        : filter === "losses"
          ? all.filter((t) => t.return <= 0)
          : all;
    return [...filtered].sort((a, b) => b.entryAt - a.entryAt);
  }, [result, filter]);

  return (
    <>
      <PageHeader narrow title="Track record" back="/signals" />

      <PageBody narrow className="space-y-9 pb-12">
        {query.error ? (
          <ErrorState
            message={
              query.error instanceof ApiError
                ? query.error.message
                : "The track record didn't load."
            }
            onRetry={() => query.refetch()}
          />
        ) : query.isPending || !result ? (
          <TrackRecordSkeleton />
        ) : (
          <>
            {/* ── Read this first ──────────────────────────────────────── */}
            <div className="flex items-start gap-2.5">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-brand"
              />
              <div>
                <h2 className="text-heading font-semibold text-ink">
                  Read this before the numbers
                </h2>
                <p className="mt-1.5 text-body text-graphite">
                  {result.caveats[0]}
                </p>
              </div>
            </div>

            <ul className="mt-4 space-y-1.5 border-t border-line pt-3.5">
              {result.caveats.slice(1).map((caveat) => (
                <li key={caveat} className="flex gap-2 text-caption text-stone">
                  <span aria-hidden className="text-stone">
                    ·
                  </span>
                  <span>{caveat}</span>
                </li>
              ))}
            </ul>

            {/* ── The headline ─────────────────────────────────────────── */}
            <section>
              <SectionHeader
                title="Every call the engine made"
                hint={`${RISK_PROFILES[riskProfile].label.toLowerCase()} profile`}
              />
              <dl className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
                <Stat label="Calls" value={String(result.calls)} />
                <Stat
                  label="Hit rate"
                  value={formatPercent(result.hitRate, { decimals: 1 })}
                  tone={result.hitRate - 0.5}
                />
                <Stat
                  label="Average return"
                  value={formatPercent(result.averageReturn, {
                    signed: true,
                    decimals: 2,
                  })}
                  tone={result.averageReturn}
                />
                <Stat
                  label="Max drawdown"
                  value={formatPercent(result.maxDrawdown, { decimals: 1 })}
                  hint="at suggested sizes"
                />
                <Stat
                  label="Median return"
                  value={formatPercent(result.medianReturn, {
                    signed: true,
                    decimals: 2,
                  })}
                  tone={result.medianReturn}
                />
                <Stat
                  label="Return per unit risk"
                  value={formatRatio(result.returnPerUnitRisk)}
                  tone={result.returnPerUnitRisk}
                />
                <Stat
                  label="Stopped out"
                  value={formatPercent(result.stoppedOutRate, { decimals: 1 })}
                  hint="hit the stop"
                />
                <Stat
                  label="Average hold"
                  value={`${Math.round(result.averageHoldBars)} bars`}
                />
              </dl>

              {/* ── The gap between the call and the fill ────────────────────
                  Its own block rather than a ninth tile in the grid above, and
                  not only because nine breaks a four-column rhythm. Every stat
                  up there answers "how did the calls do"; this answers a
                  different question — how much of that was reachable — and
                  reading it as a peer of "hit rate" would flatten the
                  distinction. */}
              <div className="mt-5 border-t border-line pt-4">
                <h3 className="eyebrow mb-2">What the delay cost</h3>
                <p
                  className={cn(
                    "num text-title font-semibold tracking-tight",
                    result.averageActionGap === 0
                      ? "text-ink"
                      : result.averageActionGap > 0
                        ? "text-up"
                        : "text-down",
                  )}
                >
                  {formatPercent(result.averageActionGap, {
                    signed: true,
                    decimals: 2,
                  })}
                </p>
                <p className="mt-1 text-caption text-stone">
                  Average per call, filled{" "}
                  {result.averageEntryLagBars.toFixed(1)} bars after it was made. Returns are measured from the first price you could actually trade, not the price on the card.
                </p>
              </div>

              <div className="mt-5 border-t border-line pt-4">
                <h3 className="eyebrow mb-2">Simulated book</h3>
                <EquityCurve points={result.equityCurve} />
              </div>

              <div className="mt-5 border-t border-line pt-4">
                <h3 className="eyebrow mb-2">Where the calls landed</h3>
                <ReturnDistribution returns={result.returns} />
              </div>
            </section>

            {/* ── Per strategy ─────────────────────────────────────────── */}
            {result.byStrategy.length > 0 && (
              <section>
                <SectionHeader
                  title="By strategy"
                  
                />
                <ul className="divide-y divide-line">
                  {[...result.byStrategy]
                    .sort((a, b) => b.calls - a.calls)
                    .map((record) => (
                      <li
                        key={record.strategyId}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-caption text-ink">
                            {strategyNames.get(record.strategyId) ??
                              record.strategyId}
                          </p>
                          <p className="num text-micro text-stone">
                            {record.calls} {record.calls === 1 ? "call" : "calls"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-baseline gap-4 text-right">
                          <span className="num text-caption text-graphite">
                            {formatPercent(record.hitRate, { decimals: 0 })} hit
                          </span>
                          <span
                            className={cn(
                              "num w-16 text-caption font-medium",
                              record.averageReturn > 0
                                ? "text-up"
                                : record.averageReturn < 0
                                  ? "text-down"
                                  : "text-stone",
                            )}
                          >
                            {formatPercent(record.averageReturn, {
                              signed: true,
                              decimals: 2,
                            })}
                          </span>
                        </div>
                      </li>
                    ))}
                </ul>
                <p className="mt-3 border-t border-line pt-3 text-micro text-stone">
                  A call counts for every rule behind it, so these add up to more than the total.
                </p>
              </section>
            )}

            {/* ── Every call ───────────────────────────────────────────── */}
            <section>
              <SectionHeader
                title="The calls themselves"
                hint={`${Math.min(shown, trades.length)} of ${trades.length}, newest first`}
                action={
                  <Segmented
                    value={filter}
                    onChange={(next) => {
                      setFilter(next);
                      setShown(TRADES_PAGE);
                    }}
                    options={[
                      { value: "all", label: "All" },
                      { value: "wins", label: "Wins" },
                      { value: "losses", label: "Losses" },
                    ]}
                    size="sm"
                    aria-label="Filter calls"
                  />
                }
              />
              {/* The newest calls are listed on Pro only; the server leaves
                  them out of the list and every figure above still counts
                  them. Said here, where the list visibly stops short. */}
              {result && result.withheld > 0 && result.hiddenDays !== null && (
                <p className="mb-3 text-caption text-stone">
                  {result.withheld} calls from the last {result.hiddenDays / 7} weeks are
                  part of Pro. Every figure above counts them.{" "}
                  <Link
                    href="/settings?tab=plan"
                    className="text-brand-text underline underline-offset-2"
                  >
                    See plans
                  </Link>
                </p>
              )}
              {trades.length === 0 ? (
                <p className="py-2 text-caption text-stone">
                  No calls in this slice.
                </p>
              ) : (
                <>
                  <TradesTable trades={trades.slice(0, shown)} />
                  {trades.length > shown && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => setShown((n) => n + TRADES_PAGE * 2)}
                    >
                      Show {Math.min(TRADES_PAGE * 2, trades.length - shown)} more
                    </Button>
                  )}
                </>
              )}
            </section>

            <p className="text-micro text-stone">
              Updated daily.{" "}
              <Link
                href="/signals/methodology"
                className="underline underline-offset-2 hover:text-stone"
              >
                How the signals are built
              </Link>
              .
            </p>
          </>
        )}
      </PageBody>
    </>
  );
}

const TRADES_PAGE = 50;

function TradesTable({ trades }: { trades: readonly BacktestTrade[] }) {
  return (
    <>
      {/* Mobile */}
      <ul className="divide-y divide-line md:hidden">
        {trades.map((trade) => (
          <li key={`${trade.symbol}-${trade.entryAt}`} className="py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <ActionBadge action={trade.action} size="sm" />
                <span className="mono-label text-caption text-ink">
                  {trade.symbol}
                </span>
              </div>
              <span className={cn("num text-caption font-medium", tone(trade.return))}>
                {formatPercent(trade.return, { signed: true })}
              </span>
            </div>
            <p className="num mt-0.5 text-micro text-stone">
              {formatShortDate(trade.entryAt)} → {formatShortDate(trade.exitAt)} ·{" "}
              {trade.holdBars} bars · {formatPercent(trade.weight, { decimals: 1 })}{" "}
              size
              {trade.stopped && " · stopped out"}
            </p>
          </li>
        ))}
      </ul>

      {/* Desktop */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-micro text-stone">Call</TableHead>
              <TableHead className="text-micro text-stone">Entered</TableHead>
              <TableHead className="text-micro text-stone">Exited</TableHead>
              <TableHead className="text-right text-micro text-stone">Size</TableHead>
              <TableHead className="text-right text-micro text-stone">Held</TableHead>
              <TableHead className="text-right text-micro text-stone">Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trades.map((trade) => (
              <TableRow key={`${trade.symbol}-${trade.entryAt}`}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <ActionBadge action={trade.action} size="sm" />
                    <span className="mono-label text-caption text-ink">
                      {trade.symbol}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="num text-caption text-graphite">
                  {formatShortDate(trade.entryAt)}
                </TableCell>
                <TableCell className="num text-caption text-graphite">
                  {formatShortDate(trade.exitAt)}
                  {trade.stopped && (
                    <span className="ml-1.5 text-micro text-stone">stopped</span>
                  )}
                </TableCell>
                <TableCell className="num text-right text-caption text-graphite">
                  {formatPercent(trade.weight, { decimals: 1 })}
                </TableCell>
                <TableCell className="num text-right text-caption text-graphite">
                  {trade.holdBars}
                </TableCell>
                <TableCell
                  className={cn(
                    "num text-right text-caption font-medium",
                    tone(trade.return),
                  )}
                >
                  {formatPercent(trade.return, { signed: true })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function tone(value: number): string {
  return value > 0 ? "text-up" : value < 0 ? "text-down" : "text-stone";
}

function Stat({
  label,
  value,
  hint,
  tone: signal,
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
          "num truncate text-heading font-medium",
          signal === undefined || signal === 0
            ? "text-ink"
            : signal > 0
              ? "text-up"
              : "text-down",
        )}
      >
        {value}
      </dd>
      {/* The hint lives inside the <dd>, not beside it. A <div> child of a
          <dl> may only contain <dt> and <dd> — a stray <p> there is invalid
          markup and axe flags the whole list as unparseable. */}
      {hint && <dd className="text-micro text-stone">{hint}</dd>}
    </div>
  );
}

function TrackRecordSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      <Skeleton className="h-5 w-56" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
      {/* The delay block. Sized by type metrics like everything else (ADR 0019) —
          a transparent glyph in the real class cannot drift from the real one,
          where a guessed `h-*` silently does. */}
      <div className="mt-5 space-y-1">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="w-24">
          <span className="block text-title font-semibold text-transparent">0</span>
        </Skeleton>
        <Skeleton className="w-full">
          <span className="block text-caption text-transparent">line</span>
        </Skeleton>
        <Skeleton className="w-full">
          <span className="block text-caption text-transparent">line</span>
        </Skeleton>
        <Skeleton className="w-3/4">
          <span className="block text-caption text-transparent">line</span>
        </Skeleton>
      </div>
      <Skeleton className="mt-5 h-40 w-full rounded-lg" />
    </div>
  );
}
