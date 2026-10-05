"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageBody } from "@/components/common/page-body";
import { CaretRight } from "@/components/common/icon";
import { Segmented } from "@/components/common/segmented";
import { DataSourceChip } from "@/components/market/data-source-chip";
import { NotificationsButton } from "@/components/notifications/notifications-button";
import dynamic from "next/dynamic";

// Only an admin ever opens this tab; nobody else should download the composer,
// the codes panel and the suspension tools with their settings page.
const AdminPanels = dynamic(
  () => import("@/components/admin/admin-panels").then((m) => m.AdminPanels),
  { ssr: false },
);
import { useAdmin } from "@/hooks/use-admin";
import { AccountSetting } from "@/components/settings/account-setting";
import { AlertSettings } from "@/components/settings/alert-settings";
import { DataSettings } from "@/components/settings/data-settings";
import { PlanSetting } from "@/components/plan/plan-setting";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { RiskProfileSetting } from "@/components/settings/risk-profile-setting";
import {
  SETTINGS_GROUP_LABELS,
  tabFromParam,
  visibleSections,
  type SettingsGroupId,
  type SettingsSection,
  type SettingsTab,
} from "@/components/settings/settings-nav";
import {
  SettingGroup,
  SettingRow,
  SettingsPaneHeader,
} from "@/components/settings/setting-row";
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
  fx: "Major currency pairs: the dollar, euro, yen, franc and more.",
};

const CURRENCY_OPTIONS = BASE_CURRENCIES.map((value) => ({
  value,
  label: value,
  ariaLabel: CURRENCY_META[value].label,
}));

export function SettingsScreen() {
  const hydrated = useHydrated();
  const params = useSearchParams();
  const rawTab = params.get("tab");
  const tab = tabFromParam(rawTab);

  // `?tab=alerts` predates the merge and is in notifications, emails and
  // broadcasts already sent; it becomes Preferences at the alerts group. A hash
  // rather than `scrollIntoView`, which the router's own scroll reset undid.
  const router = useRouter();
  useEffect(() => {
    if (rawTab === "alerts") router.replace("/settings?tab=preferences#alerts");
  }, [rawTab, router]);

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

  const { isAdmin } = useAdmin();
  const sections = visibleSections(isAdmin);
  // Falls back to Profile when a non-admin lands on `?tab=admin` — the tab is
  // simply not one of theirs, which leaks nothing either way.
  const section = sections.find((s) => s.id === tab) ?? sections[0];
  const current = section.id;

  /**
   * **Two layouts, chosen by CSS rather than by script** (decision 284).
   *
   * A desktop gets the sidebar every settings reference uses — GitHub, Vercel,
   * Linear, Stripe, macOS — beside a pane with its own title. A phone gets
   * the iOS pattern: a list of sections, each opening its own page with a way
   * back. The horizontal tab row that preceded both (decision 127) hid half its
   * tabs off the right edge of a phone and gave a desktop pane no title at all.
   *
   * Which one shows is decided by a media query and the `tab` parameter, both
   * of which the server knows the shape of, so nothing here can disagree at
   * hydration.
   */
  const atIndex = tab === null;

  return (
    <>
      {/* A phone inside a section reads that section's name, with a way back
          to the list; everywhere else the header is "Settings". */}
      <PageHeader
        title="Settings"
        className={cn(!atIndex && "max-lg:hidden")}
        actions={
          <>
            <DataSourceChip />
            <NotificationsButton />
          </>
        }
      />
      {!atIndex && (
        <PageHeader title={section.label} back="/settings" className="lg:hidden" />
      )}

      <PageBody className="pb-12">
        <div className="lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-12 xl:gap-16">
          <SettingsSidebar current={current} sections={sections} />

          {atIndex && <SettingsIndex sections={sections} />}

          {/* One measure, every width. A settings pane has no "more" to give
              (decision 065): a switch 1,400px from its label is worse than a
              narrow column. */}
          <div className={cn("min-w-0 max-w-2xl", atIndex && "max-lg:hidden")}>
            <SettingsPaneHeader title={section.label} description={section.description} />

            {/* 40px between groups, 12px from a group's heading to its rows. */}
            <div className="space-y-10">
              {current === "account" && (
                <>
                  <AccountSetting />
                  <ProfileSettings />
                </>
              )}

              {current === "plan" && <PlanSetting />}

              {/* Only rendered for an admin — `visibleSections` already hides the
                  entry, this is the matching half. Not a permission: every
                  control inside would be refused by RLS anyway (ADR 0039). */}
              {current === "admin" && isAdmin && <AdminPanels />}

              {current === "advice" && (
                <SettingGroup
                  title="Risk profile"
                  description="Also sets how large a position ember suggests."
                  boxed={false}
                >
                  <RiskProfileSetting value={riskProfile} onChange={setRiskProfile} />
                </SettingGroup>
              )}

              {current === "preferences" && (
                <>
                  <SettingGroup title="Markets" description="What ember watches and advises on.">
                    {(["equity", "crypto", "fx"] as const).map((market) => {
                      const on = markets[market];
                      const locked = on && onlyOneMarket;
                      // Not before hydration: a warm instruments cache can answer
                      // before React reaches this row, and the server's HTML has
                      // no count — decision 250's mismatch, on this screen.
                      const count = hydrated ? counts[market] : 0;

                      return (
                        <SettingRow
                          key={market}
                          label={MARKET_LABELS[market]}
                          description={
                            locked
                              ? "Keep at least one market on."
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

                  {/* Alerts were their own tab; they sit with the markets they
                      watch (decision 286). `?tab=alerts` lands here. */}
                  <AlertSettings />

                  <SettingGroup
                    title="Currency"
                    footer={
                      <p>
                        Realized P&amp;L uses today&apos;s exchange rate, not the rate on the
                        day you traded.
                      </p>
                    }
                  >
                    <SettingRow
                      label="Base currency"
                      description="Used for totals and P&L. Prices stay in their own currency."
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
                  </SettingGroup>

                  <SettingGroup title="Appearance">
                    <SettingRow label="Theme" layout="inline" control={<ThemeToggle />} />
                  </SettingGroup>
                </>
              )}

              {current === "data" && <DataSettings />}

              {current === "about" && (
                <SettingGroup
                  footer={
                    <p>
                      ember gives information, not financial advice. It doesn&apos;t account
                      for your circumstances, tax position or timeline.
                    </p>
                  }
                >
                  <SettingRow
                    label="Where the prices come from"
                    description={
                      !synthetic
                        ? "Stocks from Yahoo and Finnhub, crypto from CoinGecko, exchange rates from the European Central Bank. Central-bank rates and the economic calendar are modelled."
                        : "Prices and company data are simulated. The engine and track record are real, running on that simulated data."
                    }
                    control={<DataSourceChip />}
                  />
                  <SettingRow
                    label="How the signals are built"
                    description="Every rule ember uses, with its source and weight."
                    control={<AboutLink href="/signals/methodology">Methodology</AboutLink>}
                  />
                  <SettingRow
                    label="How past calls performed"
                    description="Every call the engine has made in testing, losses included."
                    control={<AboutLink href="/signals/track-record">Track record</AboutLink>}
                  />
                  <SettingRow
                    label="How alerts behave"
                    description="In-app alerts arrive while ember is open; push reaches you when it's closed. You're never alerted twice about the same thing or about a call you've handled. Warnings about what you hold repeat at most once a day."
                  />
                  <SettingRow
                    label="Run through setup again"
                    description="Your data isn't affected."
                    control={<AboutLink href="/onboarding?replay=1">Replay</AboutLink>}
                  />
                </SettingGroup>
              )}
            </div>
          </div>
        </div>
      </PageBody>
    </>
  );
}

/** Sections in their groups, in the order the sidebar and the index list them. */
function grouped(sections: SettingsSection[]): [SettingsGroupId, SettingsSection[]][] {
  const order: SettingsGroupId[] = ["account", "app", "admin"];
  return order
    .map((group) => [group, sections.filter((s) => s.group === group)] as [SettingsGroupId, SettingsSection[]])
    .filter(([, items]) => items.length > 0);
}

/**
 * The desktop sidebar: grouped, sticky, and one pane at a time beside it.
 *
 * Links rather than buttons, so a section opens in a new tab and reads as a
 * place. `replace`, so eight sections do not fill the back stack.
 */
function SettingsSidebar({
  current,
  sections,
}: {
  current: SettingsTab;
  sections: SettingsSection[];
}) {
  return (
    <nav
      aria-label="Settings sections"
      className="hidden lg:block"
    >
      <div className="sticky top-[calc(var(--bar-h,0px)+6.5rem)] space-y-6">
        {grouped(sections).map(([group, items]) => (
          <div key={group}>
            {SETTINGS_GROUP_LABELS[group] && (
              <p className="mb-1.5 px-3 text-micro font-medium text-stone">
                {SETTINGS_GROUP_LABELS[group]}
              </p>
            )}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = item.id === current;
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <Link
                      href={`/settings?tab=${item.id}`}
                      replace
                      scroll={false}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-10 items-center gap-2.5 rounded-lg px-3 text-caption outline-none transition-colors",
                        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                        active
                          ? "bg-surface-2 font-medium text-ink"
                          : "text-stone hover:bg-surface-2 hover:text-graphite",
                      )}
                    >
                      <Icon size={18} weight={active ? "fill" : "regular"} className="shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

/**
 * The phone's settings home: every section, grouped, each opening its own page.
 *
 * A push rather than a replace, so the system back gesture returns here.
 */
function SettingsIndex({ sections }: { sections: SettingsSection[] }) {
  return (
    <nav aria-label="Settings sections" className="space-y-8 lg:hidden">
      {grouped(sections).map(([group, items]) => (
        <SettingGroup key={group} title={SETTINGS_GROUP_LABELS[group] ?? undefined} heading="h2">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={`/settings?tab=${item.id}`}
                className={cn(
                  "flex items-center gap-3.5 px-4 py-3.5 outline-none transition-colors",
                  "active:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                )}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-graphite">
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-caption font-medium text-ink">{item.label}</span>
                  <span className="mt-0.5 block text-micro text-pretty text-stone">
                    {item.description}
                  </span>
                </span>
                <CaretRight className="size-4 shrink-0 text-stone" />
              </Link>
            );
          })}
        </SettingGroup>
      ))}
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
