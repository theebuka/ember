"use client";

import { Check, Clock, Undo2, X } from "@/components/common/icon";
import { ActionBadge } from "@/components/signals/action-badge";
import { Confidence } from "@/components/signals/confidence";
import { StrategyBreakdown } from "@/components/signals/strategy-breakdown";
import { WindowBand } from "@/components/signals/window-band";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Assessment } from "@/lib/api/client";
import type { BaseCurrency, Instrument } from "@/lib/api/types";
import {
  formatMoney,
  formatPercent,
  formatQuantity,
  formatQuotePrice,
} from "@/lib/market/format";
import type { HandledCall } from "@/store/use-advice-actions";
import { cn } from "@/lib/utils";

/**
 * One recommendation, in full.
 *
 * Everything needed to act on it *or to argue with it* is on the card: what,
 * when, how much, where to give up, how sure, and which published rules said
 * so. Nothing is behind a "learn more" link, because the reasoning is the
 * product — an app that shows the badge and hides the argument is the gimmick
 * this one is built against.
 *
 * The order is deliberate. Direction first, because that's what was asked.
 * Then the window, because timing is the differentiator. Then size and stop,
 * because a direction without them is how people get hurt. Then the strategy
 * breakdown, because by that point the user knows what they're being told and
 * can decide whether to interrogate it.
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
  onDismiss: () => void;
  onUndo: () => void;
}) {
  const { sizing, window: execution, regime } = assessment;

  return (
    <Card className={cn(handled && "opacity-70")}>
      <CardContent>
        {/* ── What ─────────────────────────────────────────────────────── */}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <ActionBadge
                action={assessment.action}
                muted={!actionable}
                title={
                  actionable
                    ? undefined
                    : "Below your risk profile's bar — ember isn't recommending this."
                }
              />
              <span className="mono-label text-caption text-ink">
                {assessment.symbol}
              </span>
              <span className="min-w-0 truncate text-caption text-stone">
                {instrument.name}
              </span>
              {heldWeight !== null && (
                <span className="num shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-micro text-stone">
                  you hold {formatPercent(heldWeight, { decimals: 1 })}
                </span>
              )}
            </div>
            <p className="mt-2 text-body text-graphite">{assessment.summary}</p>
          </div>

          <div className="shrink-0 text-right">
            <p className="num text-heading font-medium text-ink">
              {formatQuotePrice(instrument, assessment.price)}
            </p>
            <p className="mt-0.5 text-micro text-stone first-letter:uppercase">
              {regime.label}
            </p>
          </div>
        </div>

        <p className="mt-2 text-caption text-stone">{assessment.detail}</p>
        <p className="mt-1 text-caption text-stone">{regime.summary}</p>

        {/* ── When ─────────────────────────────────────────────────────── */}
        <div className="mt-4">
          <WindowBand window={execution} size="lg" />
        </div>

        {execution.notes.length > 0 && (
          <ul className="mt-2 space-y-1">
            {execution.notes.map((note) => (
              <li
                key={note}
                className="flex items-start gap-1.5 text-caption text-stone"
              >
                <Clock
                  className="mt-0.5 size-3 shrink-0 text-stone"
                />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        )}

        {/* ── How much, and where to give up ───────────────────────────── */}
        <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-line pt-3.5 sm:grid-cols-4">
          <Figure label="Confidence">
            <Confidence
              value={assessment.confidence}
              label={assessment.confidenceLabel}
            />
          </Figure>

          {sizing ? (
            <>
              <Figure label="Size">
                <span className="num text-caption font-medium text-ink">
                  {formatPercent(sizing.weight, { decimals: 1 })}
                </span>
                {suggested && (
                  <span className="ml-1 text-micro font-normal text-stone">
                    ≈ {formatMoney(suggested.value, base)}
                  </span>
                )}
              </Figure>

              <Figure label="Stop">
                <span className="num text-caption font-medium text-ink">
                  {formatQuotePrice(instrument, sizing.stopPrice)}
                </span>
                <span className="ml-1 text-micro font-normal text-stone">
                  {sizing.stopMultiple.toFixed(1)} ATR
                </span>
              </Figure>

              <Figure label="At risk">
                <span className="num text-caption font-medium text-ink">
                  {formatPercent(sizing.riskBudget, { decimals: 2 })}
                </span>
                <span className="ml-1 text-micro font-normal text-stone">
                  of book
                </span>
              </Figure>
            </>
          ) : (
            <Figure label="Size">
              <span className="text-caption text-stone">
                No size — this is a hold
              </span>
            </Figure>
          )}
        </dl>

        {sizing && <p className="mt-2 text-micro text-stone">{sizing.note}</p>}

        {/* ── Why ──────────────────────────────────────────────────────── */}
        <StrategyBreakdown assessment={assessment} className="mt-4" />

        {/* ── Act ──────────────────────────────────────────────────────────
            Only on calls ember is actually making. Under "Every read" this
            card is showing the model's working on something it has declined
            to recommend, and putting an Execute button on that would be the
            app arguing with itself.

            Not rendered rather than hidden with CSS — a `display:none` button
            is out of the tab order but still in the DOM, and leaving dead
            controls around is how they come back. */}
        {actionable && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
            {handled ? (
              <>
                <span className="flex items-center gap-1.5 text-caption text-stone">
                  <Check className="size-3.5 text-up" />
                  {handled.kind === "executed" ? "Executed" : "Dismissed"}
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
                  className="ml-auto"
                  title={
                    handled.kind === "executed"
                      ? "Puts this back in your open calls. The logged trade stays in your portfolio."
                      : "Puts this back in your open calls."
                  }
                >
                  <Undo2 />
                  Reopen
                </Button>
              </>
            ) : blockedReason ? (
              <>
                <p className="min-w-0 flex-1 text-caption text-stone">
                  {blockedReason}
                </p>
                <Button variant="ghost" size="lg" onClick={onDismiss}>
                  <X />
                  Dismiss
                </Button>
              </>
            ) : (
              <>
                <Button size="lg" onClick={onExecute}>
                  Execute
                </Button>
                <Button variant="ghost" size="lg" onClick={onDismiss}>
                  <X />
                  Dismiss
                </Button>
                {suggested && (
                  <span className="num ml-auto text-micro text-stone">
                    ≈ {formatQuantity(suggested.quantity, instrument.market)}{" "}
                    {instrument.symbol}
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
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
      <dd className="mt-0.5 truncate">{children}</dd>
    </div>
  );
}

export function SignalCardSkeleton() {
  return (
    <Card aria-hidden>
      <CardContent>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-16 rounded-md" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-4 w-full max-w-sm" />
          </div>
          <div className="shrink-0 space-y-1.5 text-right">
            <Skeleton className="ml-auto h-5 w-20" />
            <Skeleton className="ml-auto h-3 w-24" />
          </div>
        </div>

        <Skeleton className="mt-2 h-4 w-full max-w-md" />
        <Skeleton className="mt-1 h-4 w-2/3" />

        <Skeleton className="mt-4 h-14 w-full rounded-md" />
        <div className="mt-2 h-4" />
        <Skeleton className="mt-2 h-4 w-3/4" />

        <div className="mt-4 grid grid-cols-2 gap-5 border-t border-line pt-3.5 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-line pt-3.5">
          <Skeleton className="h-4 w-56" />
        </div>

        <div className="mt-4 flex gap-2 border-t border-line pt-3.5">
          <Skeleton className="h-9 w-24 rounded-xl" />
          <Skeleton className="h-9 w-24 rounded-xl" />
        </div>
      </CardContent>
    </Card>
  );
}
