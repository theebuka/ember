"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Compass } from "@/components/common/icon";
import { SignalCard, SignalCardSkeleton, type SuggestedTrade } from "@/components/signals/signal-card";
import { ErrorState } from "@/components/common/error-state";
import { SponsorRow } from "@/components/plan/sponsor-row";
import { PageBody } from "@/components/common/page-body";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { SectionHeader } from "@/components/common/section-header";
import { Segmented } from "@/components/common/segmented";
import { DataSourceChip } from "@/components/market/data-source-chip";
import { NotificationsButton } from "@/components/notifications/notifications-button";
import { TransactionForm } from "@/components/portfolio/transaction-form";
import { PageHeader } from "@/components/shell/page-header";
import { useHydrated } from "@/hooks/use-hydrated";
import { useNow } from "@/hooks/use-now";
import { useAdvice, useInstruments, useQuotes, useRates } from "@/hooks/use-market-data";
import { ApiError, type Assessment } from "@/lib/api/client";
import type { Instrument, Transaction } from "@/lib/api/types";
import { ACTION_LABELS, RISK_PROFILES } from "@/lib/api/types";
import { formatQuantity, quantityPrecision } from "@/lib/market/format";
import { USD_PER_UNIT } from "@/lib/market/universe";
import { convert, derivePortfolio } from "@/lib/portfolio/derive";
import { todayForInput } from "@/lib/portfolio/transaction-schema";
import { undoableToast } from "@/lib/toast";
import { findingId, handlingFor, useAdviceActions } from "@/store/use-advice-actions";
import { usePortfolio } from "@/store/use-portfolio";
import { usePreferences } from "@/store/use-preferences";

/**
 * The feed.
 *
 * **Restraint is the design.** On the current universe two or three of
 * universe clears the bar on a given day, and a screen that
 * regularly says "nothing today" is the honest shape of a product whose
 * differentiator is knowing when *not* to act. The empty state has to read as
 * a considered answer rather than as a page that failed to load — so it says
 * how many instruments were assessed and offers the full set of reads.
 *
 * That second view matters: every assessment is available, holds included,
 * because "we looked and there's nothing here" is only credible if the user
 * can go and see the looking.
 */

type View = "open" | "all";

/** Long-only in v1, so a sell only makes sense against something held. */
const REDUCING = new Set(["sell", "reduce"]);

/**
 * One column, then two past `xl`.
 *
 * Named once because three lists use it — the skeleton, the feed and the
 * handled calls — and a feed whose placeholder lays out differently from the
 * thing it stands in for is a layout shift with extra steps (ADR 0019).
 */
const FEED_GRID = "grid items-start gap-x-12 xl:grid-cols-2 *:border-t *:border-line";

interface FeedItem {
  assessment: Assessment;
  instrument: Instrument;
  heldWeight: number | null;
  heldQuantity: number;
  suggested: SuggestedTrade | null;
}

export function SignalsScreen() {
  const hydrated = useHydrated();
  const now = useNow(60_000);
  const [view, setView] = useState<View>("open");
  const [executing, setExecuting] = useState<FeedItem | null>(null);

  const riskProfile = usePreferences((s) => s.riskProfile);
  const base = usePreferences((s) => s.baseCurrency);
  const transactions = usePortfolio((s) => s.transactions);
  const addTransaction = usePortfolio((s) => s.add);
  const removeTransaction = usePortfolio((s) => s.remove);

  const handled = useAdviceActions((s) => s.handled);
  const markHandled = useAdviceActions((s) => s.markHandled);
  const clearHandled = useAdviceActions((s) => s.clear);

  const instrumentsQuery = useInstruments();
  const quotesQuery = useQuotes();
  const ratesQuery = useRates();
  const adviceQuery = useAdvice(riskProfile);

  const instruments = useMemo(
    () => instrumentsQuery.data?.instruments ?? [],
    [instrumentsQuery.data],
  );
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

  const items = useMemo<FeedItem[]>(() => {
    const bySymbol = new Map(instruments.map((i) => [i.symbol, i]));
    const positions = new Map(summary.positions.map((p) => [p.symbol, p]));

    return (adviceQuery.data?.assessments ?? [])
      .map((assessment) => {
        const instrument = bySymbol.get(assessment.symbol);
        if (!instrument) return null;

        const position = positions.get(assessment.symbol) ?? null;

        /**
         * The recommended weight, turned into units the user can actually
         * enter. A percentage of a book is a suggestion; a quantity is a
         * trade, and making the user do that arithmetic is where good advice
         * quietly stops being acted on.
         */
        let suggested: SuggestedTrade | null = null;
        if (assessment.sizing && summary.totalValue > 0) {
          const valueBase = assessment.sizing.weight * summary.totalValue;
          const valueQuote = convert(valueBase, base, instrument.currency, rates);
          const quantity = valueQuote / assessment.price;

          // A reduction can't exceed the holding — v1 is long-only, and the
          // ledger's own guard would reject the trade this card pre-filled.
          const capped = REDUCING.has(assessment.action)
            ? Math.min(quantity, position?.quantity ?? 0)
            : quantity;

          if (capped > 0) {
            suggested = {
              quantity: capped,
              value: (capped / quantity) * valueBase,
            };
          }
        }

        return {
          assessment,
          instrument,
          heldWeight: position?.weight ?? null,
          heldQuantity: position?.quantity ?? 0,
          suggested,
        };
      })
      .filter((item): item is FeedItem => item !== null);
  }, [adviceQuery.data, instruments, summary, base, rates]);

  const actionable = useMemo(
    () => new Set(adviceQuery.data?.actionable ?? []),
    [adviceQuery.data],
  );

  /**
   * The feed deals only in opportunities.
   *
   * Risks live in the Home inbox and are keyed `risk:SYMBOL`, so dismissing a
   * Buy here can never silently dismiss a stop breach on the same instrument.
   * That was possible until phase 15, when both stores keyed on the bare
   * symbol.
   */
  const idOf = (item: FeedItem) => findingId("opportunity", item.assessment.symbol);

  const handlingOf = (item: FeedItem) =>
    now === null ? null : handlingFor(handled, idOf(item), item.assessment.action, now);

  /**
   * Why this call can't be turned into a trade, when it can't.
   *
   * Long-only in v1, so a `Sell` on something the user doesn't hold has no
   * corresponding transaction. Saying so on the card beats letting them press
   * Execute and meet the ledger's oversell error.
   */
  const blockedReasonFor = (item: FeedItem): string | null => {
    if (!REDUCING.has(item.assessment.action)) return null;
    if (item.heldQuantity > 0) return null;
    return `You don't hold ${item.assessment.symbol}, so there's nothing to ${
      item.assessment.action === "sell" ? "sell" : "reduce"
    }. Worth knowing before you buy it.`;
  };

  const open = items.filter(
    (i) => actionable.has(i.assessment.symbol) && handlingOf(i) === null,
  );
  const done = items.filter(
    (i) => actionable.has(i.assessment.symbol) && handlingOf(i) !== null,
  );

  /* ── Actions ─────────────────────────────────────────────────────────── */

  const handleDismiss = (item: FeedItem) => {
    const { symbol, action, window: execution } = item.assessment;
    markHandled(idOf(item), {
      kind: "dismissed",
      signature: action,
      until: execution.to,
    });
    undoableToast(`Dismissed ${ACTION_LABELS[action]} ${symbol}`, {
      description: "It'll come back if ember's read changes.",
      onUndo: () => clearHandled(idOf(item)),
    });
  };

  const handleExecuted = (item: FeedItem, values: Omit<Transaction, "id">) => {
    const { symbol, action, window: execution } = item.assessment;
    const id = addTransaction(values);
    markHandled(idOf(item), {
      kind: "executed",
      signature: action,
      until: execution.to,
    });
    setExecuting(null);

    undoableToast("Executed", {
      description: `${values.side === "buy" ? "Bought" : "Sold"} ${formatQuantity(values.quantity, item.instrument.market)} ${symbol}`,
      onUndo: () => {
        removeTransaction(id);
        clearHandled(idOf(item));
      },
    });
  };

  /* ── Render ──────────────────────────────────────────────────────────── */

  const loading = adviceQuery.isPending || instrumentsQuery.isPending || !hydrated;
  const error = adviceQuery.error ?? instrumentsQuery.error;
  const assessed = adviceQuery.data?.assessments.length ?? 0;
  /**
   * Instruments the server had not finished loading when it answered.
   *
   * A cold free tier takes over a minute to fetch every history, so the server
   * ranks what arrived and reports the rest rather than making the reader wait
   * (`LOAD_DEADLINE_MS`). Saying so is not optional: "12 of 86 clear your bar"
   * is a different claim from "12 of 110", and the query is already polling
   * until the number reaches zero.
   */
  const pending = adviceQuery.data?.pending ?? 0;

  const shown = view === "open" ? open : items;

  return (
    <>
      <PageHeader
        title="Signals"
        actions={
          <>
            <DataSourceChip />
            <NotificationsButton />
          </>
        }
      />

      {/* Full width, like Home and Portfolio. A signal card is a dense
          object — the window band, the strategy breakdown, the size and the
          stop — so past `xl` the feed pairs them rather than running one
          760px card down the middle of a 1600px page. `items-start` because
          two cards in a row are rarely the same height and stretching the
          shorter one to match would invent whitespace inside it. */}
      <PageBody className="space-y-6 pb-12">
        {error ? (
          <ErrorState
            message={
              error instanceof ApiError ? error.message : "Advice didn't load."
            }
            onRetry={() => adviceQuery.refetch()}
          />
        ) : (
          <>
            {/* Stacked on a phone in both states: "Assessing the universe…"
                fit beside the toggle and the count did not, so the toggle
                dropped a row the moment the calls landed. */}
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-caption text-stone">
                {loading
                  ? "Assessing the universe…"
                  : `${open.length} of ${assessed} match your ${RISK_PROFILES[riskProfile].label.toLowerCase()} risk profile.`}
                {!loading && pending > 0 && (
                  <span className="text-faint"> · </span>
                )}
                {!loading && pending > 0 && (
                  <span>still loading {pending}</span>
                )}
              </p>
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { value: "open", label: "Calls" },
                  { value: "all", label: "All reads" },
                ]}
                size="sm"
                aria-label="Which recommendations to show"
              />
            </div>

            {loading ? (
              <div className={FEED_GRID}>
                <SignalCardSkeleton />
                <SignalCardSkeleton />
              </div>
            ) : shown.length === 0 ? (
              <NothingToday assessed={assessed} onSeeAll={() => setView("all")} />
            ) : (
              <div className={FEED_GRID}>
                {shown.map((item) => (
                  <SignalCard
                    key={item.assessment.symbol}
                    assessment={item.assessment}
                    instrument={item.instrument}
                    base={base}
                    actionable={actionable.has(item.assessment.symbol)}
                    heldWeight={item.heldWeight}
                    suggested={item.suggested}
                    handled={handlingOf(item)}
                    blockedReason={blockedReasonFor(item)}
                    onExecute={() => setExecuting(item)}
                    onDismiss={() => handleDismiss(item)}
                    onUndo={() => clearHandled(idOf(item))}
                  />
                ))}
              </div>
            )}

            {view === "open" && done.length > 0 && (
              <section>
                <SectionHeader
                  title="Handled"
                  hint="until these windows close"
                />
                <div className={FEED_GRID}>
                  {done.map((item) => (
                    <SignalCard
                      key={item.assessment.symbol}
                      assessment={item.assessment}
                      instrument={item.instrument}
                      base={base}
                      actionable={actionable.has(item.assessment.symbol)}
                      heldWeight={item.heldWeight}
                      suggested={item.suggested}
                      handled={handlingOf(item)}
                      blockedReason={blockedReasonFor(item)}
                      onExecute={() => setExecuting(item)}
                      onDismiss={() => handleDismiss(item)}
                      onUndo={() => clearHandled(idOf(item))}
                    />
                  ))}
                </div>
              </section>
            )}

            <p className="max-w-3xl text-micro text-stone">
              ember gives information, not financial advice. Every rule above is
              published and cited, the track record is computed rather than authored,
              and none of it accounts for your circumstances.{" "}
              <Link
                href="/signals/methodology"
                className="underline underline-offset-2 hover:text-stone"
              >
                How the signals are built
              </Link>
              {" · "}
              <Link
                href="/signals/track-record"
                className="underline underline-offset-2 hover:text-stone"
              >
                How they&apos;ve done
              </Link>
            </p>

            <SponsorRow slot="signals" className="mt-6" />
          </>
        )}
      </PageBody>

      <ResponsiveModal
        open={executing !== null}
        onOpenChange={(next) => !next && setExecuting(null)}
        title="Log this trade"
        description="Pre-filled from ember's sizing. Change anything that doesn't match your fill."
      >
        {executing && (
          <TransactionForm
            key={executing.assessment.symbol}
            instruments={instruments}
            quotes={quotesQuery.data?.quotes ?? []}
            existing={transactions}
            defaults={{
              symbol: executing.assessment.symbol,
              side: REDUCING.has(executing.assessment.action) ? "sell" : "buy",
              quantity:
                executing.suggested === null
                  ? ""
                  : String(
                      Number(
                        executing.suggested.quantity.toFixed(
                          quantityPrecision(executing.instrument.market),
                        ),
                      ),
                    ),
              price: String(executing.assessment.price),
              date: todayForInput(),
              // Stamps the ledger with where the trade came from, so the track
              // record can later tell followed calls from the user's own ideas.
              note: `ember ${ACTION_LABELS[executing.assessment.action]} · ${executing.assessment.confidenceLabel} ${executing.assessment.confidence}`,
            }}
            onSubmit={(values) => handleExecuted(executing, values)}
            onCancel={() => setExecuting(null)}
          />
        )}
      </ResponsiveModal>
    </>
  );
}

/**
 * The empty state, which on most days is the state.
 *
 * It has to carry its own credibility: naming how many instruments were looked
 * at is the difference between "the model considered everything and declined"
 * and "this page is broken".
 */
function NothingToday({
  assessed,
  onSeeAll,
}: {
  assessed: number;
  onSeeAll: () => void;
}) {
  return (
    <div className="flex flex-col items-start py-2">
      <div className="mb-4 grid size-11 place-items-center rounded-xl bg-surface-2 text-stone">
        <Compass className="size-5" />
      </div>
      <h2 className="text-heading font-semibold text-ink">Nothing to act on today</h2>
      <p className="mt-1.5 max-w-md text-body text-stone">
        {assessed > 0
          ? `All ${assessed} instruments were assessed. None reached the conviction and confidence your risk profile asks for, so ember isn't recommending a trade — that's the answer, not an absence of one.`
          : "No instruments could be assessed this cycle."}
      </p>
      <button
        type="button"
        onClick={onSeeAll}
        className="mt-5 rounded-sm text-caption font-medium text-brand-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        See every read, holds included
      </button>
    </div>
  );
}
