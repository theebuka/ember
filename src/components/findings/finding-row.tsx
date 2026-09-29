"use client";

import Link from "next/link";
import { ArrowRight, Check, Clock, Undo2, X } from "@/components/common/icon";
import { ActionBadge } from "@/components/signals/action-badge";
import { WindowBand } from "@/components/signals/window-band";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Finding } from "@/lib/api/client";
import type { BaseCurrency, Instrument } from "@/lib/api/types";
import {
  describeHorizon,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatQuotePrice,
  formatWindowTime,
} from "@/lib/market/format";
import type { HandledCall } from "@/store/use-advice-actions";
import { cn } from "@/lib/utils";

/**
 * One finding, in the inbox.
 *
 * Not a card — a row in a hairline-separated list, per ADR 0024. That is not
 * only a visual decision here: an inbox of bordered rectangles reads as a
 * dashboard of widgets, and the thing this screen has to communicate is a
 * *queue of decisions*, which is a list.
 *
 * The two kinds share one layout deliberately. A risk and an opportunity are
 * the same object to the user — something ember found, with a reason, a size
 * and a control to act or clear it — and giving them different shapes would
 * imply they are different kinds of attention when the whole point is that
 * they arrive in one place, ranked against each other.
 *
 * What differs is the middle: an opportunity carries a window band, because
 * timing is the differentiator and there is an entry to route. A risk carries
 * the measured trigger instead, because there is nothing to time — the
 * position is already on.
 */

export interface FindingActions {
  /** Units and value implied by the recommended size, in the user's book. */
  suggested: { quantity: number; value: number } | null;
  handled: HandledCall | null;
  onExecute: () => void;
  onDismiss: () => void;
  onUndo: () => void;
}

export function FindingRow({
  finding,
  instrument,
  base,
  now,
  suggested,
  handled,
  onExecute,
  onDismiss,
  onUndo,
}: {
  finding: Finding;
  instrument: Instrument;
  base: BaseCurrency;
  /** From `useNow` — null until mounted, per ADR 0017. */
  now: number | null;
} & FindingActions) {
  const isRisk = finding.kind === "risk";
  const { assessment, risk } = finding;

  return (
    <article className={cn("py-5", handled && "opacity-60")}>
      {/* ── What, and how loud ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {isRisk && risk ? (
          <SeverityBadge severity={risk.severity} />
        ) : (
          <ActionBadge action={assessment.action} />
        )}

        <Link
          href={`/asset/${encodeURIComponent(finding.symbol)}`}
          className="mono-label rounded-sm text-caption text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {finding.symbol}
        </Link>
        <span className="min-w-0 truncate text-caption text-stone">
          {instrument.name}
        </span>

        <span className="num ml-auto shrink-0 text-caption text-stone">
          {formatQuotePrice(instrument, assessment.price)}
        </span>
      </div>

      {/* ── The finding itself ───────────────────────────────────────────── */}
      <p className="mt-2.5 text-body font-medium text-ink">{finding.headline}</p>
      <p className="mt-1 text-caption text-stone">{finding.detail}</p>

      {/* ── When, or why ─────────────────────────────────────────────────── */}
      {isRisk ? null : (
        <div className="mt-3.5">
          <WindowBand window={assessment.window} />
          <p className="mt-1.5 flex items-start gap-1.5 text-caption text-stone">
            <Clock className="mt-0.5 size-3 shrink-0" />
            <span>
              {finding.ready
                ? `Open now, until ${now === null ? "—" : formatWindowTime(assessment.window.closesAt)}`
                : finding.opensAt === null
                  ? `No tradeable window in the next ${describeHorizon(assessment.window)}.`
                  : /* The sentence v1 could not say. `isActionable` required an
                       open window before a call could surface at all, so a find
                       whose moment was two days out was simply thrown away. */
                    `Found — the window opens ${now === null ? "soon" : formatWindowTime(finding.opensAt)}.`}
            </span>
          </p>
        </div>
      )}

      {/* ── What to do about it, sized ───────────────────────────────────── */}
      <div className="mt-3.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-line pt-3">
        {isRisk && risk ? (
          <>
            <span className="text-caption font-medium text-ink">
              {risk.action.label}
            </span>
            <span className="num text-caption text-stone">
              ≈ {formatQuantity(risk.action.quantity, instrument.market)}{" "}
              {finding.symbol}
            </span>
          </>
        ) : assessment.sizing ? (
          <>
            <span className="text-caption font-medium text-ink">
              {formatPercent(assessment.sizing.weight, { decimals: 1 })} of the book
            </span>
            {suggested && (
              <span className="num text-caption text-stone">
                ≈ {formatMoney(suggested.value, base)}
              </span>
            )}
            <span className="num text-caption text-stone">
              stop {formatQuotePrice(instrument, assessment.sizing.stopPrice)}
            </span>
          </>
        ) : null}
      </div>

      <p className="mt-1.5 text-micro text-stone">
        {isRisk && risk ? risk.action.note : (assessment.sizing?.note ?? "")}
      </p>

      {/* ── Why ember says so ────────────────────────────────────────────── */}
      <p className="mt-2 text-micro text-stone">
        {isRisk && risk
          ? `${risk.citation.authors} (${risk.citation.year}), ${risk.citation.title}.`
          : (assessment.contributions[0] &&
              `${assessment.contributions[0].name} — ${assessment.contributions[0].citation.authors} (${assessment.contributions[0].citation.year}).`)}
      </p>

      {/* ── Act ──────────────────────────────────────────────────────────── */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        {handled ? (
          <>
            <span className="flex items-center gap-1.5 text-caption text-stone">
              <Check className="size-3.5 text-up" />
              {handled.kind === "executed" ? "Executed" : "Cleared"}
            </span>
            {/* Deliberately not "Undo". The toast shown at the moment of
                execution does undo — it removes the transaction it wrote. This
                control can be pressed days later, and quietly deleting a logged
                trade then would be indefensible. It only puts the finding back
                in the inbox, and the label says exactly that. */}
            <Button variant="ghost" size="sm" onClick={onUndo} className="ml-auto">
              <Undo2 />
              Reopen
            </Button>
          </>
        ) : (
          <>
            <Button size="default" onClick={onExecute}>
              {isRisk ? "Log the reduction" : "Execute"}
            </Button>
            <Button variant="ghost" size="default" onClick={onDismiss}>
              <X />
              Dismiss
            </Button>
            <Button variant="ghost" size="default" asChild className="ml-auto">
              <Link href={`/asset/${encodeURIComponent(finding.symbol)}`}>
                Full read
                <ArrowRight />
              </Link>
            </Button>
          </>
        )}
      </div>
    </article>
  );
}

/**
 * How much of the user's attention a risk is asking for.
 *
 * Only `critical` gets the direction tint. `warning` and `watch` are
 * neutral — the severity is carried by the word, and three tinted levels would
 * turn the inbox into a traffic light, which is the casino register the brief
 * rules out. A list where everything is coloured says nothing about which item
 * matters.
 */
function SeverityBadge({ severity }: { severity: "critical" | "warning" | "watch" }) {
  const label =
    severity === "critical" ? "Act now" : severity === "warning" ? "Warning" : "Watch";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-caption font-semibold",
        severity === "critical"
          ? "bg-down-tint text-down"
          : "bg-surface-2 text-graphite",
      )}
    >
      {label}
    </span>
  );
}

export function FindingRowSkeleton() {
  return (
    <div className="py-5" aria-hidden>
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-16 rounded-md" />
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="ml-auto h-4 w-16" />
      </div>

      {/* Sized by type metrics, not by guess — a transparent glyph in the real
          class cannot drift from the text that replaces it. ADR 0019. */}
      <Skeleton className="mt-2.5 h-[1lh] w-3/4 text-body" />
      <Skeleton className="mt-1 h-[1lh] w-full text-caption" />

      <Skeleton className="mt-3.5 h-10 w-full rounded-md" />
      <Skeleton className="mt-1.5 h-[1lh] w-1/2 text-caption" />

      <div className="mt-3.5 border-t border-line pt-3">
        <Skeleton className="h-[1lh] w-2/3 text-caption" />
      </div>
      <Skeleton className="mt-1.5 h-[1lh] w-3/4 text-micro" />
      <Skeleton className="mt-2 h-[1lh] w-1/2 text-micro" />

      <div className="mt-3.5 flex gap-2">
        <Skeleton className="h-10 w-28 rounded-full" />
        <Skeleton className="h-10 w-28 rounded-full" />
      </div>
    </div>
  );
}
