"use client";

import Link from "next/link";
import { Clock } from "@/components/common/icon";
import { ActionBadge } from "@/components/signals/action-badge";
import { Confidence } from "@/components/signals/confidence";
import { WindowBand } from "@/components/signals/window-band";
import { Skeleton } from "@/components/ui/skeleton";
import type { Assessment } from "@/lib/api/client";
import type { Instrument } from "@/lib/api/types";
import { formatPercent, formatQuotePrice } from "@/lib/market/format";
import { cn } from "@/lib/utils";

/**
 * The differentiator, on the home screen.
 *
 * Every competitor ships a badge that says BUY. What this card adds is *when*,
 * *how much* and *where to give up* — and it always carries all three. A bare
 * direction is the thing that gets people hurt, so the size and the stop are
 * not an expandable detail here; they're on the face of the card.
 *
 * Exactly one recommendation is shown. Ranking the universe and
 * surfacing the top one is the product having an opinion; a scrollable list of
 * everything would be the app handing the judgement back.
 */
export function NextWindowCard({
  assessment,
  instrument,
  className,
}: {
  assessment: Assessment;
  instrument: Instrument;
  className?: string;
}) {
  const { sizing, window: execution, regime } = assessment;

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ActionBadge action={assessment.action} />
            <span className="mono-label text-caption text-ink">{assessment.symbol}</span>
            <span className="min-w-0 truncate text-caption text-stone">
              {instrument.name}
            </span>
          </div>
          <p className="mt-2 text-body text-graphite">{assessment.summary}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className="num text-heading font-medium text-ink">
            {formatQuotePrice(instrument, assessment.price)}
          </p>
          {/* Sentence case, not `capitalize` — that would give "Calm
              Downtrend", and title case in running copy is the register this
              app is trying not to have. */}
          <p className="mt-0.5 text-micro text-stone first-letter:uppercase">
            {regime.label}
          </p>
        </div>
      </div>

      <p className="mt-2 text-caption text-stone">{assessment.detail}</p>

      <div className="mt-4">
        <WindowBand window={execution} size="md" />
      </div>

      {execution.notes.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-caption text-stone">
          <span aria-hidden className="flex h-[1lh] shrink-0 items-center">
            <Clock className="size-3.5 text-stone" />
          </span>
          <span>{execution.notes.slice(0, 2).join(" ")}</span>
        </p>
      )}

      <dl className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-2 border-t border-line pt-3.5">
        <div className="flex items-baseline gap-1.5">
          <dt className="text-micro text-stone">Confidence</dt>
          <dd>
            <Confidence
              value={assessment.confidence}
              label={assessment.confidenceLabel}
            />
          </dd>
        </div>

        {sizing && (
          <>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-micro text-stone">Size</dt>
              <dd className="num text-caption font-medium text-ink">
                {formatPercent(sizing.weight, { decimals: 1 })}{" "}
                <span className="font-normal text-stone">of portfolio</span>
              </dd>
            </div>

            <div className="flex items-baseline gap-1.5">
              <dt className="text-micro text-stone">Stop</dt>
              <dd className="num text-caption font-medium text-ink">
                {formatQuotePrice(instrument, sizing.stopPrice)}{" "}
                <span className="font-normal text-stone">
                  {sizing.stopMultiple.toFixed(1)} ATR
                </span>
              </dd>
            </div>
          </>
        )}
      </dl>

      <Link
        href={`/asset/${assessment.symbol}`}
        className={cn(
          "mt-3.5 inline-flex w-fit rounded-sm text-caption font-medium text-brand-text",
          "underline-offset-4 hover:underline",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        Why this call
      </Link>
    </div>
  );
}

/**
 * What the card says when nothing clears the bar.
 *
 * Restraint is a feature — on the current universe a fraction of the
 * instruments are typically actionable — but silence with no explanation reads
 * as breakage. It states what was checked and offers the way to see the full
 * set, so it isn't a dead end.
 */
export function NoWindowCard({
  assessed,
  className,
}: {
  assessed: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start", className)}>
      <p className="text-body text-graphite">
        Nothing clears the bar right now.
      </p>
      <p className="mt-1.5 text-caption text-stone">
        All {assessed} instruments were assessed this cycle. None reached the conviction
        and confidence your risk profile asks for, so ember isn&apos;t recommending a
        trade — that&apos;s the answer, not an absence of one.
      </p>
      <Link
        href="/signals"
        className={cn(
          "mt-3.5 rounded-sm text-caption font-medium text-brand-text",
          "underline-offset-4 hover:underline",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        See every read, holds included
      </Link>
    </div>
  );
}

export function NextWindowCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col", className)} aria-hidden>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-14 rounded-md" />
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
      <Skeleton className="mt-4 h-10 w-full rounded-md" />
      <div className="mt-2 h-4" />
      <Skeleton className="mt-2 h-4 w-2/3" />

      <div className="mt-4 flex gap-5 border-t border-line pt-3.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-28" />
      </div>
      <Skeleton className="mt-3.5 h-4 w-24" />
    </div>
  );
}
