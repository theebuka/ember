# Performance and layout shift

`scripts/perf.mjs`, 2026-10-02, against a production build.

## Layout shift

Observed with a `PerformanceObserver` on `layout-shift`, installed before
first paint, with a real ledger seeded — that is the state the app spends
its life in, and the markup that still shifts is markup that only exists
when there *is* a book ([ADR 0019](../decisions/0019-skeletons-are-sized-by-type-metrics.md)).
The empty-book state has a shift of its own and it is not small; the
Lighthouse table below is where that one shows up.

| Screen | Mobile | Desktop |
|---|---|---|
| Home | 0.006 | 0.009 |
| Portfolio — holdings | 0.009 | 0.003 |
| Portfolio — watching | 0.006 | 0.001 |
| Portfolio — activity | 0.006 | 0.001 |
| Signals feed | 0.000 | 0.012 |
| News | 0.000 | 0.000 |
| Track record | 0.000 | 0.000 |
| Methodology | 0.000 | 0.000 |
| Asset detail | 0.074 | 0.028 |
| Settings — account | 0.054 | 0.005 |
| Settings — your data | 0.000 | 0.000 |
| Notifications | 0.007 | 0.014 |
| Sign in | 0.000 | 0.000 |
| Onboarding | 0.000 | 0.000 |

Gate: **0.1**, Google's "good" threshold — the external standard,
not a number picked to fit the measurement. Nine screens are under 0.02.
The asset page carries the rest: `Your position` is inserted the moment
`localStorage` becomes readable, because the server cannot know there is a
book, and a 149px section appearing at hydration moves everything beneath
it. Closing that needs a cookie mirroring the ledger's existence — the
ADR 0014 pattern — which is a decision to take deliberately rather than to
reach for because a number is ugly.

What *was* fixed here, all of it found by this script: the hero skeleton
was 90px against a 158px hero, the price row was a fragment collecting a
36px `space-y` gap where it asks for 12, the trending strip wrapped to two
rows where the real one wraps to three, and the position block used to
arrive four seconds in rather than at hydration.

## Lighthouse

Cold Chrome, first-run cookie set so the figures describe the app rather
than the redirect to setup. Lighthouse carries no `localStorage`, so these
runs see the **empty-book** state — a real state, and the one a first
visitor gets, but not the one the table above measures. Its CLS column is
the empty book's own shift, which is why Home reads higher here than it
does seeded.

| Screen | Profile | Perf | A11y | Best practices | SEO | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|---|
| Home | mobile | 79 | 100 | 100 | 100 | 5.5 s | 43 ms | 0.067 |
| Signals feed | mobile | 78 | 100 | 100 | 100 | 6.2 s | 28 ms | 0.000 |
| Asset detail | mobile | 86 | 100 | 100 | 100 | 4.3 s | 21 ms | 0.003 |
| Home | desktop | 98 | 100 | 100 | 100 | 1.1 s | 0 ms | 0.015 |
| Signals feed | desktop | 98 | 100 | 100 | 100 | 1.2 s | 0 ms | 0.011 |
| Asset detail | desktop | 99 | 100 | 100 | 100 | 0.9 s | 0 ms | 0.004 |

Mobile is Lighthouse's throttled profile — simulated slow 4G with a 4×
CPU penalty. The critical path is the stylesheet and the app's own
JavaScript; there is no image to blame.
