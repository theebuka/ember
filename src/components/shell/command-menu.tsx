"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Moon, Sun, Monitor, Plus, Sparkles, TrendUp } from "@/components/common/icon";
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
import { readCommandMenuOpen, setCommandMenuOpen, useCommandMenuOpen } from "@/components/shell/command-menu-state";
import { cn } from "@/lib/utils";

/**
 * Open state as an external store, not component state.
 *
 * The palette is rendered by the shell but opened from the side panel's search
 * row as well as from the keyboard, and those two live in different subtrees.
 * A context provider would work; this is the pattern the codebase already uses
 * for the shared clock and the notification permission, and it lets the
 * opener be a plain function rather than a hook every caller has to thread.
 */

/** Track record and Methodology have no icon in the rail; here every row has one, so labels share a left edge. */
const CHILD_ICONS: Record<string, React.ReactNode> = {
  "/signals/track-record": <TrendUp />,
  "/signals/methodology": <BookOpen />,
};

function Hint({
  keys,
  className,
  children,
}: {
  keys: string[];
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      {keys.map((key) => (
        <kbd
          key={key}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-surface-2 px-1.5 font-sans text-micro font-medium text-graphite"
        >
          {key}
        </kbd>
      ))}
      {children}
    </span>
  );
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
      setCommandMenuOpen(!readCommandMenuOpen());
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isDesktop]);

  const go = useCallback(
    (href: string) => {
      setCommandMenuOpen(false);
      router.push(href);
    },
    [router],
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={setCommandMenuOpen}
      title="Search ember"
      description="Find an instrument or a screen, or change the theme."
      // On a phone it is a full screen with a close button, not a floating box.
      className="max-md:inset-0 max-md:top-0 max-md:h-dvh max-md:max-w-none max-md:translate-x-0 max-md:rounded-none! max-md:border-0 max-md:pt-[var(--safe-top)]"
      showCloseButton={!isDesktop}
    >
      <CommandInput autoFocus placeholder={isDesktop ? "Search instruments and screens…" : "Search instruments and screens"} />
      <CommandList className="max-md:max-h-none max-md:flex-1">
        <CommandEmpty>
          Nothing matches that. Try a ticker like AAPL, or a company name.
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
              {CHILD_ICONS[child.href]}
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
                {/* A fixed column for the ticker, so the names line up. */}
                <span className="mono-label min-w-24 shrink-0 text-caption text-ink">
                  {instrument.symbol}
                </span>
                <span className="min-w-0 truncate text-stone">{instrument.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem value="log trade transaction" onSelect={() => go("/portfolio?start=log")}>
            <Plus />
            Log a trade
            <CommandShortcut>Portfolio</CommandShortcut>
          </CommandItem>
          <CommandItem value="import csv" onSelect={() => go("/portfolio?start=import")}>
            <Sparkles />
            Import a CSV
            <CommandShortcut>Portfolio</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="theme light"
            onSelect={() => {
              setTheme("light");
              setCommandMenuOpen(false);
            }}
          >
            <Sun />
            Light theme
          </CommandItem>
          <CommandItem
            value="theme dark"
            onSelect={() => {
              setTheme("dark");
              setCommandMenuOpen(false);
            }}
          >
            <Moon />
            Dark theme
          </CommandItem>
          <CommandItem
            value="theme system match"
            onSelect={() => {
              setTheme("system");
              setCommandMenuOpen(false);
            }}
          >
            <Monitor />
            Match system theme
          </CommandItem>
        </CommandGroup>
      </CommandList>

      <div
        aria-hidden
        className="flex items-center gap-4 border-t border-line px-4 py-2.5 text-micro text-stone max-md:hidden"
      >
        <Hint keys={["↑", "↓"]}>to move</Hint>
        <Hint keys={["↵"]}>to open</Hint>
        <Hint keys={["esc"]} className="ml-auto">to close</Hint>
      </div>
    </CommandDialog>
  );
}
