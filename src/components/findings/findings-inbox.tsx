"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Compass } from "@/components/common/icon";
import { ErrorState } from "@/components/common/error-state";
import { LockedCalls } from "@/components/plan/locked";
import { Section } from "@/components/common/section";
import { FindingRow, FindingRowSkeleton } from "@/components/findings/finding-row";
import { TradeModal, TransactionForm } from "@/components/portfolio/trade-modal";
import { useHydrated } from "@/hooks/use-hydrated";
import { useNow } from "@/hooks/use-now";
import { useFindings, useInstruments, useQuotes, useRates } from "@/hooks/use-market-data";
import { ApiError, type Finding } from "@/lib/api/client";
import type { Instrument, Transaction } from "@/lib/api/types";
import { ACTION_LABELS } from "@/lib/api/types";
import {
  formatQuantity,
  priceForInput,
  quantityForInput,
  quantityPrecision,
} from "@/lib/market/format";
import { noteForCall, suggestionLine } from "@/components/signals/call-parts";
import { USD_PER_UNIT } from "@/lib/market/universe";
import { convert, derivePortfolio, positionInputs } from "@/lib/portfolio/derive";
import { todayForInput } from "@/lib/portfolio/dates";
import { undoableToast } from "@/lib/toast";
import { handlingFor, useAdviceActions } from "@/store/use-advice-actions";
import { usePortfolio } from "@/store/use-portfolio";
import { usePreferences } from "@/store/use-preferences";
import { useWatchlist } from "@/store/use-watchlist";
import { useLedger } from "@/hooks/use-ledger";

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

  const riskProfile = usePreferences((s) => s.riskProfile);
  const base = usePreferences((s) => s.baseCurrency);
  // What the plan shows; `ledger` is every row, for writes (decision 289).
  const { transactions, all: ledger } = useLedger();
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
            ? "It returns tomorrow if nothing changes."
            : "It returns if ember's read changes.",
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

    undoableToast("Trade logged", {
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

  const loading = !hydrated || findingsQuery.isPending || instrumentsQuery.isPending;
  const error = findingsQuery.error;

  const open = findings.filter((f) => handlingOf(f) === null);
  const done = findings.filter((f) => handlingOf(f) !== null);
  // Opportunities this plan doesn't show in full — counted and offered, never
  // sent with a direction (decision 288). Risks are never among them.
  const locked = findingsQuery.data?.locked ?? [];
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
              : undefined
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
        ) : open.length === 0 && locked.length === 0 ? (
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

        {!loading && !error && (
          <LockedCalls
            className={open.length > 0 ? "mt-6" : undefined}
            calls={locked}
            instruments={bySymbol}
            rows={false}
            title={`${locked.length} more ${locked.length === 1 ? "opportunity" : "opportunities"} on Pro`}
          />
        )}

        {/* Only when there is something the list itself doesn't show: that it
            was cut to the most urgent, or that instruments are still loading.
            "That's everything. Checked 214 instruments…" under every list was
            the app describing its own process. */}
        {!loading && !error && open.length > 0 && (
          <Footnote
            trimmed={trimmed(found, open.length + done.length + locked.length)}
            pending={pending}
          />
        )}
      </Section>

      {done.length > 0 && (
        <Section title="Handled" className="mt-10">
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

      <TradeModal
        open={executing !== null}
        onOpenChange={(next) => !next && setExecuting(null)}
        title="Log trade"
        description={
          executing
            ? executing.finding.kind === "risk" && executing.finding.risk
              ? `ember suggests: ${executing.finding.risk.action.label.toLowerCase()}. Enter what you actually sold.`
              : suggestionLine(executing.finding.assessment, executing.instrument)
            : undefined
        }
      >
        {executing && (
          <TransactionForm
            key={executing.finding.id}
            instruments={instruments}
            quotes={quotesQuery.data?.quotes ?? []}
            existing={ledger}
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
                  : executing.finding.kind === "risk"
                    ? // A sale of what you hold: exact, or rounding could ask
                      // to sell more than the position and meet the oversell guard.
                      String(
                        Number(
                          executing.quantity.toFixed(quantityPrecision(executing.instrument.market)),
                        ),
                      )
                    : quantityForInput(executing.quantity, executing.instrument.market),
              price: priceForInput(executing.instrument, executing.finding.assessment.price),
              date: todayForInput(),
              // Stamps the ledger with where the trade came from, so the track
              // record can later tell followed calls from the user's own ideas.
              note: noteFor(executing.finding, executing.instrument),
            }}
            onSubmit={(values) => handleExecuted(executing.finding, values)}
            onCancel={() => setExecuting(null)}
          />
        )}
      </TradeModal>
    </>
  );
}

function noteFor(finding: Finding, instrument: Instrument): string {
  if (finding.kind === "risk" && finding.risk) {
    return `ember risk · ${finding.risk.trigger}`;
  }
  return noteForCall(finding.assessment, instrument);
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
): string | null {
  const total = found.opportunity + found.risk;
  return total > shown
    ? `Showing the ${shown} most urgent of ${total}.`
    : null;
}

function Footnote({ trimmed, pending }: { trimmed: string | null; pending: number }) {
  if (trimmed === null && pending === 0) return null;
  return (
    <p className="mt-4 text-micro text-stone">
      {[trimmed, pending > 0 ? `${pending} instruments still loading.` : null]
        .filter(Boolean)
        .join(" ")}
    </p>
  );
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
          ? `ember checked ${assessed} instruments and none meet your risk profile.${
              held > 0
                ? ` Your ${held} ${held === 1 ? "position is" : "positions are"} within ${held === 1 ? "its stop" : "their stops"}.`
                : ""
            }`
          : "ember couldn't check any instruments this time. Try again shortly."}
      </p>
      <Link
        href="/signals"
        className="mt-5 rounded-sm text-caption font-medium text-brand-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        See all reads
      </Link>
    </div>
  );
}
