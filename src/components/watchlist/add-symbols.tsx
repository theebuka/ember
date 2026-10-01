"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "@/components/common/icon";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Instrument } from "@/lib/api/types";
import { MARKET_LABELS } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * Put an instrument back on the watchlist.
 *
 * Only reachable when something has been removed — the list follows the whole
 * universe by default, so "add" is a repair action rather than the primary way
 * to build a watchlist. That ordering is deliberate: a new user shouldn't have
 * to assemble a list before the screen shows them anything.
 */
export function AddSymbols({
  open,
  onOpenChange,
  available,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Instruments not currently followed. */
  available: readonly Instrument[];
  onAdd: (symbol: string) => void;
}) {
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = available.filter(
      (i) =>
        needle === "" ||
        i.symbol.toLowerCase().includes(needle) ||
        i.name.toLowerCase().includes(needle),
    );

    const groups = new Map<string, Instrument[]>();
    for (const i of matches) {
      const list = groups.get(i.market) ?? [];
      list.push(i);
      groups.set(i.market, list);
    }
    return [...groups.entries()];
  }, [available, query]);

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery("");
        onOpenChange(next);
      }}
      title="Follow an instrument"
      description="Instruments you've stopped following."
    >
      <div className="border-b border-line p-4 md:p-5">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-stone"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by symbol or name"
            aria-label="Search instruments"
            className="h-9 pl-8"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
        {grouped.length === 0 ? (
          <p className="py-2 text-caption text-stone">
            {available.length === 0
              ? "You're following everything in ember's universe."
              : `Nothing matches "${query.trim()}".`}
          </p>
        ) : (
          <div className="space-y-4">
            {grouped.map(([market, list]) => (
              <div key={market}>
                <h3 className="eyebrow mb-1.5">
                  {MARKET_LABELS[market as keyof typeof MARKET_LABELS]}
                </h3>
                <ul className="divide-y divide-line">
                  {list.map((instrument) => (
                    <li
                      key={instrument.symbol}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="mono-label text-caption text-ink">
                          {instrument.symbol}
                        </span>
                        <span className="ml-2 text-micro text-stone">
                          {instrument.name}
                        </span>
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onAdd(instrument.symbol)}
                      >
                        <Plus />
                        Follow
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={cn("border-t border-line p-4 md:p-5")}>
        <Button
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() => onOpenChange(false)}
        >
          Done
        </Button>
      </div>
    </ResponsiveModal>
  );
}
