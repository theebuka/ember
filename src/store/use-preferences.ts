"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BaseCurrency, MarketKind, RiskProfile } from "@/lib/api/types";
import { stampOnChange } from "@/lib/sync/stamp";

interface NotificationPrefs {
  /** Fire when a recommended execution window opens. */
  windowOpen: boolean;
  /**
   * Fire when something you hold turns against you.
   *
   * Separate from `windowOpen` rather than folded into it, because they are
   * genuinely different requests. Someone can reasonably want to be told the
   * moment a stop is breached and never want to be pitched a new idea; the
   * reverse is rarer but just as coherent. Defaulted on — a user who has
   * enabled notifications at all has asked to be told when something is going
   * wrong, and loss prevention is the half of the product that costs money to
   * miss.
   */
  riskAlerts: boolean;
  /** Once-a-day summary of what changed. */
  dailyDigest: boolean;
  /** User-set price levels, distinct from advice. */
  priceAlerts: boolean;
}

interface PreferencesState {
  riskProfile: RiskProfile;
  markets: Record<MarketKind, boolean>;
  baseCurrency: BaseCurrency;
  notifications: NotificationPrefs;
  /** Desktop side panel collapsed to an icon rail. */
  sidebarCollapsed: boolean;
  hasOnboarded: boolean;

  setRiskProfile: (v: RiskProfile) => void;
  toggleMarket: (m: MarketKind) => void;
  setBaseCurrency: (v: BaseCurrency) => void;
  setNotification: (k: keyof NotificationPrefs, v: boolean) => void;
  setSidebarCollapsed: (v: boolean) => void;
  completeOnboarding: () => void;
  reset: () => void;
}

/**
 * Exported because the server renders with exactly these.
 *
 * `persist` rehydrates from `localStorage` synchronously while the store is
 * being created, so the *first* client render already holds the user's real
 * values while the server's HTML holds these — which is a hydration mismatch
 * on any screen that renders a preference directly. Settings reads through
 * `hydrated ? stored : PREFERENCE_DEFAULTS` so both sides agree for the one
 * frame it matters, then the real values arrive.
 */
export const PREFERENCE_DEFAULTS = {
  riskProfile: "balanced" as RiskProfile,
  markets: { equity: true, crypto: true, fx: true },
  baseCurrency: "USD" as BaseCurrency,
  notifications: {
    windowOpen: true,
    riskAlerts: true,
    dailyDigest: false,
    priceAlerts: false,
  },
  sidebarCollapsed: false,
  hasOnboarded: false,
};

const DEFAULTS = PREFERENCE_DEFAULTS;

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      setRiskProfile: (riskProfile) => set({ riskProfile }),

      toggleMarket: (m) =>
        set((s) => {
          const next = { ...s.markets, [m]: !s.markets[m] };
          // Turning off the last market would leave every list empty with no
          // way back except settings. Keep at least one on.
          if (!Object.values(next).some(Boolean)) return s;
          return { markets: next };
        }),

      setBaseCurrency: (baseCurrency) => set({ baseCurrency }),

      setNotification: (k, v) =>
        set((s) => ({ notifications: { ...s.notifications, [k]: v } })),

      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

      completeOnboarding: () => set({ hasOnboarded: true }),

      reset: () => set(DEFAULTS),
    }),
    {
      name: "ember:preferences",
      version: 4,
      /**
       * v3 added `notifications.riskAlerts`; v4 moved `displayName` out to
       * `use-profile`, which adopts it on first load rather than losing it.
       *
       * Unlike the two alert stores, this one is migrated rather than reset —
       * a persisted preference is a choice the user made, and throwing away
       * their risk profile and base currency to add a switch would be
       * indefensible. The new key is filled from the defaults; everything
       * stored keeps its value.
       */
      migrate: (persisted) => ({
        ...DEFAULTS,
        ...(persisted as Partial<PreferencesState>),
        notifications: {
          ...DEFAULTS.notifications,
          ...((persisted as Partial<PreferencesState>)?.notifications ?? {}),
        },
      }),
    },
  ),
);

// Records when this store was last written, for the sync's merge. Beside the
// persisted payload rather than inside it — see `lib/sync/stamp.ts`.
stampOnChange(usePreferences, "ember:preferences");

/** The markets the user has switched on, in display order. */
export function useEnabledMarkets(): MarketKind[] {
  const markets = usePreferences((s) => s.markets);
  return (["equity", "crypto", "fx"] as const).filter((m) => markets[m]);
}
