# ember design system

The single source of truth for tokens is `src/app/globals.css`. This document
explains the reasoning; the CSS is the implementation. Where they disagree,
the CSS is right and this file needs updating.

> **v2.** The system below replaced a warm-graphite-and-orange palette set in
> Archivo. The reasoning for each change is in ADR 0022 (colour) and ADR 0023
> (type and icons); this file describes only what is true now.

---

## Principle

The brand is `#2563EB` — which is exactly Tailwind's `blue-600`. That is a good
UI blue and a fine choice, and it means **the neutrals carry the entire burden
of not looking generic.** Pair this hex with `slate` and you have reproduced
the default Tailwind palette; the interface then looks like every other
interface built this year, regardless of how good the rest of it is.

So: a custom, cool, nearly achromatic ramp under one saturated brand, and
personality carried by **space and typography** rather than by colour.

---

## Colour

### The ramp

A whisper of blue — enough to sit *under* the brand rather than beside it,
nowhere near enough to read as a colour of its own. Tailwind's `zinc` /
`neutral` / `slate` / `gray` are banned by name.

| Token | Light | Dark | Use |
|---|---|---|---|
| `ink` | `#0B0C0F` | `#F4F5F7` | Primary text — never `#000` |
| `graphite` | `#2E3038` | `#C9CCD4` | Headings, secondary emphasis |
| `stone` | `#62656F` | `#8E919B` | Labels, muted copy, axis ticks |
| `faint` | `#9A9CA6` | `#5C5F69` | Gridlines, disabled, placeholder |
| `line` | `#ECEDF1` | `#23262E` | Hairline borders |
| `line-strong` | `#DDDFE6` | `#30343E` | Dividers carrying more weight |
| `surface-2` | `#F5F6F8` | `#171A20` | Wells, inputs, secondary buttons |
| `surface` | `#FFFFFF` | `#101216` | Cards |
| `ground` | `#FFFFFF` | `#0A0B0D` | The page |

**On light, `ground` and `surface` are the same value.** This is deliberate and
it is the palette-level half of "a card is not the default container": if a
card lifts off the page for free, it stays the default forever. Dark keeps real
value separation, because there it costs nothing.

**`faint` is not a text colour.** It measures 2.7:1. There are exactly **two**
muted text levels — `stone`, and nothing below it. The lightest grey that
clears AA is about five percent off `stone` and visually identical, so there is
no room for a third. Below `stone`, hierarchy is size. ADR 0018.

### Brand and direction

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `brand` | `#2563EB` | `#2563EB` | Fills, marks, active state, primary CTA |
| `brand-hover` | `#1D4FD1` | `#3B78F5` | The fill under the cursor |
| `brand-text` | `#1B4FD0` | `#8AB0FF` | Brand as text |
| `brand-tint` | `#EFF3FF` | `#12203F` | Active nav pill, selection, chips |
| `up` | `#0A7C55` | `#3ECF8E` | Positive / buy |
| `down` | `#C8322F` | `#FF7A75` | Negative / sell |

**The brand fill is the same hex in both themes.** Only the *text* cut changes,
because `#2563EB` as type on a near-black ground is 3.4:1.

**Hover is a token per theme, not an opacity step.** `bg-primary/80` blends
toward whatever is behind it, so it darkens on light and lightens on dark only
by accident — and over a tinted surface it does neither.

**The primary button is the brand.** v1 made it ink on the reasoning that a
saturated button reads as a sales pitch. That was right for orange in a
monochrome app; here it is wrong. Putting the brand on the primary action is
what makes a brand colour mean "press this" rather than "this is our logo".

**Contrast is measured against the darkest surface a colour actually sits on,
which for the direction colours is their own tint — never white.** A chip is
`text-up` on `bg-up-tint`. Measured against `#FFF`, every tint in v1 came in
just under AA and every chip in the app failed. Current figures on their own
tints: `brand-text` 6.16 / 7.46, `up` 4.66 / 8.16, `down` 4.67 / 6.77.

Verified by `npm run verify -- --only=audit`, which exits non-zero on any
violation. **0 violations across 44 page audits** — 11 screens × 2 themes × 2
widths, on a seeded book so the risk rows and the tinted severity badge are
actually measured.

### Charts

No candlesticks. No red/green fills. Single-hairline area lines with a 6% tint.
`--chart-1..5` map to ink / stone / faint / brand / graphite. Direction belongs
in badges and chips, where it can be read calmly.

---

## Layout

### A card is not the default container

Wrapping every block in a bordered rectangle is the loudest *structural* tell
of an assembled interface — a page of cards reads as a dashboard template
rather than as a product. It also costs real width: a card's padding sits
inside the page's own, so on a 375px screen the content column was 40px
narrower than it needed to be.

| Primitive | For |
|---|---|
| `Section` | The default. A heading and its content, separated from neighbours by space. No border, no fill, no radius |
| `Rows` / `Row` | A list. Hairlines *between* items, never a box *around* the group |
| `Stat` | A figure with its label underneath — labels above push the figures off a shared baseline |
| `Divider` | A hairline |

`Card` survives for exactly three jobs: one genuinely elevated hero object, the
body of a modal or sheet, and chrome that floats over scrolling content.

### Elevation

Hairlines instead of shadows — but on light, where `ground` and `surface` are
the same value, anything that must float *above* the page cannot borrow
separation from value and has to earn it with `--overlay-shadow`. Never a card:
a card that needs a shadow to be legible is a Section that should not have been
a card.

---

## Type

**Geist**, variable, through `next/font/google` — downloaded at build time and
served from ember's own origin, so no reader's browser ever contacts Google.
**IBM Plex Mono** for ticker symbols and timestamps only.

Chosen on 2026-09-29, replacing Satoshi, which the user judged to read as cheap
beside the category. Geist, Inter, Instrument Sans and Mona Sans were rendered on
the app's own strings with Satoshi as a control; Geist and Inter were then run
live in the app one after the other, and Geist won. Mona Sans was out on its
tabular zero, which is slashed and reads oddly in a price column.

Loaded `display: "block"`, not `"swap"`: a swap would flash a system fallback
across every figure on screen and then reflow all of them.

### The interface face

Everything a typeface needs tuned lives in one block of `globals.css`, the
`--face-*` custom properties, and is reached through `figure`, `eyebrow` and the
`tracking-display` / `tracking-title` / `tracking-wordmark` utilities. Never an
arbitrary `tracking-[…]` for these — that is how Satoshi's tuning ended up in
nine files. A change of face is that block plus the loader in `app/layout.tsx`.

| Property | Geist (live) | Satoshi |
|---|---|---|
| `--face-figure-weight` | 600 | 600 |
| `--face-figure-tracking` — the balance | −0.035em | −0.025em |
| `--face-display-tracking` — display | −0.04em | −0.025em |
| `--face-title-tracking` — 28px titles | −0.03em | −0.02em |
| `--face-wordmark-tracking` — the lockup | −0.045em | −0.03em |
| `--face-label-tracking` — section labels | −0.006em | −0.005em |

Geist is tracked tighter as it grows, the way Vercel sets it (its own scale runs
−0.04em at 32px to −0.06em at 72px). The balance stops at −0.035em because
tighter crowds the cents into the last digit.

**Reverting to Satoshi.** `src/app/fonts/Satoshi-Variable.woff2` is kept. Put the
Satoshi column's values into the `--face-*` block, and replace the `ui` loader
in `app/layout.tsx` with:

```ts
import localFont from "next/font/local";

const ui = localFont({
  src: "./fonts/Satoshi-Variable.woff2",
  variable: "--font-ui",
  weight: "300 900",
  style: "normal",
  display: "block",
  preload: true,
});
```

Satoshi is Fontshare's, free for commercial use, and not on Google Fonts, which
is why it was self-hosted from a file. It had won over Switzer in v2 on its
numerals — the `1`, the `4` and the circular `0`.

### Scale

| Token | Size | Use |
|---|---|---|
| `text-figure` | 56px · 44px on a phone | Hero portfolio value |
| `text-display` | 36px · 28px | Section-level figures, onboarding headings |
| `text-title` | 28px · 22px | Page titles |
| `text-heading` | 20px · 18px | Card and section titles |
| `text-body` | 16px | Body copy |
| `text-caption` | 14px | Labels, table cells |
| `text-micro` | 12px | Footnotes, metadata |

The top four steps are smaller below `md` (the `@media (width < 48rem)` block
after `@theme`). Body and below are the same at every width. v2 had moved every
step up (body 15→17); at that size a 402pt phone fitted too few words to a line,
headings wrapped where they didn't need to, and screens read as crowded. The
Figma file mirrors this with an "ember / Type" variable collection that has a
Desktop and a Mobile mode.

Adding a size means editing **two** files: the `@theme` block in `globals.css`,
and the `font-size` group registered with tailwind-merge in `lib/utils.ts`.
tailwind-merge only knows Tailwind's default theme and treats an unrecognised
`text-*` as a colour, so an unregistered size is silently deleted by any colour
class beside it (ADR 0016). A test reads the CSS and fails if the lists drift.

### There is no width axis

v1's signature was Archivo's `wdth` axis — figures expanded to 112%, the
wordmark condensed to 88%, and condensing as the house answer to a column that
wouldn't fit. Neither Satoshi nor Geist has one. Three things replace it:

- **Hero figures** get their density from weight and negative tracking — the
  `--face-figure-*` values above.
- **The wordmark** is weight 700 at `--face-wordmark-tracking`.
- **A column heading that won't fit steps down a size and hyphenates.** Never
  truncate to `Conse…` — that hides which column is which — and never invent
  an abbreviation, which is a legend to learn.

### Numbers

Every price, percentage and quantity uses `.num` — tabular, lining figures in
the interface face. Columns stay aligned and digits don't jitter as prices tick.

Prices are **not** set in mono. Mono numerals everywhere read as a terminal
theme applied to a consumer product.

---

## Controls

**56 / 48 / 40 / 32**, fully rounded at every size.

| Size | Height | For |
|---|---|---|
| `xl` | 56px | The primary action on a screen; full-width on mobile |
| `lg` | 48px | Primary actions, sheet footers |
| `default` | 40px | Standard |
| `sm` | 32px | Dense inline actions |

Pills are the shared vocabulary of this category. A pill reads as a discrete
object you press; a 10px-radius rectangle reads as a region of a form.

`tap-target` puts a **44px floor under the hit region** on coarse pointers,
without changing the visible size — **vertically only**. Expanding horizontally
too is the obvious version and it is harmful: two 28px icon buttons 4px apart
would overlap, and the one later in the DOM (delete) would own the other's
right half. ADR 0021.

**Inputs and selects are filled wells**, not bordered boxes. On a white page a
1px outline around an empty rectangle is the weakest possible signal that
something is editable. `text-body` at 16px is exactly iOS's zoom-on-focus
threshold, so inputs don't zoom, without the usual `text-base md:text-sm` dance.

---

## Icons

Everything comes from `components/common/icon.tsx`, which re-exports
**Phosphor** under the names the app already used. **Never import an icon
vendor anywhere else, and never set `strokeWidth` at a call site.**

v1 imported Lucide in thirty files and set `strokeWidth` by hand at every one —
eight distinct values between 1.6 and 2.5. At 16px, a 1.6 stroke beside a 2.2
stroke is the difference between faint and bold on the same row, and that
inconsistency is most of why the iconography read as assembled.

Phosphor also ships a `fill` cut of every glyph, which is what lets **active
navigation be a filled icon** rather than the same outline in a different
colour. That outline-to-fill transition is the shared vocabulary of this
category and Lucide cannot express it.

---

## Space, radius, motion

- **Radius** `--radius: 0.75rem`. Buttons and segmented controls are pills;
  every container and icon tile is `rounded-xl`, every tag `rounded-md`
  (`Tag`). The desktop frame's panel is the one other radius.
- **Grid** one left edge per page, shared by the header and the body. A
  reading-width page caps its blocks, never centres a column.
- **Page padding** 20px on mobile — and nothing nested inside a card's own
  padding on top of it.
- **Vertical rhythm** roughly doubled from v1: sections separated by 40–56px.
- **Motion** is for continuity, not decoration. `prefers-reduced-motion` is
  honoured globally and explicitly on shared-layout animations, which run in
  JavaScript and sail straight past the CSS media query (ADR 0036 in
  CLAUDE.md's list).

---

## Loading states

**A placeholder reserves a line box, not a rectangle.** Give `Skeleton` an
invisible glyph in the same type class the real element uses, and let the
browser compute the height:

```tsx
<Skeleton className="w-20">
  <span className="block text-body text-transparent">0</span>
</Skeleton>
```

A guessed `h-4` where `text-body` lands is seven pixels, and seven pixels a row
is how the asset page reached 0.635 cumulative layout shift against a stated
rule of zero. Sized this way it cannot drift when the type scale changes — and
the scale just changed, which is the proof. ADR 0019.

Two corollaries:

- **A placeholder must be the size of the thing it replaces.** `h-40` standing
  in for a 600px advice card is not a skeleton, it's a gap.
- **Data that arrives in two requests needs its space held across both.**

---

## Copy

- A restrained analyst, not a bot. `Moderate · 68`, never `🔥 HIGH`.
- Buttons name their outcome and keep the name through the flow:
  `Execute` → toast `Executed`.
- Sentence case, active voice, no emoji in product UI.
- Errors say what happened and what to do, in the interface's voice. They do
  not apologise and they are never vague.
- Empty states are invitations. If there is nothing to do from an empty
  screen, the screen is a dead end and the design is wrong.
