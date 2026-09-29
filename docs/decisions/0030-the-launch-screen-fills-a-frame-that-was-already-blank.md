# 0030 — The launch screen fills a frame that was already blank

**Status:** accepted · phase 18

## Context

A splash screen is usually a bad idea on the web. The native apps that have one
— the references here are Airbnb and Chime — have it because a cold process
launch takes time the OS has to fill. A web app that adds one is normally
inserting a delay so the brand can have a moment, on a product that publishes
its own load times.

There is one exception on this codebase, and it is exact.

`/onboarding` reads `useSearchParams`. That opts a client component out of
static rendering unless it sits behind a `Suspense` boundary, so the HTML
prerendered for the route is the **fallback**, not the screen. The fallback
was:

```tsx
<Suspense fallback={<div className="min-h-dvh bg-ground" />}>
```

An empty white rectangle, held for exactly as long as hydration takes, and it
is the first thing every first-time user of this app has ever seen.

The installed-app case is worse and has a different cause. Android composes a
launch screen from the manifest's `background_color` and icon. **Safari will
not** — an installed PWA opens on white unless it is handed a bitmap matching
the device's resolution exactly, and ember shipped none. So the iOS launch
sequence was white, then white, then the app.

## Decision

**The splash goes in the frame that was already dead, and nowhere else.**

- The `Suspense` fallback for `/onboarding` *is* the splash. It adds no time:
  it is the paint that was already happening, finally saying something.
- `OnboardingScreen` renders its own copy on mount and fades it, so the
  handover is a dissolve rather than a cut from near-black to white. It stops
  taking pointer events the instant the fade begins, so it is not a minimum
  display time and a fast user loses nothing.
- Not on `?replay=1`. Someone who opened setup from settings is already inside
  the app; a launch screen there is a brand interruption mid-session.
- **Not on Home.** A returning user's launch is covered by the OS-level frame
  below, and putting an overlay on the app's own start route would be exactly
  the artificial delay this ADR exists to avoid.
- `scripts/generate-icons.mjs` now also emits ten iOS launch bitmaps and the
  `<link rel="apple-touch-startup-image">` list that references them, so the
  media queries cannot drift from the files on disk.
- The manifest's `background_color` moves from `#FFFFFF` to `#0B0C0F`.

**One ground, three surfaces.** `#0B0C0F` is `ink`, and it is what the app icon
is already drawn on. The OS launch frame, the home-screen icon and the in-app
splash are now one object seen three times. It is hard-coded rather than
tokenised, for the same reason `offline.html` duplicates the palette: this has
to be right before the theme is known, and it is the same value in either
theme regardless.

The brand blue was the obvious alternative and it is the wrong one — it would
be louder, it would match the icon at nothing but the point in the middle, and
a saturated field is the register this product spends every other screen
avoiding.

## Consequences

**Portrait only, on iOS.** The full matrix is every device size × both
orientations. A phone *launched* in landscape is rare enough that doubling the
list to twenty files is not worth it; landscape falls back to white, and that
is recorded in CLAUDE.md §8 rather than left to be discovered.

**iPad gets nothing.** Same reasoning, less confidently — the app is usable at
tablet width and an iPad user installing it will see the white flash. Worth
revisiting if anyone actually does.

**None of it is verified on a real device.** The bitmaps are correct by
construction and the `<link>` tags match Apple's documented media queries, but
`apple-touch-startup-image` only takes effect in a standalone installed PWA on
real hardware, which no part of the gate can drive. It joins the iOS hit-test
fix in §8 as reasoned-and-applied rather than observed.

## Alternatives considered

**An app-wide splash with a minimum display time.** What most apps ship. It
would mean holding a ready app back on every launch, and this codebase measures
LCP in public and publishes the number. Rejected on those grounds alone.

**A skeleton of the onboarding screen as the fallback.** Structurally the
"correct" answer, and it is the right answer everywhere else in this app
(ADR 0019). It is wrong here: a skeleton says *content is coming*, which is
useful when you already know what the product is and worthless as the first
frame of a first run. There is also nothing to preserve — the screen it
precedes has no data in it.

**Leaving the fallback blank and fixing only the manifest.** Fixes the
installed case and leaves the browser case — which is every user before they
install anything — looking at a white rectangle.
