# 0004 — Holdings are derived from a transaction log, never stored

**Status:** accepted · **Date:** 2026-08-12

## Context

The client asked to log the assets they own so current value can be the hero
of the home screen, and separately asked for realized P&L and a transaction
history. Those are the same data seen from two angles.

The obvious model — a `holdings` table with `quantity` and `averageCost`,
updated on each trade — is what most trackers do.

## Decision

Persist **only** a transaction log. Every position figure is derived from it
by pure functions in `src/lib/portfolio/derive.ts`:

```
transactions ──► quantity, average cost, market value,
                 unrealized P&L, realized P&L, day change, allocation weight
```

"Add a holding" and "log a buy" become the same action, with one form.

## Alternatives considered

**Stored holdings, updated per trade.** Simpler to read, and cheaper per
render. Rejected because it has two sources of truth for the same fact. Every
edit or deletion of a historical trade has to correctly rewind an aggregate,
and any bug there produces a portfolio that silently disagrees with its own
history — the worst possible failure in a money app, because it looks fine.

**Stored holdings *plus* a log, reconciled periodically.** Rejected: it keeps
the desync bug and adds reconciliation code to hide it.

**Per-lot FIFO from day one.** Deferred rather than rejected. Average cost is
the right v1 default — it's the convention outside the US, it's what most
users can reproduce by hand, and it needs no lot-selection UI. FIFO becomes a
settings toggle when tax reporting arrives; the transaction log already
carries everything FIFO needs.

## Consequences

- Derivation runs on every render of the portfolio and dashboard. It is O(n)
  over transactions and memoised; for a realistic personal ledger this is far
  below the cost of a single chart render.
- Correctness is testable without a UI, and is: `derive.ts` is pure, and its
  tests hand-calculate the expected cost basis and realized P&L.
- Migrating to a real database means moving the log, not reconciling
  aggregates.
- Adding a `holdings` store later would reintroduce exactly the bug this
  avoids. Recorded in `CLAUDE.md` as a rule.
