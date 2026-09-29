# 0009 — The transaction form validates the whole ledger, not the row

**Status:** accepted · phase 3

## Context

Holdings are derived from the transaction log (ADR 0004), which means the log
has one invariant: you cannot sell what you did not hold. `derive.ts` clamps a
sell that breaks it, so a single bad row cannot poison every figure downstream
— but clamping is a safety net, not a policy. Clamped silently, the user's
numbers stop matching their broker and nothing on screen says why.

The obvious place to enforce it is the form, and the obvious check is "does
this sell exceed the holding on this date".

That check is wrong, and it shipped wrong. It only fires on **sells** — and the
case that actually breaks a ledger is editing a **buy**:

```
12 Mar   buy  55 NVDA
 3 Jul   sell 20 NVDA      ← fine

edit the March buy from 55 to 10
                           ← the July sale now sells shares that never existed
```

The edited row is a buy, so a sell-scoped check waves it through. It was caught
by driving the form in a browser, not by the tests written alongside it.

## Decision

The candidate row is merged into a copy of the log and the affected symbols are
re-walked end to end. Specifically:

- **Both sides are checked.** A buy can invalidate a later sell.
- **Both symbols are checked when editing.** Retargeting a NVDA buy at AAPL
  orphans the NVDA sales behind it.
- **The reported break may be a different row.** The message names the later
  sale and its date, because "you only hold 10" is baffling when the form on
  screen is for a date three months earlier.
- **The baseline is the ledger as it currently stands.** A change is blocked
  only if it creates a shortfall or deepens an existing one.

That last point is not a nicety. CSV import warns about a shortfall and imports
anyway, so a symbol can already be short — and the natural repair is to add the
missing buy. Measuring against "the log without this row" instead of "the log
as it is" makes every edit look like an improvement and blocks nothing; that
bug was also written, and also caught, before this settled.

## Alternatives considered

**Check only the row being submitted.** Cheapest, and misses the edit case
entirely. This is what most portfolio trackers do, and it is why their ledgers
drift.

**Allow negative positions and model shorts.** A real feature, and a much
larger one — margin, borrow cost, unlimited downside on the P&L display. Out of
scope for v1, and allowing it accidentally is not the way to ship it.

**Validate on read instead of on write.** Every screen would need to render a
warning state, and the user would learn about the problem far from the row that
caused it.

## Consequences

- Validation is O(n) over one symbol's transactions per keystroke on a
  validated field. At ledger sizes a person types by hand this is free; if
  imports ever run to tens of thousands of rows it should be memoised.
- The importer intentionally does **not** block on this — it warns and imports,
  because refusing a whole file over a shortfall the user can fix in the app
  afterwards is worse than importing it.
