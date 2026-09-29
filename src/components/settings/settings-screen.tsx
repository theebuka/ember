"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageBody } from "@/components/common/page-body";
import { SectionHeader } from "@/components/common/section-header";
import { Segmented } from "@/components/common/segmented";
import { DataSourceChip } from "@/components/market/data-source-chip";
import { NotificationsButton } from "@/components/notifications/notifications-button";
import { AdminPanels } from "@/components/admin/admin-panels";
import { useAdmin } from "@/hooks/use-admin";
import { AccountSetting } from "@/components/settings/account-setting";
import { AlertSettings } from "@/components/settings/alert-settings";
import { DataSettings } from "@/components/settings/data-settings";
import { DeleteAccount } from "@/components/settings/delete-account";
import { PlanSetting } from "@/components/plan/plan-setting";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { RiskProfileSetting } from "@/components/settings/risk-profile-setting";
import {
  tabFromParam,
  visibleSections,
  type SettingsSection,
  type SettingsTab,
} from "@/components/settings/settings-nav";
import { SettingGroup, SettingRow } from "@/components/settings/setting-row";
import { PageHeader } from "@/components/shell/page-header";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Switch } from "@/components/ui/switch";
import { useHydrated } from "@/hooks/use-hydrated";
import { useInstruments } from "@/hooks/use-market-data";
import {
  BASE_CURRENCIES,
  CURRENCY_META,
  MARKET_LABELS,
  type BaseCurrency,
  type MarketKind,
} from "@/lib/api/types";
import { PREFERENCE_DEFAULTS, usePreferences } from "@/store/use-preferences";
import { useSynthetic } from "@/components/market/data-source";
import { cn } from "@/lib/utils";

/**
 * Settings, navigated rather than scrolled.
 *
 * It was one column of eight stacked sections — roughly 2,400px on a phone,
 * with the risk-profile comparison table buried in the middle of it. Ordering
 * by consequence was the right call and it only helps someone reading top to
 * bottom, which nobody does on a settings screen: they arrive knowing what
 * they came for and hunt for it.
 *
 * **One horizontal row of tabs, at every width.** The first cut of this gave
 * desktop a 224px sidebar on the macOS/SaaS-console reasoning that a settings
 * screen is where a persistent list of destinations belongs. That pattern
 * earns its column when the sections are deep or nested; these are eight short
 * labels with nothing under them, and eight labels fit across a page. So the
 * row is the layout, the sidebar's width goes back to the page, and the
 * section heading is simply always present instead of being hidden on mobile
 * because the chips already said it and shown on desktop because the sidebar
 * was too far away.
 *
 * **The tab lives in the URL.** A section has to be linkable: the notification
 * centre's warnings point at Alerts, the sign-in screen returns to Account, and
 * "change this" links elsewhere in the app should land on the row they mean
 * rather than the top of a long page.
 */

const MARKET_NOTES: Record<MarketKind, string> = {
  equity:
    "New York, London, Frankfurt, Paris, Tokyo, Hong Kong, Mumbai, Johannesburg, Cairo and Lagos.",
  crypto: "Bitcoin, Ethereum, Solana and the majors, priced around the clock.",
  fx: "The dollar, euro, yen, franc and commodity crosses, valued from the carry differential.",
};

const CURRENCY_OPTIONS = BASE_CURRENCIES.map((value) => ({
  value,
  label: value,
  ariaLabel: CURRENCY_META[value].label,
}));

export function SettingsScreen() {
  const hydrated = useHydrated();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = tabFromParam(params.get("tab"));

  const setRiskProfile = usePreferences((s) => s.setRiskProfile);
  const toggleMarket = usePreferences((s) => s.toggleMarket);
  const setBaseCurrency = usePreferences((s) => s.setBaseCurrency);

  const storedRiskProfile = usePreferences((s) => s.riskProfile);
  const storedMarkets = usePreferences((s) => s.markets);
  const storedCurrency = usePreferences((s) => s.baseCurrency);

  /**
   * Read through the defaults until hydration.
   *
   * `persist` rehydrates synchronously, so without this the first client
   * render already holds the user's real settings while the server's HTML
   * holds the defaults — a mismatch on every control here.
   */
  const riskProfile = hydrated ? storedRiskProfile : PREFERENCE_DEFAULTS.riskProfile;
  const markets = hydrated ? storedMarkets : PREFERENCE_DEFAULTS.markets;
  const baseCurrency = hydrated ? storedCurrency : PREFERENCE_DEFAULTS.baseCurrency;

  const instrumentsQuery = useInstruments();
  const synthetic = useSynthetic();

  /** How many instruments each toggle actually covers — said, not implied. */
  const counts = useMemo(() => {
    const tally: Record<MarketKind, number> = { equity: 0, crypto: 0, fx: 0 };
    for (const instrument of instrumentsQuery.data?.instruments ?? []) {
      tally[instrument.market] += 1;
    }
    return tally;
  }, [instrumentsQuery.data]);

  /**
   * The last market on can't be switched off.
   *
   * The store already refuses it, but a switch that silently springs back is
   * worse than one that won't move — the user reads it as a bug rather than a
   * rule.
   */
  const onlyOneMarket =
    (["equity", "crypto", "fx"] as const).filter((m) => markets[m]).length === 1;

  const go = (next: SettingsTab) => {
    // `replace`, not `push`: eight sections would otherwise fill the back
    // stack, and leaving settings would mean pressing back eight times.
    router.replace(next === "account" ? pathname : `${pathname}?tab=${next}`, {
      scroll: false,
    });
  };

  const { isAdmin } = useAdmin();
  const sections = visibleSections(isAdmin);
  // Falls back to Account when a non-admin lands on `?tab=admin` — the tab is
  // simply not one of theirs, which leaks nothing either way.
  const section = sections.find((s) => s.id === tab) ?? sections[0];

  return (
    <>
      <PageHeader
        title="Settings"
        actions={
          <>
            <DataSourceChip />
            <NotificationsButton />
          </>
        }
      />

      <PageBody className="pb-12">
        <SectionNav current={tab} sections={sections} onSelect={go} />

        {/* One measure, every width.
            A settings pane is the case decision 065 carves out: there is no
            "more" to give it — no second column of content that belongs
            beside a list of switches — so the width goes to the tab row above
            and the pane keeps a readable measure. A switch 1,400px from its
            label is worse than a narrow column. */}
        <div className="min-w-0 max-w-3xl">
          {/* The tab row is the visible title. A second "Account" 40px under
              the selected "Account" tab, with a lowercase tagline beneath it,
              was the same word twice before the first control — so the
              heading stays for assistive tech and nothing else. */}
          <h2 className="sr-only">{section.label}</h2>

          {/* 40px between blocks, not 32. Tightening it was the wrong half of
              the fix — the pane read as a wall because of the *text*, and taking
              space out while the paragraphs were still there made it denser
              rather than calmer. The copy is short now, so the air can come back. */}
          {tab === "account" && (
            <div className="space-y-10">
              <AccountSetting />
              <ProfileSettings />
            </div>
          )}

          {tab === "plan" && <PlanSetting />}

          {/* Its own tab, and only rendered for an admin — `visibleSections`
              already hides the chip, this is the matching half. Not a permission:
              every control inside would be refused by RLS anyway (ADR 0039). */}
          {tab === "admin" && isAdmin && <AdminPanels />}

          {tab === "advice" && (
            <section>
              <SettingRow
                label="Risk profile"
                description="Sets how much conviction a call needs before ember will surface it, how large a position it suggests, and which families of rules it leans on."
                layout="stack"
              >
                <RiskProfileSetting
                  value={riskProfile}
                  onChange={setRiskProfile}
                  bleed
                  className="mt-3.5"
                />
              </SettingRow>
            </section>
          )}

          {tab === "markets" && (
            <section>
              <SettingGroup>
                {(["equity", "crypto", "fx"] as const).map((market) => {
                  const on = markets[market];
                  const locked = on && onlyOneMarket;
                  const count = counts[market];

                  return (
                    <SettingRow
                      key={market}
                      label={MARKET_LABELS[market]}
                      description={
                        locked
                          ? "Keep at least one market on — everything in ember is a view of one."
                          : `${MARKET_NOTES[market]}${count > 0 ? ` ${count} instruments.` : ""}`
                      }
                      layout="inline"
                      control={
                        <Switch
                          checked={on}
                          disabled={locked}
                          onCheckedChange={() => toggleMarket(market)}
                          aria-label={`Follow ${MARKET_LABELS[market]}`}
                        />
                      }
                    />
                  );
                })}
              </SettingGroup>
              <p className="mt-2 px-1 text-micro text-stone">
                Turning a market off hides it from the watchlist, the market
                pulse and the signals feed. It doesn&apos;t change the
                engine — cross-sectional momentum still ranks against the
                whole universe.
              </p>
            </section>
          )}

          {tab === "money" && (
            <section>
              <SettingRow
                label="Base currency"
                description={`Every value, cost basis and P&L figure is converted to ${CURRENCY_META[baseCurrency].label} at today's rate. Instruments stay quoted in their own currency.`}
                layout="stack"
                control={
                  <Segmented
                    aria-label="Base currency"
                    value={baseCurrency}
                    onChange={(value) => setBaseCurrency(value as BaseCurrency)}
                    options={CURRENCY_OPTIONS}
                  />
                }
              />
              <p className="mt-2 px-1 text-micro text-stone">
                Realized P&amp;L is converted at today&apos;s rate rather than
                the rate on the trade date. Only the yen, franc and
                Canadian-dollar crosses are quoted in anything but dollars, so
                this is exact for 101 of the 110. The naira is the one rate
                ember cannot fetch — the European Central Bank does not
                publish it — so it is carried as a fixed figure.
              </p>
            </section>
          )}

          {tab === "alerts" && (
            <section>
              <AlertSettings />
              <p className="mt-2 px-1 text-micro text-stone">
                Both kinds fire while ember is open — in a tab, or from your
                home screen. Reaching you with it closed needs a server holding
                a subscription for you; the handlers are already in the service
                worker waiting for it. ember never alerts twice about the same
                thing, never about one you&apos;ve executed or dismissed, and
                never about a window that opened more than ten minutes ago. A
                warning about something you hold has no window to wait for, so
                it arrives on detection and repeats at most once a day until it
                clears.
              </p>
            </section>
          )}

          {tab === "appearance" && (
            <section>
              <SettingRow
                label="Theme"
                description="Dark is a separately calibrated palette, not an inversion. Matching your system is the default."
                layout="inline"
                control={<ThemeToggle />}
              />
            </section>
          )}

          {tab === "data" && (
            <div className="space-y-8">
              <section>
                <SectionHeader
                  title="Export and clear"
                  hint={hydrated ? "on this device" : undefined}
                />
                <DataSettings />
                {/* This paragraph said "nothing is sent anywhere" until phase
                    15, and that stopped being true the moment the risk engine
                    shipped. A privacy claim that has quietly expired is worse
                    than never having made one, so it is replaced rather than
                    softened — and it names exactly what goes and exactly what
                    doesn't. ADR 0025. */}
                <p className="mt-2 px-1 text-micro text-stone">
                  Your transaction log lives in this browser. Signed in, a copy
                  is kept on ember&apos;s server so it survives a cleared
                  browser and follows you to another device; signed out,
                  clearing your browser data clears ember with it — which is
                  the reason export exists.
                </p>
                <p className="mt-1.5 px-1 text-micro text-stone">
                  One exception, and it applies whether or not you have an
                  account: to warn you about a position that has turned,
                  ember&rsquo;s server needs to know you hold it. When it looks
                  for findings it sends four derived numbers per open
                  position — the symbol, the quantity, your average cost and
                  the date you opened it. Not your trades, not your fees, not
                  your accounts, not anything you&rsquo;ve closed. Nothing is
                  stored at the other end. This happens whenever your home
                  screen loads, and while alerts are watching.
                </p>
              </section>

              <section>
                <SectionHeader title="Danger" hint="no undo past this point" />
                <div className="mt-4">
                  <DeleteAccount />
                </div>
              </section>
            </div>
          )}

          {tab === "about" && (
            <section>
              <SettingGroup>
                <SettingRow
                  label="Where the prices come from"
                  description={
                    !synthetic
                      ? "Equities and their filed accounts from Yahoo and Finnhub, crypto from CoinGecko, exchange rates from the European Central Bank. Policy rates, the macro calendar and realised capitalisation are still modelled."
                      : "Prices, fundamentals and on-chain figures are generated. The engine, the backtest and the track record are real — they're just running on modelled data until a feed is connected."
                  }
                  control={<DataSourceChip />}
                />
                <SettingRow
                  label="How the signals are built"
                  description="Every strategy, with its citation, weight and current reading — generated from the engine, so it can't drift from what runs."
                  control={<AboutLink href="/signals/methodology">Methodology</AboutLink>}
                />
                <SettingRow
                  label="Whether any of it worked"
                  description="A walk-forward backtest over the same engine, including the losing calls. Nothing on that page is authored."
                  control={<AboutLink href="/signals/track-record">Track record</AboutLink>}
                />
                <SettingRow
                  label="Run through setup again"
                  description="Revisits the three-step introduction. Nothing is cleared."
                  control={<AboutLink href="/onboarding?replay=1">Replay</AboutLink>}
                />
              </SettingGroup>

              <p className="mt-6 px-1 text-micro text-stone">
                ember gives information, not financial advice. Every rule it
                applies is published and cited, the track record is computed
                rather than authored, and none of it accounts for your
                circumstances, your tax position or your timeline. What you do
                with it is yours.
              </p>
            </section>
          )}
        </div>
      </PageBody>
    </>
  );
}

/**
 * The section list — one horizontal row of tabs, at every width.
 *
 * It was a scrolling chip row on mobile and a 224px sidebar on desktop, and
 * the sidebar was the wrong instinct: it borrowed the macOS/SaaS-console
 * pattern for a pane with eight short sections and no hierarchy under them,
 * and it spent a whole column establishing that. Eight labels fit across a
 * desktop page comfortably, so the row *is* the desktop layout — the width
 * that was going to the sidebar goes to nothing, which on a settings screen is
 * the right answer.
 *
 * One layout rather than two also removes the thing the split kept producing:
 * a section heading that had to be hidden on mobile because the chips already
 * said it, and shown on desktop because the sidebar's label was too far away.
 * Now the row scrolls where it must and the heading is simply always there.
 */
function SectionNav({
  current,
  sections,
  onSelect,
}: {
  current: SettingsTab;
  sections: SettingsSection[];
  onSelect: (tab: SettingsTab) => void;
}) {
  const rowRef = useRef<HTMLUListElement>(null);

  /**
   * **The active tab is brought into view**, and the row says when it scrolls.
   *
   * On a phone ten tabs do not fit, so opening `?tab=about` or `?tab=admin` —
   * from a notification, a warning's action, the `/admin` redirect — landed with
   * the active tab off the right edge. Nothing on screen looked selected, which
   * reads as the link having gone to the wrong place.
   *
   * Scrolled by hand rather than with `scrollIntoView`, which also scrolls every
   * scrollable ancestor and would move the page vertically to reach a row that
   * is already on screen.
   */
  useEffect(() => {
    const row = rowRef.current;
    const tab = row?.querySelector<HTMLElement>("[aria-current='page']");
    if (!row || !tab) return;
    // Measured against the row's own box, in the row's scroll coordinates —
    // `offsetLeft` is relative to whatever positioned ancestor happens to exist.
    const left = tab.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft;
    const right = left + tab.offsetWidth;
    const inset = 24;
    if (left < row.scrollLeft + inset) {
      row.scrollTo({ left: Math.max(0, left - inset) });
    } else if (right > row.scrollLeft + row.clientWidth - inset) {
      row.scrollTo({ left: right - row.clientWidth + inset });
    }
  }, [current]);

  /**
   * An edge fades where there is more to scroll to — the only sign the row
   * scrolls at all, with the scrollbar hidden. Written straight to a data
   * attribute rather than through state: it changes on every scroll event, and
   * nothing but the CSS below reads it.
   */
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const mark = () => {
      const start = row.scrollLeft > 1;
      const end = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
      row.dataset.fade = start && end ? "both" : start ? "start" : end ? "end" : "none";
    };
    mark();
    row.addEventListener("scroll", mark, { passive: true });
    const observer = new ResizeObserver(mark);
    observer.observe(row);
    return () => {
      row.removeEventListener("scroll", mark);
      observer.disconnect();
    };
  }, []);

  return (
    /**
     * A hairline under the whole row, and the active tab sits on it.
     *
     * It was a row of tinted pills, borrowed from the main navigation (decision
     * 035). That vocabulary is right where the nav is the only thing on its own
     * surface and wrong here: eight filled capsules across the top of a settings
     * pane read as eight buttons competing with the content, and the rule they
     * were meant to sit above did not exist.
     *
     * The underline is the standard tab affordance for a reason — it says "these
     * are views of one thing" rather than "these are actions". The main nav keeps
     * its pill, which is the point of using a different treatment here.
     */
    <nav aria-label="Settings sections" className="mb-7 border-b border-line">
      {/* `-mx-4` so the first and last tabs sit against the page edge as they
          scroll past, rather than appearing to stop 16px short of it. Above the
          point where all of them fit, `overflow-x-auto` is inert. */}
      <ul
        ref={rowRef}
        className={cn(
          "-mx-4 flex gap-1 overflow-x-auto px-4 min-[360px]:-mx-5 min-[360px]:px-5",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "data-[fade=end]:[mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]",
          "data-[fade=start]:[mask-image:linear-gradient(to_left,black_calc(100%-2.5rem),transparent)]",
          "data-[fade=both]:[mask-image:linear-gradient(to_right,transparent,black_2.5rem,black_calc(100%-2.5rem),transparent)]",
          "md:-mx-8 md:px-8 xl:-mx-12 xl:px-12",
        )}
      >
        {sections.map((section) => {
          const active = section.id === current;
          const Icon = section.icon;
          return (
            <li key={section.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect(section.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "tap-target relative flex w-full items-center gap-2 px-3 pt-2 pb-2.5",
                  "text-caption font-medium whitespace-nowrap transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  active ? "text-ink" : "text-stone hover:text-graphite",
                )}
              >
                <Icon
                  className="size-4 shrink-0"
                  weight={active ? "fill" : "regular"}
                />
                {section.label}

                {/* Sits *on* the row's hairline rather than under the label, so
                    the two read as one rule with a lit segment. `-bottom-px`
                    covers the border rather than doubling it. */}
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function AboutLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex rounded-sm text-caption font-medium text-brand-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {children}
    </Link>
  );
}
