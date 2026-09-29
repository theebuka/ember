# 0016 — `cn()` is taught the type scale

**Status:** accepted · phase 8

## Context

A table header on the settings screen wouldn't fit its column. Measuring it
found the cause: it was rendering at **16px**, the browser default, not the
11px `text-micro` it asked for.

`cn()` is `twMerge(clsx(...))`. tailwind-merge ships with Tailwind's *default*
theme compiled in and has no way to read `globals.css`, where ember's type
scale lives. Faced with an unfamiliar `text-*`, it assumes a colour — so
`text-micro` was being filed in the same conflict group as `text-stone`, and
the later class won:

```ts
cn("text-micro", active ? "text-ember-text" : "text-stone")
// → "text-ember-text"
```

Nothing warns. Tailwind still emits `.text-micro`; the class simply never
reaches the element. A scan found **27 `cn()` calls** across every phase built
so far dropping a size this way — bottom-nav labels, page-header titles, the
sidebar, action badges, chart axis ticks, form error messages, the data-source
chip. The whole app had been quietly rendering parts of its own type scale at
the browser default.

It survived seven phases of review because the symptom is "slightly off",
never "broken".

## Decision

Register the scale with `extendTailwindMerge`, so `text-figure` through
`text-micro` sit in the `font-size` group where they belong.

A test locks it in, and a second test reads `globals.css`, extracts every
`--text-*` token, and asserts each one survives being merged with a colour.
The registration and the `@theme` block are two hand-maintained lists of the
same thing; that test is what stops the next size added to one and not the
other from silently not applying.

## Alternatives considered

**Drop `cn()` and concatenate.** Removes the merge, and with it the ability
for a caller to override a component's default — which is the entire reason
shadcn components take a `className`.

**Rename the tokens to values tailwind-merge already knows** (`text-xs`,
`text-sm`…). Gives up the named scale, which is the part of the design system
people actually reason in. `text-caption` says what it is for; `text-sm` says
what size it is next to some other size.

**Order classes so the size always comes last.** Works until someone writes a
conditional. It is a convention with no enforcement, guarding a failure that
produces no error.

## Consequences

- Type across the app is now the size the design system specifies. Several
  screens shipped in earlier phases changed appearance on this commit; none of
  them changed for the worse, because in every case the intended size was the
  smaller one.
- Any new entry in the `@theme` type scale must be added to `utils.ts`. The
  test fails if it isn't.
- Worth remembering the class of bug rather than the instance: a utility that
  *silently discards* what it doesn't recognise will always fail this way, and
  the same applies to any other custom scale handed to `cn()`.
