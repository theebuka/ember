"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Moon, Sun, Monitor, Plus, Sparkles } from "@/components/common/icon";
import { useTheme } from "next-themes";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useInstruments } from "@/hooks/use-market-data";
import { useIsDesktop } from "@/hooks/use-media-query";
import { MARKET_LABELS, type MarketKind } from "@/lib/api/types";
import { NAV_ITEMS } from "@/lib/nav";

/**
 * Open state as an external store, not component state.
 *
 * The palette is rendered by the shell but opened from the side panel's search
 * row as well as from the keyboard, and those two live in different subtrees.
 * A context provider would work; this is the pattern the codebase already uses
 * for the shared clock and the notification permission, and it lets the
 * opener be a plain function rather than a hook every caller has to thread.
 */
const listeners = new Set<() => void>();
let openState = false;

function setOpenState(next: boolean) {
  if (next === openState) return;
  openState = next;
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function useCommandMenuOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => openState,
    () => false,
  );
}

export function openCommandMenu(): void {
  setOpenState(true);
}

/**
 * ⌘K — go anywhere, in two keystrokes.
 *
 * The universe is a hundred-odd instruments and seven destinations, which is
 * exactly the size where a palette earns its place: small enough that
 * everything is reachable, large enough that the watchlist is a worse way to
 * get to USDJPY than typing three letters.
 *
 * **Desktop only, and mounted only there.** A key combination is not an
 * affordance on a touch screen, and the bottom nav already puts every
 * destination one thumb away. Rendering it on mobile would ship an unusable
 * dialog and a listener for a key nobody can press.
 *
 * The shortcut is claimed on `keydown` with `preventDefault`, because ⌘K is
 * the browser's own focus-the-address-bar binding in some builds and losing
 * that race means the palette opens *and* the URL bar takes focus.
 */
export function CommandMenu() {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const { setTheme } = useTheme();
  const open = useCommandMenuOpen();

  // The instrument list is `staleTime: Infinity` and already fetched by
  // every screen that shows a price, so this is a cache read, not a request.
  const instrumentsQuery = useInstruments();

  const grouped = useMemo(() => {
    const groups = new Map<MarketKind, { symbol: string; name: string }[]>();
    for (const instrument of instrumentsQuery.data?.instruments ?? []) {
      const list = groups.get(instrument.market) ?? [];
      list.push({ symbol: instrument.symbol, name: instrument.name });
      groups.set(instrument.market, list);
    }
    return [...groups.entries()];
  }, [instrumentsQuery.data]);

  useEffect(() => {
    if (!isDesktop) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setOpenState(!openState);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isDesktop]);

  const go = useCallback(
    (href: string) => {
      setOpenState(false);
      router.push(href);
    },
    [router],
  );

  if (!isDesktop) return null;

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpenState}
      title="Search ember"
      description="Jump to a screen or an instrument, or change the theme."
    >
      <CommandInput placeholder="Go to a screen, or type a ticker…" />
      <CommandList>
        <CommandEmpty>
          No matches.
        </CommandEmpty>

        <CommandGroup heading="Go to">
          {NAV_ITEMS.map((item) => (
            <CommandItem
              key={item.href}
              value={`go ${item.label}`}
              onSelect={() => go(item.href)}
            >
              <item.icon />
              {item.label}
            </CommandItem>
          ))}
          {NAV_ITEMS.flatMap((item) => item.children ?? []).map((child) => (
            <CommandItem
              key={child.href}
              value={`go ${child.label}`}
              onSelect={() => go(child.href)}
            >
              {child.label}
            </CommandItem>
          ))}
        </CommandGroup>

        {grouped.map(([market, instruments]) => (
          <CommandGroup key={market} heading={MARKET_LABELS[market]}>
            {instruments.map((instrument) => (
              <CommandItem
                // Both the ticker and the name are searchable: people look for
                // "nvidia" as readily as "NVDA", and a palette that only
                // matches the symbol is a palette you have to already know.
                key={instrument.symbol}
                value={`${instrument.symbol} ${instrument.name}`}
                onSelect={() => go(`/asset/${instrument.symbol}`)}
              >
                <span className="mono-label text-caption">{instrument.symbol}</span>
                <span className="text-stone">{instrument.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem value="log trade transaction" onSelect={() => go("/portfolio")}>
            <Plus />
            Log a trade
            <CommandShortcut>Portfolio</CommandShortcut>
          </CommandItem>
          <CommandItem value="import csv" onSelect={() => go("/portfolio")}>
            <Sparkles />
            Import a CSV
            <CommandShortcut>Portfolio</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="theme light"
            onSelect={() => {
              setTheme("light");
              setOpenState(false);
            }}
          >
            <Sun />
            Light theme
          </CommandItem>
          <CommandItem
            value="theme dark"
            onSelect={() => {
              setTheme("dark");
              setOpenState(false);
            }}
          >
            <Moon />
            Dark theme
          </CommandItem>
          <CommandItem
            value="theme system match"
            onSelect={() => {
              setTheme("system");
              setOpenState(false);
            }}
          >
            <Monitor />
            Match system theme
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
