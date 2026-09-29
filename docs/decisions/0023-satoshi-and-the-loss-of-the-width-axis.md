# 0023 — Satoshi, and what replaces the width axis

**Status:** accepted · phase 12 · supersedes ADR 0003

## Context

ADR 0003 chose Archivo and made its `wdth` axis the brand signature: hero
figures expanded to 112%, the wordmark condensed to 88%, eyebrows at 92%, and
condensing as the house answer to a column that wouldn't fit. It was a real
system and it was internally consistent.

The client's verdict on it was simply that it wasn't clicking — which is a
legitimate and final answer about a typeface, and not one to argue with.

The replacement was chosen by rendering candidates on the app's own strings, at
the sizes the redesign actually uses, against the new palette, with Archivo
included as a control. Judging a typeface in isolation tells you whether it is
nice; judging it on `$112,116.20` and `EURUSD · −0.34%` tells you whether it is
this product's.

## Decision

**Satoshi**, from Fontshare, free for commercial use, self-hosted as a single
43 KB variable file covering 300–900.

It beat Switzer — the other finalist and essentially a free Helvetica Now — on
the numerals, which is the right criterion for an app whose primary content is
a column of prices. Satoshi's `1`, `4` and circular `0` are distinctive where
Switzer's are neutral. Neutral is safe and says nothing; the whole point of
this pass was that the interface should look like someone's rather than like
nobody's.

Self-hosting is a feature, not a cost. Almost nobody does it, which is exactly
why the result doesn't read as a default stack.

**`display: "block"`, not `"swap"`.** A swap would flash a system fallback
across every figure on the screen and then reflow all of them. On a 43 KB file
served from our own origin with an immutable cache header, holding for up to 3s
is the better trade.

**Three things replace the width axis:**

| Was | Now |
|---|---|
| Hero figures at `wdth 112` | Weight 600 with `-0.025em` tracking. Tighter than v1's `-0.03em` would start closing Satoshi's round counters |
| Wordmark at `wdth 88` | Weight 700 at `-0.03em` |
| Eyebrows at `wdth 92` | 12px with `0.07em` tracking — Satoshi's uppercase is wider than Archivo's |
| Condensing a column heading that won't fit | A smaller step (`text-[0.75rem] sm:text-micro`), still hyphenating rather than truncating |

**The scale moves up a full step**, `56/34/24/17/15/13/11` → `64/40/28/20/17/15/13`.
Body 15→17 and caption 13→15 do most of the work: the app was legible but
small, and "make it feel larger" is mostly this one change. `body-lg` was
renamed `heading`, which is what 20px actually is.

**Iconography moved to Phosphor in the same pass.** v1 imported Lucide in
thirty files and set `strokeWidth` by hand at every site — eight distinct
values between 1.6 and 2.5. At 16px, a 1.6 stroke beside a 2.2 stroke is the
difference between faint and bold on the same row, and that inconsistency was
most of why the icons read as assembled. Phosphor also ships a `fill` cut of
every glyph, which is what lets active navigation be a *filled* icon rather
than the same outline in a different colour — the shared vocabulary of this
category, and something Lucide cannot express. Everything is re-exported from
`components/common/icon.tsx` under the names the app already used, so the next
swap is one file rather than thirty.

## Alternatives considered

**Inter or Inter Display.** Immaculate, and the most-used UI typeface on the
internet. Zero brand signal.

**Geist.** Excellent figures, but rapidly becoming the recognisable house font
of AI-built products — precisely the tell being avoided.

**Instrument Sans.** Google-hosted, so no setup, and more characterful than
Inter. Would have been the pick if self-hosting had been a problem. It wasn't.

**Keeping Archivo and only changing colour.** Cheapest, and it leaves the one
thing the client named as not working.

## Consequences

- Four hard-coded `font-stretch` values were retired: `body`, `.figure`,
  `.eyebrow`, `logo.tsx`, and the risk-profile comparison table. The table is
  the interesting one — it was the *showcase* for condensing-as-a-solution, and
  now demonstrates the size-step version instead.
- `--font-archivo` is gone; `lucide-react` is uninstalled. Both were removed
  rather than left in place, because a dependency nothing imports is a trap for
  whoever reads this next.
- `@phosphor-icons/react` is registered in `optimizePackageImports`. It ships
  1,512 icons behind one barrel; without that, dev resolves every one of them
  on each request to the icon module.
- The type scale is still registered in two places — `@theme` in `globals.css`
  and the `font-size` group in `lib/utils.ts` — and the drift test that catches
  a mismatch caught the `body-lg` → `heading` rename correctly.
