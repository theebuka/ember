# 0012 — The methodology page is read out of the engine, not transcribed

**Status:** accepted · phase 6

## Context

The methodology page states which rules ember follows, where each comes from,
and what each market regime does to each family of rules. The obvious way to
build it is to write that out — the content already exists in
`docs/methodology.md`.

On a product whose entire claim is *you can check this*, a page that was true
at the moment someone typed it is close to worthless. The regime multipliers in
particular are exactly the sort of thing that gets tuned in `regime.ts` and
forgotten everywhere else, and a stale weight table is worse than no table: it
invites the reader to verify something, and then misleads them.

## Decision

`/api/strategies` serves the page's content from the engine:

- **The strategy list** is `STRATEGIES` — id, name, family, citation, which
  markets it applies to, how many bars it needs.
- **The regime table is computed by calling `regimeWeight()`** against four
  concrete `Regime` objects, one per named scenario.
- **The profile multipliers** are `PROFILE_WEIGHTS[profile]`.

Adding a strategy makes it appear on the page. Changing a multiplier changes
the table. Neither requires anyone to remember.

## Why concrete regimes rather than the branch table

`regimeWeight()` applies several independent adjustments, and the documented
table in `docs/methodology.md` lists them individually: trend is ×0.7 in a
range, ×0.8 when volatility is stressed. What the ensemble actually applies in
a market that is *both* is ×0.56.

Feeding the real function four concrete regimes surfaces those compound values.
The hand-written table had been sitting in the docs for two phases reporting
only the individual branches — not wrong, but not what the engine does either.
This is precisely the drift the decision is meant to prevent, and it was found
by building the page this way.

`docs/methodology.md` now says explicitly that its table lists branch effects
and that the page is authoritative where they differ.

## Alternatives considered

**Render `docs/methodology.md` as MDX.** Keeps one source for the prose, which
is genuinely appealing, and does nothing for the numbers — the tables in it are
markdown someone typed. Worth revisiting for the long-form sections; the
figures still have to come from code.

**Generate the markdown from the code at build time.** Solves drift, adds a
build step, and the doc stops being editable by hand — which is what it is for.

**Accept the drift and review it each release.** This is the plan that always
loses. Two phases in, the table was already describing something the engine
doesn't do.

## Consequences

- The DTOs (`StrategySummary`, `RegimeScenario`) live in `lib/api/types.ts`
  rather than beside the route, so a client component importing them can never
  pull a `server-only` module toward the browser bundle.
- The page needs a network round trip to render anything, where static content
  would not. It is cached with `staleTime: Infinity` — the registry changes on
  release, not on the hour.
- Prose that genuinely is prose — the pipeline description, the ruled-out list
  — is still authored in the component. Only claims with a value behind them
  are derived.
