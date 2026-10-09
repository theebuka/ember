"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "@/components/common/icon";
import type { Assessment } from "@/lib/api/client";
import { ACTION_LABELS, type Instrument } from "@/lib/api/types";
import { formatPercent, formatQuotePrice, formatWindowTime } from "@/lib/market/format";
import { cn } from "@/lib/utils";

/**
 * The pieces every call is built from, wherever it appears.
 *
 * A call was drawn two ways — a hairline row on Home, a tall bordered card on
 * Signals and the asset page — with different buttons and a "Full read" on one
 * only. Same object, two shapes, which is how an app starts to read as
 * assembled. Both now open on `CallHeader`, act through the same row of `sm`
 * buttons, and keep their working behind `CallDetails`: headline, band, size
 * and stop are always visible, the reasoning is one press away.
 */

/** Badge, symbol, name, an optional tag, and the price on the right. */
export function CallHeader({
  badge,
  symbol,
  name,
  tag,
  price,
  /** Omit the symbol and name where the page is already about this instrument. */
  identity = true,
}: {
  badge: React.ReactNode;
  symbol: string;
  name: string;
  tag?: React.ReactNode;
  price: string;
  identity?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      {badge}
      {identity && (
        <>
          <Link
            href={`/asset/${encodeURIComponent(symbol)}`}
            className="mono-label rounded-sm text-caption text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {symbol}
          </Link>
          <span className="min-w-0 truncate text-caption text-stone">{name}</span>
        </>
      )}
      {tag}
      <span className="num ml-auto shrink-0 text-caption text-stone">{price}</span>
    </div>
  );
}

/**
 * The one tag shape. Tone is the only thing that varies — never the radius,
 * never the padding — so "you hold 22%", "Pro" and a status read as one family.
 */
export function Tag({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "neutral" | "brand";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-micro font-medium",
        tone === "brand" ? "bg-brand-tint text-brand-text" : "bg-surface-2 text-stone",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * What ember suggested, said once more where the trade is logged.
 *
 * The form opened without the stop or the window the reader had just read,
 * so acting on a call meant remembering it across a modal.
 */
export function suggestionLine(assessment: Assessment, instrument: Instrument): string {
  const parts: string[] = [];
  if (assessment.sizing) {
    parts.push(`${formatPercent(assessment.sizing.weight, { decimals: 1 })} of your portfolio`);
    parts.push(`stop ${formatQuotePrice(instrument, assessment.sizing.stopPrice)}`);
  }
  if (assessment.window.hasWindow) {
    parts.push(`window until ${formatWindowTime(assessment.window.closesAt)}`);
  }
  return parts.length > 0
    ? `ember suggested ${parts.join(", ")}. Enter what you actually paid.`
    : "Enter what you actually paid.";
}

/** Stamped on a logged trade, so the ledger records the call and its stop. */
export function noteForCall(assessment: Assessment, instrument: Instrument): string {
  const stop = assessment.sizing
    ? ` · stop ${formatQuotePrice(instrument, assessment.sizing.stopPrice)}`
    : "";
  return `ember ${ACTION_LABELS[assessment.action]} · ${assessment.confidenceLabel} ${assessment.confidence}${stop}`;
}

/**
 * A call's working, behind one press.
 *
 * `trigger` renders where the caller puts it (the end of the action row), and
 * the panel renders below that row — so the toggle never moves when it opens.
 */
export function useCallDetails() {
  const [open, setOpen] = useState(false);
  const id = useId();

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      aria-controls={id}
      className={cn(
        "tap-target ml-auto inline-flex h-9 items-center gap-1 rounded-full px-3 text-caption font-medium text-stone",
        "hover:bg-surface-2 hover:text-ink",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    >
      {open ? "Less" : "Details"}
      <ChevronDown
        aria-hidden
        className={cn("size-3.5 transition-transform", open && "rotate-180")}
      />
    </button>
  );

  const panel = (children: React.ReactNode) =>
    open ? (
      <div id={id} className="mt-4 space-y-4 border-t border-line pt-4">
        {children}
      </div>
    ) : null;

  return { trigger, panel };
}
