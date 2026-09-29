# 0001 — Next.js 16, Tailwind v4, shadcn on the Radix base

**Status:** accepted · **Date:** 2026-08-12

## Context

The brief specified Next.js 15 with the App Router, TypeScript, Tailwind and
shadcn/ui. `create-next-app@latest` now scaffolds Next.js 16.3 with React 19.2
and Tailwind v4; Next 15 is no longer the default install.

shadcn's CLI has also changed shape since the version most references describe.
It now asks for a *component base* — `base` (Base UI), `radix`, or `aria` — and
a *preset* that sets the icon library and default type. The old
`--base-color`/`--style` flags are gone.

## Decision

Take Next.js 16.3 rather than pinning back to 15, and initialise shadcn with
`-b radix -p nova`.

## Alternatives considered

**Pin Next.js 15.** Matches the brief literally. Rejected because the App
Router programming model is unchanged between the two, 16 is the current
stable major, and pinning a superseded major on a greenfield project buys a
migration later for no benefit today. Flagged to the client rather than
decided silently — the downgrade is cheap while the app is small.

**Base UI instead of Radix.** shadcn's newer default. Rejected for now: Radix
has the larger body of documented patterns and a wider surface of primitives,
which matters more than novelty on a project that will lean on sheets,
dialogs, comboboxes and tooltips heavily. Revisit if Base UI's coverage
overtakes it.

**Hand-write the components instead of using the CLI.** Considered so the
restyling would live in source from the start. Rejected after the client
confirmed the CLI was fine — the generated components are a better starting
point than a blank file, and heavy restyling is done by overriding the two
components everything else composes from (`card`, `button`) plus the token
layer.

## Consequences

- Turbopack is the default dev bundler; `--turbopack` need not be passed.
- Tailwind v4's CSS-first `@theme` replaces `tailwind.config.ts` entirely.
  There is no config file to look for.
- shadcn writes `@import "shadcn/tailwind.css"` into `globals.css`; that import
  must survive edits to the token layer.
- The generated `card` uses `ring-1` and the generated `button` tops out at
  36px. Both are overridden — see [0002](./0002-warm-graphite-palette.md) and
  the design system doc.
