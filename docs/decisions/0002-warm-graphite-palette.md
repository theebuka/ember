# 0002 — A near-monochrome warm-graphite palette with one accent

**Status:** accepted · **Date:** 2026-08-12

## Context

The client had not chosen brand colours, said they usually default to
monochrome, and asked for something with character that doesn't look
templated. They also clarified that Wise is a reference for *UX decisions*,
not for its visual language — so the forest-and-acid-green direction that
would have followed from a literal reading was off the table.

Two constraints therefore pulled against each other: the palette has to be
provisional enough to swap, and the interface still has to have a point of
view.

## Decision

Resolve the tension by moving personality out of colour entirely. Colour stays
near-monochrome and swappable; character is carried by typography and
information design (see [0003](./0003-archivo-width-axis.md)).

The ramp is **warm graphite** — every step carries a slight red-yellow cast, so
surfaces read as ink on paper rather than pixels on glass. One saturated
accent, `ember` (`#D9822B`), and two low-chroma direction colours, `moss` and
`clay`.

Values are plain hex, not oklch, specifically so a client-supplied brand hex
can be pasted straight in.

## Alternatives considered

**Tailwind's `neutral` or `zinc` ramps.** Rejected outright. Default Tailwind
grays are the single most recognisable signal that an interface was assembled
rather than designed, and they are cool where this palette wants warmth.

**Pure `#000` ink.** Rejected. Pure black on an off-white ground is harsher
than any financial interface needs, and it breaks the warm cast that makes the
ramp cohere. Ink is `#16130F`.

**Ember as the direction-positive colour.** Rejected: it would collide
semantically with `clay` for losses, and it would spend the accent on
something that appears on every row of every table. Ember is reserved for a
single meaning — *attention*: brand, active nav, primary focus ring, live
pulse, and the peak of the window band.

**Red/green throughout, trading-terminal style.** Rejected. Red-green flicker
is the strongest casino signal in a market UI and the brief rules out that
feeling. Direction colours are desaturated and appear mostly as tinted chips.

## Consequences

- `src/app/globals.css` is the only file permitted to define a colour.
- `--ember` fails WCAG AA as text on light surfaces (≈2.6:1). A separate
  `--ember-text` (`#A85F14`, ≈4.9:1) exists for that case; the raw token is
  for fills and marks only.
- shadcn's semantic variables (`--primary`, `--muted`, `--border`…) are mapped
  onto the ember palette rather than replaced, so every generated component
  inherits the theme with no component edits.
- Dark mode is a separately calibrated ramp, not an inversion.
