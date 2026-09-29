# 0008 — The sample book is offered, never seeded

**Status:** accepted · phase 2

## Context

An empty dashboard can't demonstrate the product. The value hero, the
allocation split, the positions list and the "does this touch anything I own"
cross-reference on advice all need holdings to work on, and a new user has
none. The brief also asks that the app "feel complete enough that I can click
around and understand the product".

The usual answer is to seed demo data on first run.

## Decision

Ship a sample book, but behind an explicit action — a second button on the
empty state, `Explore with sample data`, beside the real one. When it is
loaded:

- the store carries an `isSample` flag,
- a line under the hero says *"This is the sample book — none of these are your
  holdings"*, with `Clear it` next to it,
- adding a real transaction clears the flag, because a book you've traded in is
  yours.

## Alternatives considered

**Seed silently on first run.** Standard practice, and wrong here. A finance
app that shows you a portfolio you never entered has broken the one thing it
must not break: that its numbers describe you. Even labelled, a book the user
didn't ask for teaches them that the numbers on this screen might be made up —
which is the exact suspicion the whole product is fighting.

**A separate demo mode or route.** A parallel code path, and the thing being
demonstrated stops being the thing being shipped. It also can't be reached
from the empty state, which is where the question actually gets asked.

**Nothing — a bare empty state.** Honest and useless. The user cannot evaluate
a portfolio tracker without a portfolio, and asking them to hand-enter eight
trades before seeing whether the app is any good is a conversion funnel with a
wall in it.

## Consequences

- Every screen that shows holdings has to be able to render the sample notice.
  One flag on the store, read where it matters.
- Screenshots for the case study are taken on the sample book, which is
  reproducible — the transactions are fixed and the price generator is
  deterministic, so the same figures come out every time.
