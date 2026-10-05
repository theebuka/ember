"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Search } from "@/components/common/icon";
import { PlanRailCard } from "@/components/plan/plan-rail-card";
import { PlanBadge } from "@/components/plan/subscription";
import { openCommandMenu } from "@/components/shell/command-menu-state";
import { Logo } from "@/components/shell/logo";
import { ProfileButton } from "@/components/shell/profile-button";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NAV_ITEMS, isActive } from "@/lib/nav";
import { useHydrated } from "@/hooks/use-hydrated";
import { usePreferences } from "@/store/use-preferences";
import { cn } from "@/lib/utils";

/**
 * Desktop primary navigation.
 *
 * **The rail sits on `canvas`, and the page is the panel beside it.** It used
 * to share `ground` with the page and have no edge at all, reasoning that the
 * content's cards would draw the separation. They stopped being cards in phase
 * 14, so nothing did: rail, header and page read as three things floating on
 * one white field. The frame is the edge, drawn once, by the page rather than
 * by a rule down the rail.
 *
 * What that leaves is a single elevated element — the active item — which is
 * exactly where the eye should go. It's the same ember-tinted pill the mobile
 * bar uses, so "where am I" looks identical on both.
 *
 * **The rail is set at the scale of a navigation list, not of page content.**
 * It shipped at `text-body` with 22px icons in 48px rows — the same size as
 * the copy on the page beside it, which made four destinations read as loudly
 * as the thing they lead to. Navigation is chrome: it should be legible and
 * then get out of the way. The measurements here are the settings tab row's
 * (15px label, `gap-2.5`, `px-3.5`), so the two navigations in the app are one
 * size rather than two.
 *
 * Collapses to an icon rail; the choice persists.
 */
export function SidePanel() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const collapsed = usePreferences((s) => s.sidebarCollapsed);
  const setCollapsed = usePreferences((s) => s.setSidebarCollapsed);

  // The stored width isn't known server-side. Suppress the transition until
  // hydration so a collapsed panel doesn't animate open on every page load.
  const isCollapsed = hydrated && collapsed;

  return (
    <aside
      aria-label="Primary"
      className={cn(
        // Stuck *under* the bar and `100dvh` minus its height. The bar is
        // sticky too (see `AppShell`), so this is right at every scroll
        // position — the first version was right only at the top of the page
        // and left a 40px strip under the footer once the bar scrolled away.
        "sticky top-[var(--bar-h,0px)] hidden shrink-0 flex-col md:flex",
        "h-[calc(100dvh-var(--bar-h,0px))]",
        hydrated && "transition-[width] duration-200 ease-out",
        isCollapsed ? "w-[4.25rem]" : "w-[15rem]",
      )}
    >
      {/* ── Brand ──────────────────────────────────────────────────────── */}
      <div
        className={cn(
          "flex h-16 items-center",
          isCollapsed ? "justify-center px-0" : "justify-between pr-3 pl-5",
        )}
      >
        <Link
          href="/"
          className="rounded-md outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <Logo wordmark={!isCollapsed} size={19} />
        </Link>
        {!isCollapsed && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse navigation"
            className="text-stone hover:text-stone"
          >
            <PanelLeftClose />
          </Button>
        )}
      </div>

      {/* ── Search ─────────────────────────────────────────────────────
          A shortcut nobody knows about is not a feature. The row is the
          affordance; the chip teaches the key. Collapsed, the icon button
          keeps the path without the label. */}
      <div className="px-3 pb-1">
        {isCollapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={openCommandMenu}
                aria-label="Search"
                aria-keyshortcuts="Meta+K Control+K"
                className="mx-auto flex text-stone hover:text-graphite"
              >
                <Search />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Search · ⌘K</TooltipContent>
          </Tooltip>
        ) : (
          <button
            type="button"
            onClick={openCommandMenu}
            aria-keyshortcuts="Meta+K Control+K"
            className={cn(
              "flex h-10 w-full items-center gap-2.5 rounded-full px-3.5 text-caption",
              "border border-line bg-ground text-stone outline-none transition-colors",
              "hover:text-graphite",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
            )}
          >
            <Search className="size-4 shrink-0" />
            Search
            <kbd className="mono-label ml-auto rounded-md bg-surface-2 px-1.5 py-0.5 text-micro text-stone">
              ⌘K
            </kbd>
          </button>
        )}
      </div>

      {/* ── Destinations ───────────────────────────────────────────────── */}
      <nav className={cn("flex-1 overflow-y-auto py-2", isCollapsed ? "px-3" : "px-3")}>
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;

            const link = (
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "tap-target relative flex h-10 items-center gap-2.5 rounded-full text-caption outline-none",
                  "transition-colors duration-150",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                  isCollapsed ? "justify-center px-0" : "px-3.5",
                  // Neutral, matching the phone bar. `line` rather than
                  // `surface-2`: the rail sits on `canvas`, where the in-page
                  // well colour all but disappears.
                  active
                    ? "bg-line font-semibold text-ink"
                    : "text-stone hover:bg-line/60 hover:text-graphite",
                )}
              >
                {/* Same vocabulary as the mobile bar: active is filled.
                    Here the tinted row survives too, because a row has text
                    to group — around a lone icon it read as a pressed button
                    and fought the fill for the same job. */}
                <Icon size={18} weight={active ? "fill" : "regular"} className="shrink-0" />
                {!isCollapsed && item.label}
              </Link>
            );

            return (
              <li key={item.href}>
                {isCollapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                ) : (
                  link
                )}

                {/* Secondary pages appear once you're inside the section, so
                    the rail stays five items at rest. */}
                {!isCollapsed && item.children && active && (
                  <ul
                    /* `ml-7` puts a child's text on the parent's label: 14px
                       of padding, an 18px icon and a 10px gap. */
                    className="mt-1 mb-1 ml-7 flex flex-col gap-0.5 border-l border-line pl-3.5"
                  >
                    {item.children.map((child) => {
                      const childActive = pathname === child.href;
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            aria-current={childActive ? "page" : undefined}
                            className={cn(
                              "flex h-8 items-center rounded-lg px-3 text-micro outline-none",
                              "transition-colors duration-150",
                              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                              childActive
                                ? "font-medium text-ink"
                                : "text-stone hover:text-graphite",
                            )}
                          >
                            {child.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── Pro ────────────────────────────────────────────────────────
          Directly above the footer, which is where this pattern lives in every
          reference for it — and, more usefully, the only place in the app where
          a standing note about the account is not interrupting something. Only
          on the expanded rail: at 68px there is no room for a sentence, and a
          lone icon that opens a sales modal is worse than nothing. */}
      {!isCollapsed && <PlanRailCard />}

      {/* ── Theme ──────────────────────────────────────────────────────── */}
      <div
        className={cn(
          "flex items-center px-3 pt-3",
          isCollapsed ? "justify-center" : "justify-between",
        )}
        style={{ paddingBottom: "max(0.75rem, var(--safe-bottom))" }}
      >
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <ProfileButton />
                </span>
              </TooltipTrigger>
              <TooltipContent side="right">Settings</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setCollapsed(false)}
                  aria-label="Expand navigation"
                  className="text-stone hover:text-stone"
                >
                  <PanelLeftOpen />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand navigation</TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <>
            {/* The portrait opens Settings too — the same destination as the
                last item above, kept because it is where people look for it. */}
            <div className="flex items-center gap-2">
              <ProfileButton />
              <PlanBadge />
            </div>
            <ThemeToggle />
          </>
        )}
      </div>
    </aside>
  );
}
