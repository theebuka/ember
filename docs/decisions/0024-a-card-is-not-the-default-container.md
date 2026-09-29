# 0024 — A card is not the default container, and desktop gets a second column

**Status:** accepted · phases 13–14

## Context

Two complaints, one cause.

**"Too much empty space on desktop, with the UI concentrated in the centre."**
`PageBody` capped at `max-w-5xl` — 1024px, 960px of real content — and there
was not a single `lg:` or `xl:` class anywhere in `src/`. The layout fully
resolved at 768px and was byte-identical at 3440px. At 1920px that left about
324px of empty ground on each side, roughly a third of the usable area, with a
narrow ribbon of cards down the middle.

**"Everything mustn't be a card — it's a massive AI-generated tell."** Measured:
31 `<Card><CardContent>` wrappers across five screens, plus one per advice item.
Every block of every screen was a bordered rectangle.

The two are related. A page of cards *has* to be a single narrow column,
because a grid of bordered rectangles at 1600px is a dashboard template rather
than a product. Removing the cards is what makes a real desktop layout possible.

## Decision

**A card is not the default container.** The default is `Section` — a heading
and its content, separated from its neighbours by space, with no border, no
fill and no radius. Lists are `Rows`: hairlines *between* items, never a box
*around* the group. `Card` keeps exactly three jobs: a genuinely elevated hero
object, the body of a modal or sheet, and chrome that floats over scrolling
content.

This is only possible because ADR 0022 made `ground` and `surface` the same
white. A card that can't lift off the page by value stops being free, which is
what stops it being the default.

It also recovers real width. A card's 24px of padding sits *inside* the page's
own, so on a 375px screen the content column was 40px narrower than it needed
to be — the second half of "too much margin on the sides".

**The cap rises to 1600px, and the answer to extra width is a second column,
not a wider first one.** `PageColumns` puts a persistent companion beside the
main content: on Home, the feed with your positions and the day's moves
alongside. Below `lg` the aside falls under the main column in source order, so
the phone layout is the same stack it always was — no duplicated markup, no
`hidden lg:block` twin.

**Screens that are genuinely one column get `narrow` instead** (`max-w-4xl`).
"Use the width" is the fix for a dashboard, not licence to set a paragraph
1,500px wide or put a switch 1,400px from its label. Settings, the methodology
and the track record are reading and form screens and are capped.

## Alternatives considered

**Raise the cap and keep the cards.** One line, and it makes things worse: a
1600px-wide bordered rectangle containing one sentence is more obviously a
template than a 960px one.

**Restyle the card — softer border, no radius, tinted fill.** This is the
version that feels like progress and isn't. The tell is the *structure*: a
uniform grid of containers. Any styling of that grid is still that grid.

**Duplicate the value block — main column on mobile, companion on desktop.**
Written, then reverted. It renders twice and hides one with CSS, which means
two `ValueChart`s and two sets of geometry per paint, one of them thrown away.
The value block now lives in the main column at every width, which is also
where a chart belongs: it is the one element on Home that genuinely improves
with a wider column.

**Mechanical de-carding with no review.** The unwrapping script handled 31 of
33 wrappers; the two it broke were cards that were the *return value of a
`.map()`*, where removing the wrapper left orphan siblings and took the `key`
with it. Both were caught by typecheck, but the script deliberately refuses
nested cards rather than guessing — a half-unwrapped card is worse than a card.

## Consequences

- Navigation went from five labelled tabs to **three icon-only ones** — Home,
  Signals, Portfolio, with News joining in phase 16. Watchlist folded into
  Portfolio as a segment; Settings moved behind a profile control. Reasoned in
  full in `lib/nav.ts`.
- `/advice` → `/signals` and `/watchlist` → `/portfolio?view=watching`, both
  permanent redirects in `next.config.ts`, because the old paths are in
  installed PWA shortcuts and in notification payloads sitting in OS queues.
- The portfolio segment lives in the URL, so `/watchlist` can redirect straight
  to it and the back button steps between segments.
- **`scripts/audit.mjs` gained the two extra segment routes.** axe only sees
  what is mounted, and auditing `/portfolio` alone would have left two thirds
  of that screen unchecked. 40 page audits, 0 violations.
- Two real defects surfaced only once the layout got wider: the value chart's
  end marker was an `<svg:circle>` inside a `preserveAspectRatio="none"`
  viewBox, so it had always rendered as an ellipse stretched by the chart's
  width — invisible at 960px, obvious at 1160px. And `+$20,864.31 +28.52%`
  overflowed its column at the new body size and truncated to `+28….`. Both
  fixed; the second needed a matching change to the skeleton, or the fix would
  have reintroduced exactly the layout shift ADR 0019 removed.
