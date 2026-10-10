"use client";

import { ChangeChip } from "@/components/market/change-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, formatPercent, splitMoney } from "@/lib/market/format";
import type { PortfolioSummary } from "@/lib/portfolio/derive";
import { cn } from "@/lib/utils";

/**
 * The number the user opens the app for.
 *
 * Set in Archivo at `wdth 112 / wght 600` — the width axis is the brand
 * signature and the reason this reads as engraved rather than as a large
 * default sans. Cents drop to title size: at hero scale, matching them to the
 * dollars makes the eye land on the decimals first, and it costs the width
 * that keeps a six-figure balance on one line at 375px.
 *
 * Everything below the figure is a *derived* quantity — cost basis, unrealized
 * and realized P&L all come out of the transaction log (CLAUDE.md §5), so they
 * cannot disagree with each other or with the ledger.
 */
export function ValueHero({
  summary,
  className,
}: {
  summary: PortfolioSummary;
  className?: string;
}) {
  const { sign, symbol, whole, fraction } = splitMoney(summary.totalValue, summary.base);

  // A naira or yen balance runs several digits longer than a dollar one. Past
  // nine digits the hero size overflows 375px even with small cents, so it
  // steps down rather than wrapping mid-number.
  //
  // The digit count is only half of it, though, and phase 17's sweep found the
  // other half: at 320px — the narrowest width the app claims to support — a
  // perfectly ordinary six-figure dollar balance pushed the document 36px wide
  // and every screen carrying this hero scrolled sideways. Digits are a
  // property of the number; the space to draw them in is a property of the
  // viewport, and the rule (ADR 0023) is that type steps *down a size* rather
  // than truncating or wrapping mid-figure. So it does both: `max-[374px]:`
  // takes the same step for a narrow screen that nine digits take for a long
  // number, and the two compose.
  const oversized = whole.length > 9;

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="eyebrow">Portfolio value</h2>
        <span className="mono-label text-micro text-stone">{summary.base}</span>
      </div>

      <p
        className={cn(
          "figure mt-1.5 flex items-baseline text-ink",
          // 32px on a phone (`text-hero`), 56px from md up.
          oversized
            ? "text-hero"
            : "text-hero max-[374px]:text-display md:text-figure",
        )}
      >
        <span>
          {sign}
          {symbol}
          {whole}
        </span>
        {fraction && (
          <span
            className={cn(
              "text-stone",
              oversized ? "text-heading" : "text-heading md:text-title",
            )}
          >
            .{fraction}
          </span>
        )}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <ChangeChip value={summary.dayChange}>
          {formatMoney(summary.dayChange, summary.base, { signed: true })}
        </ChangeChip>
        {summary.dayChangePct !== null && (
          <span className="num text-caption text-stone">
            {formatPercent(summary.dayChangePct, { signed: true })} today
          </span>
        )}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 min-[375px]:grid-cols-3">
        <Stat
          label="Invested"
          value={formatMoney(summary.totalCost, summary.base)}
          short={formatMoney(summary.totalCost, summary.base, { decimals: 0 })}
        />
        <Stat
          label="Unrealized"
          value={formatMoney(summary.unrealized, summary.base, { signed: true })}
          short={formatMoney(summary.unrealized, summary.base, { signed: true, decimals: 0 })}
          hint={
            summary.unrealizedPct === null
              ? undefined
              : formatPercent(summary.unrealizedPct, { signed: true })
          }
          tone={summary.unrealized}
        />
        <Stat
          label="Realized"
          value={formatMoney(summary.realized, summary.base, { signed: true })}
          short={formatMoney(summary.realized, summary.base, { signed: true, decimals: 0 })}
          hint="lifetime"
          tone={summary.realized}
        />
      </dl>
    </div>
  );
}

function Stat({
  label,
  value,
  short,
  hint,
  tone,
}: {
  label: string;
  value: string;
  /**
   * The figure without its minor units, for a phone. A naira book's
   * "₦97,180,302.65" truncated to "₦97,180,302…" in a third of 375px; the
   * cents are on the chart and the positions below (§5: shorter, not squeezed).
   */
  short?: string;
  hint?: string;
  /** Signed quantity that tints the value. Omit for neutral figures. */
  tone?: number;
}) {
  const colour =
    tone === undefined || tone === 0
      ? "text-ink"
      : tone > 0
        ? "text-up"
        : "text-down";

  return (
    <div className="min-w-0">
      <dt className="text-micro text-stone">{label}</dt>
      {/* One step down on a phone so all three fit one row from 375px — two
          columns left Realized alone on a second line beside a hole. */}
      <dd className={cn("num truncate text-body font-medium max-sm:text-caption", colour)}>
        <span className={short ? "max-sm:hidden" : undefined}>{value}</span>
        {short && <span className="sm:hidden">{short}</span>}
      </dd>
      {/* The hint gets its own line rather than trailing the figure.
          Inline, at the v2 body size, "+$20,864.31 +28.5%" overflowed a
          165px column on a 375px screen and truncated to "+28…." — which
          reads as a broken number rather than as an omission. A `<dd>` and
          not a `<p>`: a `<p>` between `<dt>` and `<dd>` is invalid inside a
          `<dl>` and axe flags the whole list as unparseable. */}
      {hint && <dd className="truncate text-micro text-stone">{hint}</dd>}
    </div>
  );
}

/**
 * Matches the hero's layout box for box.
 *
 * The requirement is zero cumulative layout shift when data lands, which means
 * the skeleton has to reserve the *same* heights, not merely look plausible —
 * so it uses the same type classes and the same grid rather than a stack of
 * grey rectangles.
 */
export function ValueHeroSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col", className)} aria-hidden>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="eyebrow">Portfolio value</h2>
        <Skeleton className="h-3 w-8" />
      </div>

      {/* A div, not the `p` the real hero uses: `Skeleton` renders a div, and
          a div inside a p is invalid HTML that the browser silently reparents
          — which then fails hydration. Same box, legal nesting. */}
      {/* The bar is 0.72em so it reads as a figure rather than a slab, but the
          *box* has to be a full line of `text-figure` — sized to the bar it
          was 16px short of the real hero, which is where the rest of this
          card's layout shift was hiding. The transparent glyph does that. */}
      {/* The narrow-screen step-down has to be here too, or the skeleton is a
          64px line where the hero draws a 40px one and the shift it was
          written to prevent comes back below 375px. */}
      <div className="figure mt-1.5 flex items-center text-hero max-[374px]:text-display md:text-figure">
        <Skeleton className="flex w-[7ch] items-center rounded-lg">
          <span className="text-hero text-transparent max-[374px]:text-display md:text-figure">
            0
          </span>
        </Skeleton>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Skeleton className="h-6 w-24 rounded-md" />
        <Skeleton className="h-4 w-20" />
      </div>

      {/* Sized by the same type classes the real `Stat` uses, never by a
          guessed height — a flat `h-4` where `text-body` lands is seven pixels
          a row, and that is how the asset page reached 0.635 CLS against a
          stated rule of zero (ADR 0019).

          `Invested` has no hint and the other two do, so the reservation is
          per-label rather than uniform: giving all three a hint line would
          overshoot by one row exactly as surely as giving none of them would
          undershoot. */}
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 min-[375px]:grid-cols-3">
        {(
          [
            ["Invested", false],
            ["Unrealized", true],
            ["Realized", true],
          ] as const
        ).map(([label, hasHint]) => (
          <div key={label} className="min-w-0">
            <dt className="text-micro text-stone">{label}</dt>
            <dd>
              <Skeleton className="w-20">
                <span className="block text-body text-transparent max-sm:text-caption">0</span>
              </Skeleton>
            </dd>
            {hasHint && (
              <dd>
                <Skeleton className="mt-0.5 w-12">
                  <span className="block text-micro text-transparent">0</span>
                </Skeleton>
              </dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}
