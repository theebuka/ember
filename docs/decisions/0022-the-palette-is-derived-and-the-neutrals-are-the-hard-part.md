# 0022 — The palette is derived from #2563EB, and the neutrals are the hard part

**Status:** accepted · phase 12 · supersedes ADR 0002

## Context

The client chose a brand colour: `#2563EB`. v1's palette — a warm graphite ramp
with a single ember-orange accent — was explicitly a placeholder held until this
moment (ADR 0002), designed so that swapping it would never become a redesign.
This is the swap.

One fact shaped everything else. **`#2563EB` is exactly Tailwind's `blue-600`.**
That is not a problem with the colour; it is a very good UI blue, which is why
Tailwind picked it. But it means the neutrals now carry the entire burden of not
looking generic. Paired with `slate` or `gray`, the result would be the default
Tailwind palette reproduced exactly — the loudest AI-built tell there is, and
already banned by name in CLAUDE.md §5 for the warm ramp's sake.

## Decision

**The neutrals are custom, cool, and nearly achromatic.** A whisper of blue —
enough that they sit *under* the brand rather than beside it, nowhere near
enough to read as a colour of their own. `#0B0C0F` / `#2E3038` / `#62656F` /
`#9A9CA6` on light. Tailwind's `slate` carries visible chroma at the light end
and would compete; `gray` is dead neutral and goes cold next to blue.

**Light mode runs white-on-white.** `--ground` and `--surface` are both
`#FFFFFF`. This is the palette-level half of "a card is not the default
container" (ADR 0023): if a card cannot lift off the page by value, it stops
being free, and separation has to be earned with space and hairlines. Dark mode
keeps genuine value separation (`#0A0B0D` / `#101216` / `#171A20`) because on
dark it costs nothing and reads better.

**Elevation is now load-bearing on light.** With no value difference, anything
that must float over content — popovers, sheets, the nav capsule — needs
`--overlay-shadow`. Still never a card.

**Primary is the brand, reversing v1.** v1 made the primary button ink,
reasoning that a saturated button reads as a sales pitch. That was correct for
an orange accent in a near-monochrome app and is wrong here: every reference in
this category — Cash App, Chime, Phantom — puts the brand on the primary
action, which is what makes a brand colour mean "press this" rather than "this
is our logo".

**Hover is a token, not an opacity step.** `hover:bg-primary/80` cannot express
what hover means in both themes: lowering opacity blends toward whatever is
behind, so it darkens on light and lightens on dark only by accident, and over
a tinted surface does neither. `--brand-hover` is `#1D4FD1` on light and
`#3B78F5` on dark.

**Direction colours keep ADR 0018's rule unchanged** — calibrated against their
own tints, never against white. The green leans cool (`#0A7C55`) so it sits with
the blue instead of fighting it; the red is a signal red rather than an alarm
red (`#C8322F`).

## Alternatives considered

**Tailwind `slate` for the neutrals.** Free, well-tested, and would make the
whole palette the Tailwind default. Rejected on sight.

**A warm neutral ramp under a cool brand.** Genuinely interesting — warm greys
with a blue accent is a real editorial combination. Rejected because the app is
full of tinted chips and an active nav pill: a blue tint on a warm ground reads
as a colour error rather than a decision, at small sizes especially.

**Keeping a tinted `ground` (`#FAFAFC`) with white cards.** The safe version,
and it preserves free card separation. Rejected because it preserves *exactly*
the thing being removed — it makes the card the default container again by
making it the only thing that reads as a surface.

**Shipping a full 50→950 blue ramp.** Written, then cut. Only four steps are
used (`brand`, `brand-hover`, `brand-text`, `brand-tint`) and the sidebar
tokens from v1 were a standing lesson in what unused tokens become. The same
pass deleted those eight.

## Consequences

- Measured before a single hex was written into `globals.css`, using a script
  that computes every text-on-surface pair the palette produces. Every pair
  cleared AA on the first attempt; the tightest were the direction colours on
  their own tints at 4.66 and 4.67. `node scripts/audit.mjs` then returned
  **0 violations across 36 page audits** on the first run.
- The rename was mechanical but not blind: `ember` is the product's name as
  well as a token's, so every rule in the rename script required a leading
  hyphen — the shape a token has in `bg-ember-tint` and never has in prose.
  `ember` → `brand`, `moss`/`clay` → `up`/`down`, `mist` → `faint`.
- `up`/`down` replace `moss`/`clay` because the v1 names described the warm
  hues themselves. Semantic names survive a palette change; descriptive ones
  become lies.
- **`public/offline.html` was updated in the same pass**, along with the PWA
  icon SVGs, the manifest and the `themeColor` viewport entries. That file
  duplicates the palette as literals because it is served precisely when the
  stylesheet cannot be fetched — it is the one place the one-file rule cannot
  hold, and it is noted at the top of `globals.css`.
