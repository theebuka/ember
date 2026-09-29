# 0003 — Archivo's width axis as the brand signature

**Status:** accepted · **Date:** 2026-08-12

## Context

With colour deliberately neutral ([0002](./0002-warm-graphite-palette.md)),
typography has to carry the identity. A finance app also has a specific
typographic problem most products don't: numbers change constantly, and they
have to stay legible, comparable, and still when they update.

## Decision

**Archivo**, loaded as a variable font with the `wdth` axis exposed, for every
visible glyph. The width axis is the signature:

| Role | Setting |
|---|---|
| Hero figures (portfolio value) | `wdth 112 / wght 600 / tracking -0.03em` |
| Body, UI | `wdth 100` |
| Wordmark | `wdth 88 / wght 600` |
| Section eyebrows | `wdth 92 / uppercase / tracking 0.08em` |

**IBM Plex Mono** appears in exactly one role: ticker symbols and timestamps,
uppercase, `+0.04em` tracking, so they read as system labels.

All money and percentages are Archivo with `font-variant-numeric: tabular-nums`.

## Alternatives considered

**Inter, Geist, or the scaffold default.** Rejected. Competent and completely
anonymous; using the framework's default font is the typographic equivalent of
shipping Tailwind gray.

**A high-contrast serif for display.** Rejected. Currently one of the most
recognisable AI-generated design tropes, and it reads editorial rather than
financial.

**Mono numerals for prices.** Rejected, and worth stating plainly because it's
the obvious move. Setting every price in a monospace face looks like a
terminal theme applied to a consumer product. Tabular figures in the text face
solve the actual problem — column alignment and non-jittering digits — without
the costume. Mono stays for tickers, where a system-label texture is correct.

**A second family for body copy.** Rejected. One family worked across two ends
of its width axis is more disciplined than two families, and it halves the
font payload.

## Consequences

- `next/font/google` must load Archivo with `axes: ["wdth"]` and no `weight`,
  since axes require the variable build.
- Two utilities in `globals.css` encode the settings so they aren't retyped:
  `.figure` (hero numbers) and `.num` (every other number). Any number in the
  app uses one of them.
- Flattening a hero figure to normal width removes the signature. It's called
  out in `CLAUDE.md` as a rule rather than left to memory.
