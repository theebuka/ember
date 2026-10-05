import {
  Crosshair,
  GearSix,
  House,
  Newspaper,
  Wallet,
  type IconComponent,
} from "@/components/common/icon";

export type NavChild = { href: string; label: string };

export type NavItem = {
  href: string;
  /**
   * Not rendered in the bar — the bar is icons only. This is the accessible
   * name, the desktop rail's label, and the command menu's search text.
   */
  label: string;
  icon: IconComponent;
  /**
   * Secondary destinations. Shown nested in the desktop side panel, where
   * there's room; reachable from within the section on mobile.
   */
  children?: NavChild[];
};

/**
 * Three destinations today, four when News lands. Settings is not one of them.
 *
 * v1 had five: Home, Portfolio, Watchlist, Advice, Settings. Three changes.
 *
 * **Settings left the bar.** A gear as a peer of the product's main surfaces
 * claims the app has five equally important places, one of which is
 * configuration. None of the references in this category do that — Cash App
 * and Chime both put it behind a portrait in the top corner — and an icon-only
 * bar ending in a gear reads as an admin panel. It lives in the profile
 * control now.
 *
 * **Watchlist folded into Portfolio.** Under an alpha-finder framing your
 * watchlist is an *input to the engine*, not a destination: it and your
 * holdings are the two lists that decide what ember watches for you. They
 * belong on one screen as segments — Holdings / Watching / Activity.
 *
 * **Advice became Signals.** "Advice" is something you go and read; "signals"
 * are things that arrive. The route moved with the name, with redirects.
 *
 * **News is fourth, and it is the last one.** The slot was held empty through
 * phases 13–15 rather than filled with a coming-soon page: "every screen is
 * real; nothing links to a stub" is a standing rule, and a nav item pointing
 * at nothing is the most visible way there is to break it. It landed in phase
 * 16 with a real screen behind it.
 *
 * **Settings came back as the fifth, at the user's direction** (decision 283).
 * The argument above held for an icon-only bar ending in a gear; the bar is
 * labelled now (decision 265), and on a phone the profile control lived only in
 * Home's header, so every other screen was a scroll to the top and a tab away
 * from settings. It is the same destination the profile control opens, and it
 * sits last, after the four product surfaces.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: House },
  {
    href: "/signals",
    label: "Signals",
    icon: Crosshair,
    children: [
      { href: "/signals/track-record", label: "Track record" },
      { href: "/signals/methodology", label: "Methodology" },
    ],
  },
  { href: "/portfolio", label: "Portfolio", icon: Wallet },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/settings", label: "Settings", icon: GearSix },
];

/** Whether a nav destination is the one currently being viewed. */
export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * Chrome-free routes — these own the whole viewport.
 *
 * `/welcome` is the post-sign-in personalisation flow, and it is bare for the
 * same reason onboarding is: a bottom nav under a two-question setup invites
 * you to leave halfway through something that takes twenty seconds, and the
 * shell's header would sit above a screen that already has its own.
 *
 * `/unsubscribe` joins them, and it arrived here through a failed audit rather
 * than a design review. It shipped in phase 26 rendering its own `<main>` inside
 * the shell's, which is two `main` landmarks and three axe violations — invisible
 * until phase 27 added the route to `audit.mjs`, because a screen the route list
 * never visits is a screen nobody has checked. The reasoning is the same as the
 * other two anyway: it is reached from an email by somebody who may have no
 * session, and offering them a bottom nav to a product they are leaving is not a
 * navigation, it is a sales pitch on the way out.
 */
export function isBareRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/welcome") ||
    pathname.startsWith("/unsubscribe") ||
    // The checkout's return page: one job, and nothing to navigate to until it's done.
    pathname.startsWith("/pro/")
  );
}
