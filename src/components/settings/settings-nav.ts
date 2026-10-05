import {
  BookOpen,
  Crosshair,
  Database,
  ShieldWarning,
  SlidersHorizontal,
  Sparkle,
  UserCircle,
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
  | "preferences"
  | "data"
  | "about";

export type SettingsGroupId = "account" | "app" | "admin";

/**
 * The headings the sections sit under, in the sidebar and in the phone's index.
 * Admin has none: one item under a heading repeating its name says it twice.
 */
export const SETTINGS_GROUP_LABELS: Record<SettingsGroupId, string | null> = {
  account: "Account",
  app: "App",
  admin: null,
};

export interface SettingsSection {
  id: SettingsTab;
  label: string;
  /** One line under the pane's title, and under the label in the phone's index. */
  description: string;
  icon: IconComponent;
  group: SettingsGroupId;
  /**
   * Only rendered for an admin. Not a permission — the refusal lives in RLS
   * (ADR 0039) — just the reason not to show a tab to the people it is useless
   * for, which is everybody but one.
   */
  adminOnly?: boolean;
}

/**
 * Grouped the way every settings reference groups them: what is yours (who you
 * are, what you pay for, what ember holds), then how the app behaves. `Your
 * data` moved up beside Profile and Plan because it is about the account, not
 * the app. The `account` id stays so every existing link still lands; the label
 * is Profile, because "Account" is now the heading above it.
 */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "account",
    label: "Profile",
    description: "Sign-in, sync, and the name ember greets you by.",
    icon: UserCircle,
    group: "account",
  },
  {
    id: "plan",
    label: "Plan",
    description: "What your plan includes, and redeeming a code.",
    icon: Sparkle,
    group: "account",
  },
  {
    id: "data",
    label: "Your data",
    description: "Export, clear or delete what ember holds.",
    icon: Database,
    group: "account",
  },
  {
    id: "advice",
    label: "Advice",
    description: "How sure ember must be before it recommends a trade.",
    icon: Crosshair,
    group: "app",
  },
  // Markets, Money and Appearance were a tab each, holding five controls
  // between them; Alerts followed (decision 286). One tab of short groups.
  {
    id: "preferences",
    label: "Preferences",
    description: "Markets, alerts, currency and theme.",
    icon: SlidersHorizontal,
    group: "app",
  },
  {
    id: "about",
    label: "About",
    description: "Where prices come from and how ember works.",
    icon: BookOpen,
    group: "app",
  },
  {
    id: "admin",
    label: "Admin",
    description: "Broadcasts, codes, accounts and pricing.",
    icon: ShieldWarning,
    group: "admin",
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
 * The tab from the URL. `null` when there is none: a phone shows the index of
 * sections then, and a desktop shows Profile beside the sidebar.
 *
 * In the query string rather than in component state so a section is
 * linkable — the notification centre's warnings point at alerts, the sign-in
 * screen points back at the account tab, and "change this" links elsewhere in
 * the app can land on the row they mean rather than the top of a long page.
 */
export function tabFromParam(value: string | null): SettingsTab | null {
  if (value === null) return null;
  if (value !== null && value in MERGED) return MERGED[value];
  return IDS.has(value) ? (value as SettingsTab) : "account";
}

/** Tabs that were folded into another, so an old link still lands on its row. */
const MERGED: Record<string, SettingsTab> = {
  markets: "preferences",
  money: "preferences",
  appearance: "preferences",
  alerts: "preferences",
};
