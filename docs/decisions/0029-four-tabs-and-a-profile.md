# 0029 — Four tabs and a profile

**Status:** accepted · phase 13, closed in phase 17

## Context

v1 shipped five labelled tabs: Home, Advice, Portfolio, Watchlist, Settings.
Every one of them was a screen someone had built, which is the usual way a tab
bar gets designed and the reason it usually describes the codebase rather than
the product.

Two of the five were wrong on inspection.

**Settings as a peer of Home** claims configuration is a main surface. It is
the single loudest "this was assembled from a framework template" signal in a
mobile app, and not one of the references the brief names — Cash App, Chime,
Phantom, Family — does it. A gear in a tab bar is an admin panel.

**Watchlist as a destination** contradicted the repositioning. Under a browser
of engine output, a watchlist is a place you go to look at things. Under an
alpha finder it is an *input*: the set of instruments you have told the engine
to care about, in exactly the same way your holdings are. It belongs beside
them, not in a bar next to them.

## Decision

**Four icon-only tabs — Home, Signals, Portfolio, News — and the profile
control carries Settings.**

- Icon-only, filled when active and outline when not, which is a distinction
  Phosphor can express and Lucide cannot (decision 062). Labels come off
  because four large targets with a clear active state do not need them, and
  the labels were what forced the icons small.
- **Watchlist folds into Portfolio as a segment**: Holdings / Watching /
  Activity. The segment lives in the URL (`?view=watching`), which is what lets
  the old route redirect to the right place rather than to a tab's default.
- **Settings moves behind the profile control** — bottom of the rail on
  desktop, top-right of Home on mobile. It is one tap from the place you start,
  and it has stopped claiming to be a section of the product.
- `/advice` → `/signals` and `/watchlist` → `/portfolio?view=watching`, both
  **permanent**. Those paths are in installed PWA shortcuts and in notification
  payloads already sitting in OS queues; a redirect is the only thing that
  keeps a two-week-old notification working.

**Four is the ceiling, and phase 16 spent the last slot.** News was the fourth.
Anything after it has to displace something rather than be added.

## Consequences

The audit script had to grow: Watching and Activity are segments of one route,
and axe only sees what is mounted, so auditing `/portfolio` alone left two
thirds of that screen unchecked. All three are enumerated in `ROUTES` now, in
both `audit.mjs` and `capture.mjs`.

No tab lights up on an asset page. It sits outside the four sections and is
reachable from three of them, so highlighting one would be a guess; the
header's back control is how you leave. Recorded in §8 rather than fixed,
because the honest answer is that it belongs to no section.

## Alternatives considered

**Five tabs with Settings kept.** The status quo, and the thing every framework
starter produces. Rejected above.

**A hamburger or an overflow menu for the extras.** Moves Settings out of the
bar at the cost of a control that hides an unknown number of things. The
profile control hides exactly one destination and looks like what it is.

**Labels under the icons.** The safer choice, and the reason to reject it is
measurable rather than aesthetic: at 375px, five labelled tabs leave each
target around 64px wide with the label doing the work, which forces a 20px
icon. Four unlabelled tabs in a floating capsule give a much larger target and
let the icon be the whole affordance. The active pill (decision 035) is what
makes that legible without text.

**Keeping Watchlist as a tab and adding News as a fifth.** Would have meant six
with Settings, or five with the profile control. Six is past the point where a
tab bar is a menu. It also leaves the watchlist claiming to be a destination
when the product's argument is that it is an input.
