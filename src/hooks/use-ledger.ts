"use client";

import { useMemo } from "react";
import { useInstruments, useQuotes, useRates } from "@/hooks/use-market-data";
import { usePlan } from "@/hooks/use-plan";
import type { Transaction } from "@/lib/api/types";
import { USD_PER_UNIT } from "@/lib/market/universe";
import { holdingLimit } from "@/lib/plan";
import { derivePortfolio, keepLargest, openSymbols } from "@/lib/portfolio/derive";
import { usePortfolio } from "@/store/use-portfolio";
import { usePreferences } from "@/store/use-preferences";

const NONE: readonly string[] = [];

/**
 * The ledger as the reader's plan shows it (decision 289).
 *
 * A free account tracks a few holdings. One that holds more — somebody whose
 * Pro lapsed — sees its largest few, and every figure is measured over those:
 * value, gain, the chart, the warnings. **Nothing is removed.** `all` is the
 * whole ledger, untouched on the device and on the server, and resubscribing
 * shows the rest again at once.
 *
 * Read the shown ledger for anything drawn, and `all` for anything written:
 * the trade form's checks, export, sync.
 *
 * A sample book is exempt, like the holdings limit itself.
 */
export function useLedger(): {
  /** What the plan shows. */
  transactions: readonly Transaction[];
  /** Every row the device holds. */
  all: readonly Transaction[];
  /** Open positions the plan doesn't show, largest first. */
  locked: readonly string[];
} {
  const all = usePortfolio((s) => s.transactions);
  const isSample = usePortfolio((s) => s.isSample);
  const base = usePreferences((s) => s.baseCurrency);
  const { plan, ready } = usePlan();
  const limit = isSample || !ready ? null : holdingLimit(plan);

  // Shared caches with every other screen; nothing extra is fetched.
  const quotes = useQuotes().data?.quotes;
  const instruments = useInstruments().data?.instruments;
  const rates = useRates().data?.rates;

  return useMemo(() => {
    if (limit === null || openSymbols(all).size <= limit) {
      return { transactions: all, all, locked: NONE };
    }

    const { positions } = derivePortfolio({
      transactions: all,
      quotes: quotes ?? [],
      instruments: instruments ?? [],
      rates: rates ?? USD_PER_UNIT,
      base,
    });
    return { ...keepLargest(all, positions, limit), all };
  }, [all, limit, quotes, instruments, rates, base]);
}
