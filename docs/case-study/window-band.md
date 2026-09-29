# The window band

*A component study — `src/components/advice/window-band.tsx`*

---

## The problem it exists to solve

Every app in this category ships a badge that says **BUY**. Almost none of
them say *when*, and the ones that do say it in prose: "consider accumulating
over the coming days."

ember's differentiator is the timing, so the timing needed a shape. The
component is the product's central claim rendered directly — not an ornament
around a number, but the actual output of `computeWindow()` drawn at the
resolution the model actually has.

```
now│                                                        │+72h
   ├────────░░▒▒▓▓███●███▓▓▒▒░░─────────────────────────────┤
                     └ peak Thu 11:40 · window 09:15–16:00
```

## What is being drawn

Three independently documented things, multiplied hour by hour across 72
hours:

| Term | Source | Effect |
|---|---|---|
| **Liquidity** | Intraday volume profile; London/New York overlap for FX; 8-hour funding resets and thin weekends for crypto | When the market can absorb an order |
| **Events** | Earnings, CPI, NFP, central-bank decisions | Suppressed around a scheduled shock the signal makes no claim about |
| **Decay** | Each strategy's empirical half-life | The window closes when the edge does |

The band's density ramp **is** that composite score. If the curve is wrong,
the picture is wrong — there is no separate presentation layer to hide behind.

---

## Three decisions that shaped it

### A density ramp, not a rectangle

The obvious rendering is a filled bar from `opensAt` to `closesAt`. It was
rejected because it asserts a precision the model doesn't have: a hard edge at
09:15 says something false about 09:14.

The intensity rises to a crest and falls away, because *"Thursday late
morning"* is a genuinely soft-shouldered claim and should look like one. The
stated `opensAt`/`closesAt` are the span where intensity is above half its
peak — a definition, not a fence.

### Hourly columns, not a smooth gradient

An early version used a CSS gradient. It looked better and lied: a continuous
wash implies the model can distinguish 11:04 from 11:26. It can't — the curve
is sampled hourly.

The columns are the model's resolution, shown rather than smoothed over. This
is the same instinct as refusing to draw a candlestick chart: the visual
grammar has to match what is actually known.

### One ember point, at the crest

The only saturated pixel in the component, and the same shape as the brand
mark. That is deliberate: **the logo and the core product primitive are one
object** — the moment the system is pointing at.

It is also the reason `EmberPoint` is built from CSS rather than an SVG
gradient. The band renders it once per card, and duplicate SVG gradient IDs
across a feed of thirteen cards is a rendering bug waiting to happen.

---

## Details that cost more than they look like they should

**The `now` marker is `null` until mounted.** The server has no idea what time
it is where the reader is sitting. Rendering a marker server-side and
correcting it on hydration produces a visible jump, so it isn't drawn until
`useNow()` reports a real clock — and the scale beneath reserves its exact
height in the meantime, so nothing below it moves. (ADR 0017's sibling
problem; the same rule that governs every skeleton in the app.)

**It ticks once a minute, not once a second.** Across 72 hours the marker
travels roughly a fifth of a pixel per minute. A one-second interval would be
thirteen wakeups a minute on the advice feed to move nothing.

**One clock for every band on the page.** `useNow` is a `useSyncExternalStore`
over a single shared interval, so thirteen cards share one timer rather than
running thirteen that fire at slightly different moments.

**Midnight gridlines are gated on the clock too**, because "where does the day
break" is a local-time question with the same hydration problem.

**Three sizes, one component.** 24px collapsed on a watchlist row, 40px on a
card, 56px on the asset page with hour ticks and session shading. The point
scales with the track (13 / 16 / 20px) so the crest stays proportionate rather
than becoming a dot on the large size or swallowing the small one.

**`prefers-reduced-motion`.** The marker's movement is a position change
rather than an animation, so the CSS block covers it — but the surrounding
shared-layout indicators are JavaScript and needed `useReducedMotion()`
explicitly. That distinction cost a real bug in phase 7 (decision 036).

---

## What it would take to be wrong

The honest failure mode of this component is that it looks authoritative. A
72-hour band with an hourly ramp and a marked crest reads as precision, and
the underlying liquidity curves are currently *modelled* rather than measured
— the shapes are the documented ones, but the control points are judgement.
That is stated in `CLAUDE.md` §8 and on the methodology page, and it is the
single thing most improved by a real market feed: with observed spread and
depth, the curve stops being a good guess and starts being data.
