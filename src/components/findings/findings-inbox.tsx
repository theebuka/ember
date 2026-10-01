"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Compass } from "@/components/common/icon";
import { ErrorState } from "@/components/common/error-state";
import { Section } from "@/components/common/section";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { FindingRow, FindingRowSkeleton } from "@/components/findings/finding-row";
import { PlanCard } from "@/components/plan/upsell";
import { TransactionForm } from "@/components/portfolio/transaction-form";
import { useHydrated } from "@/hooks/use-hydrated";
import { usePlan } from "@/hooks/use-plan";
import { useNow } from "@/hooks/use-now";
import { useFindings, useInstruments, useQuotes, useRates } from "@/hooks/use-market-data";
import { ApiError, type Finding } from "@/lib/api/client";
import type { Instrument, Transaction } from "@/lib/api/types";
import { ACTION_LABELS, RISK_PROFILES } from "@/lib/api/types";
import { formatQuantity, quantityPrecision } from "@/lib/market/format";
import { findingLimit } from "@/lib/plan";
import { USD_PER_UNIT } from "@/lib/market/universe";
import { convert, derivePortfolio, positionInputs } from "@/lib/portfolio/derive";
import { todayForInput } from "@/lib/portfolio/transaction-schema";
import { undoableToast } from "@/lib/toast";
import { handlingFor, useAdviceActions } from "@/store/use-advice-actions";
import { usePortfolio } from "@/store/use-portfolio";
import { usePreferences } from "@/store/use-preferences";
import { useWatchlist } from "@/store/use-watchlist";

/**
 * What ember found — the screen the whole repositioning is for.
 *
 * v1's Home was a portfolio dashboard: your value, a chart, your positions,
 * the day's movers, and one "next window" card fetched from a feed you had to
 * navigate to. It browsed engine output. This comes to you, and it leads with
 * the two things an alpha finder owes you: something worth doing, and
 * something you hold that has stopped working — ranked against each other by
 * urgency rather than segregated by kind.
 *
 * **Risk and opportunity share one list on purpose.** Two panels would make
 * the user do the triage, which is the job. A token-unlock watch on 12% of the
 * book does not belong above a high-conviction buy whose window is open now,
 * and only one ordering can say so.
 */
const REDUCING = new Set(["sell", "reduce"]);

interface Executing {
  finding: Finding;
  instrument: Instrument;
  quantity: number | null;
}

export function FindingsInbox() {
  const hydrated = useHydrated();
  const now = useNow(60_000);
  const [executing, setExecuting] = useState<Executing | null>(null);

  const { plan, ready: planReady } = usePlan();
  const riskProfile = usePreferences((s) => s.riskProfile);
  const base = usePreferences((s) => s.baseCurrency);
  const transactions = usePortfolio((s) => s.transactions);
  const addTransaction = usePortfolio((s) => s.add);
  const removeTransaction = usePortfolio((s) => s.remove);
  const watching = useWatchlist((s) => s.symbols);

  const handled = useAdviceActions((s) => s.handled);
  const markHandled = useAdviceActions((s) => s.markHandled);
  const clearHandled = useAdviceActions((s) => s.clear);

  const instrumentsQuery = useInstruments();
  const quotesQuery = useQuotes();
  const ratesQuery = useRates();

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

  /**
   * The four derived numbers per position that the route is allowed to see.
   *
   * Everything else about the ledger stays on the device. `positionInputs` is
   * the single place that decides what leaves — see ADR 0025, and note that
   * this is the only request in ember that sends rather than asks.
   */
  const positions = useMemo(
    () => (hydrated ? positionInputs(summary.positions) : []),
    [hydrated, summary.positions],
  );

  const findingsQuery = useFindings(riskProfile, positions, watching, {
    enabled: hydrated,
  });

  const bySymbol = useMemo(
    () => new Map(instruments.map((i) => [i.symbol, i])),
    [instruments],
  );

  const findings = findingsQuery.data?.findings ?? [];
  const found = findingsQuery.data?.found ?? { opportunity: 0, risk: 0 };
  const assessed = findingsQuery.data?.assessed ?? 0;
  // See the note in `signals-screen.tsx`: a cold server ranks a subset and says
  // how much of the universe it has not seen yet.
  const pending = findingsQuery.data?.pending ?? 0;

  /* ── Sizing a finding into units the user can actually enter ───────────── */

  const suggestedFor = (finding: Finding) => {
    const instrument = bySymbol.get(finding.symbol);
    if (!instrument) return null;

    if (finding.kind === "risk") {
      const quantity = finding.risk?.action.quantity ?? 0;
      return quantity > 0
        ? {
            quantity,
            value: convert(
              quantity * finding.assessment.price,
              instrument.currency,
              base,
              rates,
            ),
          }
        : null;
    }

    // A percentage of a book is a suggestion; a quantity is a trade, and
    // making the user do that arithmetic is where good advice quietly stops
    // being acted on.
    const { sizing, price } = finding.assessment;
    if (!sizing || summary.totalValue <= 0) return null;

    const valueBase = sizing.weight * summary.totalValue;
    const valueQuote = convert(valueBase, base, instrument.currency, rates);
    const quantity = valueQuote / price;

    return quantity > 0 ? { quantity, value: valueBase } : null;
  };

  const signatureOf = (finding: Finding) =>
    finding.kind === "risk"
      ? (finding.risk?.trigger ?? "risk")
      : finding.assessment.action;

  const handlingOf = (finding: Finding) =>
    now === null ? null : handlingFor(handled, finding.id, signatureOf(finding), now);

  /* ── Actions ───────────────────────────────────────────────────────────── */

  /**
   * How long handling a finding suppresses it.
   *
   * An opportunity is cleared until its own window closes, exactly as the feed
   * has always done. A risk has no window — a breached stop is still breached
   * tomorrow — so dismissing one holds for a day and then asks again, which is
   * the same interval the alert log uses and for the same reason: an
   * unresolved position should not be able to go quiet permanently because it
   * was waved away once.
   */
  const expiryFor = (finding: Finding) =>
    finding.kind === "risk"
      ? finding.createdAt + 24 * 3_600_000
      : finding.assessment.window.to;

  const handleDismiss = (finding: Finding) => {
    markHandled(finding.id, {
      kind: "dismissed",
      signature: signatureOf(finding),
      until: expiryFor(finding),
    });

    undoableToast(
      finding.kind === "risk"
        ? `Dismissed the ${finding.symbol} warning`
        : `Dismissed ${ACTION_LABELS[finding.assessment.action]} ${finding.symbol}`,
      {
        description:
          finding.kind === "risk"
            ? "It'll come back tomorrow if the position still looks like this."
            : "It'll come back if ember's read changes.",
        onUndo: () => clearHandled(finding.id),
      },
    );
  };

  const handleExecuted = (finding: Finding, values: Omit<Transaction, "id">) => {
    const instrument = bySymbol.get(finding.symbol);
    const id = addTransaction(values);
    markHandled(finding.id, {
      kind: "executed",
      signature: signatureOf(finding),
      until: expiryFor(finding),
    });
    setExecuting(null);

    undoableToast("Executed", {
      description: `${values.side === "buy" ? "Bought" : "Sold"} ${formatQuantity(
        values.quantity,
        instrument?.market ?? "equity",
      )} ${finding.symbol}`,
      onUndo: () => {
        removeTransaction(id);
        clearHandled(finding.id);
      },
    });
  };

  const openExecute = (finding: Finding) => {
    const instrument = bySymbol.get(finding.symbol);
    if (!instrument) return;
    setExecuting({
      finding,
      instrument,
      quantity: suggestedFor(finding)?.quantity ?? null,
    });
  };

  /* ── Render ────────────────────────────────────────────────────────────── */

  // The plan is part of what the list *is*: until it is known, a Pro reader
  // would be shown the free cap and an upsell card, then watch the rest of
  // their list push everything down. Held in the skeleton instead.
  const loading =
    !hydrated || !planReady || findingsQuery.isPending || instrumentsQuery.isPending;
  const error = findingsQuery.error;

  const unhandled = findings.filter((f) => handlingOf(f) === null);
  const done = findings.filter((f) => handlingOf(f) !== null);

  /**
   * The free tier's cap, applied *after* ranking and never before it.
   *
   * That ordering is the whole difference between a shorter answer and a worse
   * one. `findings.ts` already sorts by urgency across both kinds, so the three a
   * free reader sees are the three ember would put first for anybody — the cap
   * removes the tail, not the top. A cap applied before the sort, or one that
   * sampled, would be selling a different product to people who had not paid.
   *
   * Handled findings are outside the cap on purpose: they are the user's own
   * history of what they did, and metering somebody's record of their own actions
   * would be indefensible.
   */
  const cap = findingLimit(plan);
  const open = cap === null ? unhandled : unhandled.slice(0, cap);
  const withheld = unhandled.length - open.length;
  const shownRisks = open.filter((f) => f.kind === "risk").length;

  return (
    <>
      <Section
        title="What ember found"
        /* Short by design. The header has to hold a title, this, and a link on
           a 375px screen; anything longer wraps the row. The fuller accounting
           — how many were found against how many are drawn — goes under the
           list, which is where a reader asks the question. */
        hint={
          loading
            ? undefined
            : shownRisks > 0
              ? `${shownRisks} on what you hold`
              : `${assessed} watched`
        }
        href="/signals"
        linkLabel="All signals"
      >
        {error ? (
          <ErrorState
            message={
              error instanceof ApiError ? error.message : "Findings didn't load."
            }
            onRetry={() => findingsQuery.refetch()}
          />
        ) : loading ? (
          <div className="divide-y divide-line border-t border-line">
            <FindingRowSkeleton />
            <FindingRowSkeleton />
          </div>
        ) : open.length === 0 ? (
          <NothingFound assessed={assessed} held={summary.positions.length} />
        ) : (
          <div className="divide-y divide-line border-t border-line">
            {open.map((finding) => {
              const instrument = bySymbol.get(finding.symbol);
              if (!instrument) return null;
              return (
                <FindingRow
                  key={finding.id}
                  finding={finding}
                  instrument={instrument}
                  base={base}
                  now={now}
                  suggested={suggestedFor(finding)}
                  handled={null}
                  onExecute={() => openExecute(finding)}
                  onDismiss={() => handleDismiss(finding)}
                  onUndo={() => clearHandled(finding.id)}
                />
              );
            })}
          </div>
        )}

        {/* The gate, said where it bit and nowhere else.
            Only when it actually withheld something — a free reader with two
            findings is not missing anything, and an upsell there would be an
            advertisement rather than an explanation. ADR 0038. */}
        {!loading && !error && withheld > 0 && (
          <PlanCard feature="unlimited-findings" className="mt-4" />
        )}

        {/* The screen's credibility, and the place a reader actually asks for
            it: at the end of the list, not above it. Naming the size of the
            search is the difference between "ember looked at everything and
            found three things" and "this page has three things on it" — and
            when the page limit bites, saying so beats presenting twelve as the
            whole answer. */}
        {!loading && !error && open.length > 0 && (
          <p className="mt-4 text-micro text-stone">
            {trimmed(found, unhandled.length + done.length)} ember assessed{" "}
            {assessed}{" "}
            instruments against your{" "}
            {RISK_PROFILES[riskProfile].label.toLowerCase()} profile
            {pending > 0
              ? `, and is still loading ${pending} more.`
              : "."}
          </p>
        )}
      </Section>

      {done.length > 0 && (
        <Section title="Handled" hint="until these expire" className="mt-10">
          <div className="divide-y divide-line border-t border-line">
            {done.map((finding) => {
              const instrument = bySymbol.get(finding.symbol);
              if (!instrument) return null;
              return (
                <FindingRow
                  key={finding.id}
                  finding={finding}
                  instrument={instrument}
                  base={base}
                  now={now}
                  suggested={suggestedFor(finding)}
                  handled={handlingOf(finding)}
                  onExecute={() => openExecute(finding)}
                  onDismiss={() => handleDismiss(finding)}
                  onUndo={() => clearHandled(finding.id)}
                />
              );
            })}
          </div>
        </Section>
      )}

      <ResponsiveModal
        open={executing !== null}
        onOpenChange={(next) => !next && setExecuting(null)}
        title={
          executing?.finding.kind === "risk" ? "Log the reduction" : "Log this trade"
        }
        description="Pre-filled from ember's sizing. Change anything that doesn't match your fill."
      >
        {executing && (
          <TransactionForm
            key={executing.finding.id}
            instruments={instruments}
            quotes={quotesQuery.data?.quotes ?? []}
            existing={transactions}
            defaults={{
              symbol: executing.finding.symbol,
              side:
                executing.finding.kind === "risk" ||
                REDUCING.has(executing.finding.assessment.action)
                  ? "sell"
                  : "buy",
              quantity:
                executing.quantity === null
                  ? ""
                  : String(
                      Number(
                        executing.quantity.toFixed(
                          quantityPrecision(executing.instrument.market),
                        ),
                      ),
                    ),
              price: String(executing.finding.assessment.price),
              date: todayForInput(),
              // Stamps the ledger with where the trade came from, so the track
              // record can later tell followed calls from the user's own ideas.
              note: noteFor(executing.finding),
            }}
            onSubmit={(values) => handleExecuted(executing.finding, values)}
            onCancel={() => setExecuting(null)}
          />
        )}
      </ResponsiveModal>
    </>
  );
}

function noteFor(finding: Finding): string {
  if (finding.kind === "risk" && finding.risk) {
    return `ember risk · ${finding.risk.trigger}`;
  }
  const { action, confidence, confidenceLabel } = finding.assessment;
  return `ember ${ACTION_LABELS[action]} · ${confidenceLabel} ${confidence}`;
}

/**
 * Whether the list is everything, or the top of it.
 *
 * An earlier draft of this said "12 more below the fold", which was simply
 * wrong: they are not below the fold, they are not on the page. Which of the
 * two it is decides whether the reader scrolls, so it is worth being exact
 * about.
 */
function trimmed(
  found: { opportunity: number; risk: number },
  shown: number,
): string {
  const total = found.opportunity + found.risk;
  return total > shown
    ? `Showing the ${shown} most urgent of ${total} found.`
    : `That's all ${total === 1 ? "of it" : "of them"}.`;
}

/**
 * The empty state, which on a quiet day is the state.
 *
 * It must read as a considered answer rather than a page that failed. Naming
 * the size of the search is what does that — and the second sentence is
 * different depending on whether the user holds anything, because "nothing you
 * hold needs attention" is only reassuring if you hold something.
 */
function NothingFound({ assessed, held }: { assessed: number; held: number }) {
  return (
    <div className="flex flex-col items-start border-t border-line py-8">
      <div className="mb-4 grid size-11 place-items-center rounded-xl bg-surface-2 text-stone">
        <Compass className="size-5" />
      </div>
      <h3 className="text-heading font-semibold text-ink">Nothing needs you today</h3>
      <p className="mt-1.5 max-w-md text-body text-stone">
        {assessed > 0
          ? `ember assessed ${assessed} instruments and none reached the conviction and confidence your risk profile asks for.${
              held > 0
                ? ` Your ${held} ${held === 1 ? "position is" : "positions are"} inside their stops, their theses intact.`
                : ""
            } That's the answer, not an absence of one.`
          : "No instruments could be assessed this cycle."}
      </p>
      <Link
        href="/signals"
        className="mt-5 rounded-sm text-caption font-medium text-brand-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        See every read, holds included
      </Link>
    </div>
  );
}
