# 0018 — Colours are calibrated against their own tints, and `mist` is not text

**Status:** accepted · phase 10

## Context

The design system had two contrast claims written down. The first — *"`mist`
… is never body text"* — was a rule the implementation had quietly stopped
following: **90 uses of `text-mist`** across every screen, on hint lines,
footnotes, axis labels and chart captions. Measured, mist is **2.4–3.2:1**
against the surfaces it sat on. AA wants 4.5.

The second was subtler. `moss`, `clay` and `ember-text` were measured against
**white**, where they pass. But they are almost never used on white — they are
used as `text-moss` on `bg-moss-tint`, which is darker. On its own tint,
`ember-text` came in at 4.33 and `moss` at 4.46. Every tinted chip and the
active nav pill were just under the line.

An axe pass over 9 screens × 2 themes × 2 widths reported **62 violations**,
almost all of them one of these two causes.

## Decision

**`mist` is not a text colour.** All 90 uses became `text-stone` (5.4–6.0:1).
Hierarchy below `stone` is carried by size and weight — the type scale already
has 13px and 11px — not by making text fainter. `mist` keeps gridlines, the
dashed cost line, disabled states and placeholders, which is what the document
said all along.

A third muted level was considered and measured first. The lightest warm grey
that clears AA on `ground` is `#766E65`, which is five percent lighter than
`stone`: visually indistinguishable, and therefore not a hierarchy level at
all. **The palette has room for two muted text colours, not three** — better
to know that than to ship a token that does nothing.

**Direction colours are calibrated against their own tints,** which is the
darkest ground any of them ever sit on:

| Token | Was | Now | On its tint |
|---|---|---|---|
| `ember-text` (light) | `#A85F14` | `#9F5A14` | 4.73 |
| `moss` (light) | `#3F7A56` | `#3D7653` | 4.71 |
| `clay` (light) | `#AF4A3C` | `#AE4A3C` | 4.69 |
| `clay` (dark) | `#D4756A` | `#D98A80` | 4.69 on the destructive button's 20% fill |

Every change is a few percent — imperceptible side by side, and the difference
between passing and failing.

Result: **0 violations**, 36 page audits, re-runnable as `node scripts/audit.mjs`.

## Alternatives considered

**Darken `mist` until it passes.** Lands on top of `stone`. Two tokens with
the same value is worse than one.

**Treat hint text as "incidental" and exempt it.** WCAG's incidental exception
is for decoration and inactive UI. A sentence explaining what a setting does
is not incidental, and reaching for that exemption is how a design system
starts lying to itself.

**Bump the tints lighter instead of the text darker.** Would work, and it
costs the tint its job: a moss chip needs to read as *tinted*, and lightening
it toward white makes the chip disappear.

**Turn off `color-contrast` in the audit config.** Considered for exactly as
long as it took to type.

## Consequences

- The palette swap promised in ADR 0002 stays a one-file edit — every value
  here moved inside `globals.css`.
- Contrast ratios now belong in the token file as comments beside the values,
  not only in prose in `design-system.md`, because that is where someone
  changing them will be looking.
- `scripts/audit.mjs` exits non-zero on any violation, so this is a gate
  rather than a report. It needs a production server; the dev overlay injects
  DOM of its own and auditing that is auditing the harness.
- Automated coverage is not the whole claim. axe checks contrast, names,
  roles, landmarks and structure. It cannot tell you whether the keyboard path
  makes sense or whether a screen reader's rendering of an advice card is
  comprehensible.
