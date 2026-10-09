"use client";

import { useState } from "react";
import { LockSimple } from "@/components/common/icon";
import { PlanInterstitial } from "@/components/plan/upsell";
import { CallHeader } from "@/components/signals/call-parts";
import { Button } from "@/components/ui/button";
import type { Instrument, LockedCall } from "@/lib/api/types";
import { formatQuotePrice } from "@/lib/market/format";
import type { Feature } from "@/lib/plan";
import { cn } from "@/lib/utils";

/**
 * A call the reader's plan doesn't show — drawn where Buy or Sell would be
 * (decision 288).
 *
 * It says ember found something and not which way it points. The server never
 * sent the direction, so there is nothing here to reveal; pressing it opens the
 * plans, titled for what this lock is about.
 */

export function featureFor(call: Pick<LockedCall, "reason">): Feature {
  return call.reason === "markets" ? "all-markets" : "all-calls";
}

/**
 * The badge: a lock and "Pro call", the size of an `ActionBadge`, and a button.
 *
 * "Pro call" on a call rather than "Pro": beside AAPL, a bare "Pro" read as
 * "AAPL needs Pro", when AAPL is a free market and only today's call is locked.
 */
export function LockedBadge({
  feature = "all-calls",
  size = "default",
  symbol,
  className,
}: {
  feature?: Feature;
  /** Named in the accessible label, so a list of locks isn't one phrase repeated. */
  symbol?: string;
  size?: "sm" | "default";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const isCall = feature === "all-calls" || feature === "all-markets";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={
          isCall
            ? `${symbol ? `The call on ${symbol}` : "This call"} is part of Pro. See plans`
            : `${symbol ? `${symbol} is` : "This is"} part of Pro. See plans`
        }
        className={cn(
          "tap-target inline-flex shrink-0 items-center gap-1 rounded-md bg-brand-tint font-semibold text-brand-text",
          "transition-colors hover:bg-brand-tint/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          size === "sm" ? "px-1.5 py-0.5 text-micro" : "px-2 py-0.5 text-caption",
          className,
        )}
      >
        <LockSimple weight="fill" className={size === "sm" ? "size-3" : "size-3.5"} />
        {isCall ? "Pro call" : "Pro"}
      </button>
      <PlanInterstitial feature={feature} open={open} onOpenChange={setOpen} />
    </>
  );
}

/** One locked call as a row: the badge, the instrument and its price. */
export function LockedCallRow({
  call,
  instrument,
}: {
  call: LockedCall;
  instrument: Instrument | undefined;
}) {
  return (
    <li className="py-3.5">
      <CallHeader
        badge={<LockedBadge feature={featureFor(call)} symbol={call.symbol} />}
        symbol={call.symbol}
        name={instrument?.name ?? ""}
        price={instrument ? formatQuotePrice(instrument, call.price) : ""}
      />
    </li>
  );
}

/**
 * The locked calls under a list of full ones: a line saying how many, a way to
 * the plans, and the rows — a page at a time, because "All reads" locks two
 * hundred.
 *
 * `rows={false}` is the line alone. Home listed up to fifteen locked rows, each
 * its own button, and the last thing on the screen was an upsell: one line says
 * the same and ends the list on what ember found.
 */
export function LockedCalls({
  calls,
  instruments,
  title,
  pageSize = 10,
  heading: Heading = "h3",
  rows = true,
  className,
}: {
  rows?: boolean;
  /** `h2` where this sits directly under the page title, as on Signals. */
  heading?: "h2" | "h3";
  calls: readonly LockedCall[];
  instruments: ReadonlyMap<string, Instrument>;
  /** The line above the rows, e.g. "12 more calls". */
  title: string;
  pageSize?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(pageSize);
  const [open, setOpen] = useState(false);
  if (calls.length === 0) return null;

  const feature = calls.some((c) => c.reason === "calls") ? "all-calls" : "all-markets";
  const rest = calls.length - shown;

  if (!rows) {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-y border-line py-3.5",
          className,
        )}
      >
        <p className="flex items-center gap-2 text-caption font-medium text-ink">
          <LockSimple weight="fill" className="size-4 shrink-0 text-brand" />
          {title}
        </p>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          See plans
        </Button>
        <PlanInterstitial feature={feature} open={open} onOpenChange={setOpen} />
      </div>
    );
  }

  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Heading className="flex items-center gap-2 text-body font-semibold text-ink">
          <LockSimple weight="fill" className="size-4 text-brand" />
          {title}
        </Heading>
        <Button size="sm" onClick={() => setOpen(true)}>
          See plans
        </Button>
      </div>
      <ul className="divide-y divide-line border-y border-line">
        {calls.slice(0, shown).map((call) => (
          <LockedCallRow key={call.symbol} call={call} instrument={instruments.get(call.symbol)} />
        ))}
      </ul>
      {rest > 0 && (
        <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + pageSize * 2)}>
          Show {Math.min(rest, pageSize * 2)} more
        </Button>
      )}
      <PlanInterstitial feature={feature} open={open} onOpenChange={setOpen} />
    </section>
  );
}

/**
 * The asset page's read, locked: one line saying ember has a call here, and the
 * plans. In place of the call card, not over a blurred one — there is nothing
 * underneath to blur, because the server did not send it.
 */
export function LockedRead({
  symbol,
  feature,
  held = false,
}: {
  symbol: string;
  feature: Feature;
  /**
   * The reader owns it. "ember has a call on AAPL" to somebody holding forty
   * shares reads as a warning held to ransom, which a lock must never be (§5).
   * Warnings about a position are free, and the copy says so.
   */
  held?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl bg-surface-2 px-4 py-3.5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-caption font-medium text-ink">
          <LockSimple weight="fill" className="size-4 shrink-0 text-brand" />
          {held ? `ember's read on ${symbol} is part of Pro` : `ember has a call on ${symbol}`}
        </p>
        <p className="mt-1.5 text-caption text-stone text-pretty">
          {held
            ? "Warnings about a position you hold are always free. If there's one, it's on Home."
            : feature === "all-markets"
              ? "Calls on international stocks and currencies are part of Pro."
              : "Buy or sell, when to act, how much and the stop are part of Pro."}
        </p>
      </div>
      <Button size="sm" onClick={() => setOpen(true)}>
        See plans
      </Button>
      <PlanInterstitial feature={feature} open={open} onOpenChange={setOpen} />
    </div>
  );
}

/**
 * Holdings or watched instruments past the plan's limit — an account whose Pro
 * lapsed (decision 289). Named, never valued: what they are worth is what Pro
 * shows. The rows behind them are untouched and come back the moment Pro does.
 */
export function LockedHoldings({
  symbols,
  instruments,
  kind = "holdings",
  className,
}: {
  symbols: readonly string[];
  instruments: ReadonlyMap<string, Instrument>;
  kind?: "holdings" | "watchlist";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (symbols.length === 0) return null;
  const count = symbols.length;
  const feature: Feature = kind === "holdings" ? "more-holdings" : "bigger-watchlist";
  const noun =
    kind === "holdings"
      ? count === 1
        ? "holding"
        : "holdings"
      : count === 1
        ? "watched instrument"
        : "watched instruments";

  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 className="flex items-center gap-2 text-body font-semibold text-ink">
          <LockSimple weight="fill" className="size-4 text-brand" />
          {count} more {noun} on Pro
        </h3>
        <Button size="sm" onClick={() => setOpen(true)}>
          See plans
        </Button>
      </div>
      <p className="text-caption text-stone">
        {kind === "holdings"
          ? "Free tracks your largest few. Nothing is deleted; get Pro and these come back as they were."
          : "Nothing is deleted; get Pro and these come back as they were."}
      </p>
      <ul className="divide-y divide-line border-y border-line">
        {symbols.map((symbol) => (
          <li key={symbol} className="flex items-center gap-2 py-3.5">
            <LockedBadge feature={feature} symbol={symbol} />
            <span className="mono-label text-caption text-ink">{symbol}</span>
            <span className="min-w-0 truncate text-caption text-stone">
              {instruments.get(symbol)?.name}
            </span>
          </li>
        ))}
      </ul>
      <PlanInterstitial feature={feature} open={open} onOpenChange={setOpen} />
    </section>
  );
}
