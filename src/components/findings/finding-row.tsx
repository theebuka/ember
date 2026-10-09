"use client";

import Link from "next/link";
import { CaretRight, Check, Clock, Undo2, X } from "@/components/common/icon";
import { ActionBadge } from "@/components/signals/action-badge";
import { CallHeader, useCallDetails } from "@/components/signals/call-parts";
import { WindowBand } from "@/components/signals/window-band";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Finding } from "@/lib/api/client";
import type { BaseCurrency, Instrument } from "@/lib/api/types";
import {
  describeHorizon,
  formatMoney,
  formatPercent,
  formatApproxQuantity,
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
  const href = `/asset/${encodeURIComponent(finding.symbol)}`;
  const details = useCallDetails();

  return (
    <article className={cn("py-5", handled && "opacity-60")}>
      {/* ── What, and how loud ───────────────────────────────────────────── */}
      <CallHeader
        badge={
          isRisk && risk ? (
            <SeverityBadge severity={risk.severity} />
          ) : (
            <ActionBadge action={assessment.action} />
          )
        }
        symbol={finding.symbol}
        name={instrument.name}
        price={formatQuotePrice(instrument, assessment.price)}
      />

      {/* ── The finding itself ───────────────────────────────────────────── */}
      {/* The headline is the way into the full read at every width. It was a
          link on phones only, with `tabIndex={-1}`, which left a keyboard user
          on a narrow window no way in but the symbol. */}
      <p className="mt-2.5 text-body font-medium text-ink">
        <Link
          href={href}
          className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {finding.headline}
        </Link>
      </p>
      <p className="mt-1 text-caption text-stone">{finding.detail}</p>

      {/* ── When, or why ─────────────────────────────────────────────────── */}
      {isRisk ? null : (
        <div className="mt-3.5">
          <WindowBand window={assessment.window} />
          <p className="mt-1.5 flex items-start gap-1.5 text-caption text-stone">
            <span aria-hidden className="flex h-[1lh] shrink-0 items-center">
              <Clock className="size-3.5" />
            </span>
            <span>
              {finding.ready
                ? `Open now, until ${now === null ? "—" : formatWindowTime(assessment.window.closesAt)}`
                : finding.opensAt === null
                  ? `No tradeable window in the next ${describeHorizon(assessment.window)}.`
                  : /* The sentence v1 could not say. `isActionable` required an
                       open window before a call could surface at all, so a find
                       whose moment was two days out was simply thrown away. */
                    `The window opens ${now === null ? "soon" : formatWindowTime(finding.opensAt)}.`}
            </span>
          </p>
        </div>
      )}

      {/* ── What to do about it, sized ───────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {isRisk && risk ? (
          <>
            <span className="text-caption font-medium text-ink">
              {risk.action.label}
            </span>
            <span className="num text-caption text-stone">
              ≈ {formatApproxQuantity(risk.action.quantity, instrument.market)}{" "}
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

      {/* ── Act ──────────────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
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
            {/* `sm` throughout: a list of findings is several of these in a
                column, and a 40px brand pill on every one turned the inbox
                into a stack of competing calls to action. */}
            <Button size="sm" onClick={onExecute}>
              {isRisk ? "Log reduction" : "Execute"}
            </Button>
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              <X />
              Dismiss
            </Button>
            {details.trigger}
          </>
        )}
      </div>

      {/* ── Why ember says so ────────────────────────────────────────────── */}
      {/* The rule's reasoning and its citation, one press away at every width
          rather than two more layers under every finding on desktop. */}
      {details.panel(
        <>
          <div className="space-y-1">
            <p className="text-caption text-stone">
              {isRisk && risk ? risk.action.note : (assessment.sizing?.note ?? "")}
            </p>
            <p className="text-micro text-stone">
              {isRisk && risk
                ? `${risk.citation.authors} (${risk.citation.year}), ${risk.citation.title}.`
                : (assessment.contributions[0] &&
                    `${assessment.contributions[0].name} — ${assessment.contributions[0].citation.authors} (${assessment.contributions[0].citation.year}).`)}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={href}>
              Full read
              <CaretRight />
            </Link>
          </Button>
        </>,
      )}
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
        // An outline rather than a fill: on the sample book three critical
        // risks stacked into three red slabs, which is alarm, not ranking.
        severity === "critical"
          ? "text-down ring-1 ring-down/45 ring-inset"
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
        <Skeleton className="h-6 w-16 rounded-md" />
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

      <Skeleton className="mt-4 h-[1lh] w-2/3 text-caption" />

      <div className="mt-4 flex gap-1.5">
        <Skeleton className="h-9 w-20 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>
    </div>
  );
}
