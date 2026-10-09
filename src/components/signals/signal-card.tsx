"use client";

import { Check, Clock, Undo2, X } from "@/components/common/icon";
import { ActionBadge } from "@/components/signals/action-badge";
import { CallHeader, Tag, useCallDetails } from "@/components/signals/call-parts";
import { Confidence } from "@/components/signals/confidence";
import { StrategyBreakdown } from "@/components/signals/strategy-breakdown";
import { WindowBand } from "@/components/signals/window-band";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Assessment } from "@/lib/api/client";
import type { BaseCurrency, Instrument } from "@/lib/api/types";
import {
  formatApproxQuantity,
  formatMoney,
  formatPercent,
  formatQuotePrice,
} from "@/lib/market/format";
import type { HandledCall } from "@/store/use-advice-actions";
import { cn } from "@/lib/utils";

/**
 * One recommendation, in full.
 *
 * Everything needed to act on it *or to argue with it* is here: what, when,
 * how much, where to give up, how sure, and which published rules said so.
 * What changed is what is visible before a press. A call ran 650–900px on a
 * phone with nine layers in it, so the compact state is the decision — the
 * headline, the window, the size, the stop, the confidence — and `Details`
 * holds the working. Nothing is behind a link to another page, because the
 * reasoning is the product; it is behind one press on this one.
 *
 * Same shape as a finding on Home (`call-parts.tsx`): a row in a hairline
 * list, not a bordered card.
 */

export interface SuggestedTrade {
  /** Units implied by the recommended weight and the user's book. */
  quantity: number;
  /** Value of that position in base currency. */
  value: number;
}

export function SignalCard({
  assessment,
  instrument,
  base,
  /**
   * Whether this read clears the user's risk profile.
   *
   * Always true in the feed proper; false for the sub-threshold reads shown
   * under "Every read". Same rule as the watchlist (ADR 024) — a tinted `Buy`
   * on a call ember is explicitly *not* making would have the two views
   * contradicting each other.
   */
  actionable,
  /** Present when the user already holds this — changes what a Buy means. */
  heldWeight,
  suggested,
  handled,
  /**
   * Why there's no trade to log, when there isn't.
   *
   * A `Sell` on something the user doesn't hold is real information — don't
   * buy this — but there is nothing to execute, and v1 is long-only. Offering
   * Execute anyway would pre-fill a sale the ledger's own oversell guard then
   * rejects: a dead end reached by pressing the primary button on the card.
   */
  blockedReason,
  onExecute,
  onDismiss,
  onUndo,
  /** Symbol and name in the header — off where the page is about this instrument. */
  identity = true,
}: {
  assessment: Assessment;
  instrument: Instrument;
  base: BaseCurrency;
  actionable: boolean;
  heldWeight: number | null;
  suggested: SuggestedTrade | null;
  handled: HandledCall | null;
  blockedReason: string | null;
  onExecute: () => void;
  /** Absent where a call cannot be marked handled (the asset page). */
  onDismiss?: () => void;
  onUndo: () => void;
  identity?: boolean;
}) {
  const { sizing, window: execution, regime } = assessment;
  const details = useCallDetails();

  return (
    <article className={cn("py-5", handled && "opacity-60")}>
      {/* ── What ─────────────────────────────────────────────────────── */}
      <CallHeader
        badge={
          <ActionBadge
            action={assessment.action}
            muted={!actionable}
            title={
              actionable
                ? undefined
                : "Below your risk profile, so it isn't a recommendation."
            }
          />
        }
        symbol={assessment.symbol}
        name={instrument.name}
        identity={identity}
        tag={
          heldWeight !== null ? (
            <Tag>
              <span className="num">
                you hold {formatPercent(heldWeight, { decimals: 1 })}
              </span>
            </Tag>
          ) : undefined
        }
        price={formatQuotePrice(instrument, assessment.price)}
      />

      <p className="mt-2.5 text-body font-medium text-ink">{assessment.summary}</p>

      {/* ── When ─────────────────────────────────────────────────────── */}
      <div className="mt-3.5">
        <WindowBand window={execution} size="lg" />
      </div>

      {execution.notes.length > 0 && (
        <ul className="mt-2 space-y-1">
          {execution.notes.map((note) => (
            <li
              key={note}
              className="flex items-start gap-1.5 text-caption text-stone"
            >
              {/* A box one line tall, so the icon centres on the first
                  line of whatever face and line height the text is in —
                  a fixed `mt-0.5` was tuned to Satoshi and drifted. */}
              <span aria-hidden className="flex h-[1lh] shrink-0 items-center">
                <Clock className="size-3.5 text-stone" />
              </span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}

      {/* ── How much, where to give up, how sure ─────────────────────── */}
      {/* One wrapping line rather than a four-cell grid: in a quarter-width
          cell "15.0% ≈ $15,320" truncated to "15.0% ≈ $15,32…". */}
      <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {sizing ? (
          <>
            <span className="text-caption font-medium text-ink">
              {formatPercent(sizing.weight, { decimals: 1 })} of your portfolio
            </span>
            {suggested && (
              <span className="num text-caption text-stone">
                ≈ {formatMoney(suggested.value, base)} ·{" "}
                {formatApproxQuantity(suggested.quantity, instrument.market)}{" "}
                {instrument.symbol}
              </span>
            )}
            <span className="num text-caption text-stone">
              stop {formatQuotePrice(instrument, sizing.stopPrice)}
            </span>
          </>
        ) : (
          <span className="text-caption text-stone">Hold. Nothing to size.</span>
        )}
        <Confidence value={assessment.confidence} label={assessment.confidenceLabel} />
      </div>

      {/* ── Act ──────────────────────────────────────────────────────────
          Only on calls ember is actually making. Under "All reads" this is
          the model's working on something it has declined to recommend, and
          putting an Execute button on that would be the app arguing with
          itself. `Details` stays, because the working is the point there.

          Not rendered rather than hidden with CSS — a `display:none` button
          is out of the tab order but still in the DOM, and leaving dead
          controls around is how they come back. */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {actionable && handled ? (
          <>
            <span className="flex items-center gap-1.5 text-caption text-stone">
              <Check className="size-3.5 text-up" />
              {handled.kind === "executed" ? "Logged" : "Dismissed"}
            </span>
            {/* Deliberately not "Undo".
              The toast that appears the moment you execute *does* undo —
              it removes the transaction it just wrote. This button can be
              pressed days later, and quietly deleting a logged trade at
              that point would be indefensible. It only puts the call back
              among the open ones, and the label says exactly that. */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onUndo}
              title={
                handled.kind === "executed"
                  ? "Moves this back to your calls. Your logged trade stays."
                  : "Moves this back to your calls."
              }
            >
              <Undo2 />
              Reopen
            </Button>
          </>
        ) : actionable && blockedReason ? (
          <>
            <p className="min-w-0 basis-full text-caption text-stone sm:basis-auto sm:flex-1">
              {blockedReason}
            </p>
            {onDismiss && (
              <Button variant="ghost" size="sm" onClick={onDismiss}>
                <X />
                Dismiss
              </Button>
            )}
          </>
        ) : actionable ? (
          <>
            <Button size="sm" onClick={onExecute}>
              Log trade
            </Button>
            {onDismiss && (
              <Button variant="ghost" size="sm" onClick={onDismiss}>
                <X />
                Dismiss
              </Button>
            )}
          </>
        ) : null}
        {details.trigger}
      </div>

      {/* ── Why ──────────────────────────────────────────────────────── */}
      {details.panel(
        <>
          <div className="space-y-1">
            <p className="text-caption text-graphite">{assessment.detail}</p>
            <p className="text-caption text-stone">
              {regime.label.charAt(0).toUpperCase() + regime.label.slice(1)}.{" "}
              {regime.summary}
            </p>
          </div>

          {sizing && (
            <dl className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
              <Figure label="Stop distance">
                <span className="num text-caption font-medium text-ink">
                  {sizing.stopMultiple.toFixed(1)} ATR
                </span>
              </Figure>
              <Figure label="At risk">
                <span className="num text-caption font-medium text-ink">
                  {formatPercent(sizing.riskBudget, { decimals: 2 })}
                </span>
                <span className="ml-1 text-micro font-normal text-stone">of portfolio</span>
              </Figure>
              <Figure label="Size rule">
                <span className="text-caption text-stone">{sizing.note}</span>
              </Figure>
            </dl>
          )}

          <StrategyBreakdown assessment={assessment} />
        </>,
      )}
    </article>
  );
}

function Figure({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-micro text-stone">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

/**
 * The compact call's boxes, by type metrics (ADR 0019).
 *
 * Line counts are the typical call's, per width: a summary wraps to three lines
 * on a phone and two beside it on desktop, the three window notes to five and
 * three, the sizing line to three and two. Measured off real calls, because the
 * first version of this skeleton reserved the card's *minimum* and the feed
 * jumped 0.74 when the calls landed.
 */
export function SignalCardSkeleton() {
  return (
    <div className="py-5" aria-hidden>
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-16 rounded-md" />
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="ml-auto h-4 w-16" />
      </div>

      <Block className="mt-2.5 text-body" lines="h-[2lh] max-md:h-[3lh]" />

      <Skeleton className="mt-3.5 h-14 w-full rounded-md" />
      <Block className="mt-2 text-caption" lines="h-[1lh] max-md:h-[2lh]" />
      <Block
        className="mt-2 text-caption"
        lines="h-[calc(3lh+0.5rem)] max-md:h-[calc(5lh+0.5rem)]"
      />
      <Block className="mt-4 text-caption" lines="h-[2lh] max-md:h-[3lh]" />

      <div className="mt-4 flex gap-1.5">
        <Skeleton className="h-9 w-20 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>
    </div>
  );
}

/** A run of text lines: the box is the lines' height, the bar is the first line. */
function Block({ className, lines }: { className: string; lines: string }) {
  return (
    <div className={cn(className, lines)}>
      <Skeleton className="h-[1lh] w-3/4" />
    </div>
  );
}
