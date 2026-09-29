# 0019 — Skeletons are sized by type metrics, not by guessed heights

**Status:** accepted · phase 10

## Context

"Skeletons match final layout exactly — **zero** cumulative layout shift when
data lands" has been a stated rule since phase 0, and every screen was built
with a hand-written skeleton to honour it.

Phase 10 measured it for the first time, with a `PerformanceObserver` on
`layout-shift` driving a production build:

| Screen | CLS |
|---|---|
| `/asset/NVDA` | **0.635** |
| `/watchlist` | 0.100 |
| `/` and `/portfolio` | 0.074 |

Google's "needs improvement" threshold is 0.1. The asset page was six times
it. Nobody had noticed, because each individual mismatch is a handful of
pixels and the eye reads the result as "the page settling".

Three distinct causes, and they want different fixes.

## Decision

**1 — A placeholder must reserve a line box, not a rectangle.**

Every mismatch traced to a `Skeleton` given a guessed pixel height where real
type would land:

```tsx
<Skeleton className="h-4 w-20" />          // 16px reserved
<dd className="text-body">$85,602.63</dd>  // 23px rendered
```

Seven pixels, twice over on a two-column grid, plus 16px on the hero figure —
24px, and the whole page below it moved. The fix is to let the browser compute
the height from the same type class the real element uses:

```tsx
<Skeleton className="w-20">
  <span className="block text-body text-transparent">0</span>
</Skeleton>
```

`Skeleton` is a div that passes children through, so the bar sizes itself to
an invisible glyph in the real font at the real size. It cannot drift when the
type scale changes, which the arithmetic version silently would.

**2 — A placeholder must be the size of the thing it replaces.**

`ember's read` on the asset page reserved `h-40` for an `AdviceCard` that
renders at 500–700px. That single line was most of the 0.635: every section
below it dropped half a screen. It now uses the real `AdviceCardSkeleton`,
which already existed for the advice feed.

The class-adaptive metric groups had no placeholder at all — two to four whole
sections were inserted on arrival. They now reserve two, which is the common
case; being slightly wrong beats reserving nothing.

**3 — Two-stage data needs the space held across both stages.**

Watchlist rows render from `/api/quotes` and gain a sparkline from
`/api/series`, a separate request. The skeleton was correct; the *row* grew
18px between its own two renders. Fixed by reserving the sparkline's height
whether or not there is a line to draw yet.

| Screen | Before | After |
|---|---|---|
| `/asset/NVDA` | 0.635 | **0.006** |
| `/watchlist` | 0.100 | **0.018** |
| `/` and `/portfolio` | 0.074 | **0.021** |
| `/advice`, track record, methodology, settings | 0 | 0 |

## Alternatives considered

**Fixed heights on the containers.** Locks the layout to today's content and
breaks the moment a figure gets longer or a note wraps.

**A fade-in to disguise the shift.** Dressing up the symptom, and it costs the
user a slower first read of the number they came for.

**Drop the zero-CLS rule to "under 0.1".** The rule is doing exactly what a
rule is for — it is why this got measured at all. Weakening it on the day it
first failed is the wrong lesson.

## Consequences

- The measurement is a script (`.tmp` during the pass; the reusable half lives
  in `scripts/capture.mjs`, which also fails the build on horizontal overflow
  at nine widths).
- **What remains is one class of shift, and it is honest:** sections that
  exist only if `localStorage` says so — `SampleNotice`, the empty-book state,
  `Your position` — cannot be known server-side, so they are inserted after
  hydration. Closing it means mirroring a flag into a cookie the way ADR 0014
  does for onboarding. Deliberately not done: one cookie for a real routing
  decision is a fair price, four to shave 0.02 off CLS is not.
- Type-metric sizing is now the house pattern for placeholders, and it is
  written into `docs/design-system.md` rather than left as a trick in one file.
