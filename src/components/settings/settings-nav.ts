import {
  Bell,
  BookOpen,
  Compass,
  Crosshair,
  Moon,
  ShieldWarning,
  Sparkle,
  UserCircle,
  Wallet,
  Warning,
  type IconComponent,
} from "@/components/common/icon";

/**
 * Settings, broken into sections that are navigated rather than scrolled.
 *
 * It was one column of eight stacked sections, about 2,400px tall on a phone,
 * with the risk-profile comparison table in the middle of it. Ordering by
 * consequence — which it did, and which was right — only helps someone who
 * reads top to bottom, and nobody reads a settings screen top to bottom. They
 * arrive knowing what they came for.
 *
 * The order is unchanged, because it is still the answer to "what should I
 * look at first if I don't know". Account leads now: it is the section with
 * something to *do* in it for a new user, and it is where the app's identity
 * lives.
 *
 * **`Your data` and `Danger` are separate, and that is deliberate.** Export
 * and clear-your-transactions are ordinary, reversible, everyday operations.
 * Deleting an account is none of those, and putting them under one heading
 * makes the irreversible one look like a peer of the reversible ones.
 */
export type SettingsTab =
  | "account"
  | "plan"
  | "admin"
  | "advice"
  | "markets"
  | "money"
  | "alerts"
  | "appearance"
  | "data"
  | "about";

export interface SettingsSection {
  id: SettingsTab;
  label: string;
  /** What this section is for, in the register of the section headers it replaces. */
  hint: string;
  icon: IconComponent;
  /**
   * Only rendered for an admin. Not a permission — the refusal lives in RLS
   * (ADR 0039) — just the reason not to show a tab to the people it is useless
   * for, which is everybody but one.
   */
  adminOnly?: boolean;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "account", label: "Account", hint: "who you are", icon: UserCircle },
  { id: "plan", label: "Plan", hint: "what you get", icon: Sparkle },
  { id: "advice", label: "Advice", hint: "what ember recommends", icon: Crosshair },
  { id: "markets", label: "Markets", hint: "what ember watches", icon: Compass },
  { id: "money", label: "Money", hint: "how figures are shown", icon: Wallet },
  { id: "alerts", label: "Alerts", hint: "while ember is open", icon: Bell },
  { id: "appearance", label: "Appearance", hint: "how it looks", icon: Moon },
  { id: "data", label: "Your data", hint: "export, clear, delete", icon: Warning },
  { id: "about", label: "About", hint: "how any of it works", icon: BookOpen },
  {
    id: "admin",
    label: "Admin",
    hint: "broadcasts and accounts",
    icon: ShieldWarning,
    adminOnly: true,
  },
];

const IDS = new Set<string>(SETTINGS_SECTIONS.map((s) => s.id));

/**
 * The sections a given reader can see. `admin` is dropped for everybody but the
 * one account that has a row in `admins`.
 */
export function visibleSections(isAdmin: boolean): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((section) => !section.adminOnly || isAdmin);
}

/**
 * The tab from the URL, defaulting to Account.
 *
 * In the query string rather than in component state so a section is
 * linkable — the notification centre's warnings point at alerts, the sign-in
 * screen points back at the account tab, and "change this" links elsewhere in
 * the app can land on the row they mean rather than the top of a long page.
 */
export function tabFromParam(value: string | null): SettingsTab {
  return value !== null && IDS.has(value) ? (value as SettingsTab) : "account";
}
