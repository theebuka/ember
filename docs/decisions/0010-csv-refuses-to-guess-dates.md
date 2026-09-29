# 0010 — The CSV importer infers date order per file, and refuses to guess

**Status:** accepted · phase 3

## Context

`03/04/2025` is 3 April to most of the world and 4 March in the United States.
Broker exports use both, and almost none of them say which.

Getting it wrong is not a cosmetic error. A trade moved into the wrong month
sits on the wrong side of other trades in the average-cost walk, which changes
the cost basis, which changes unrealized P&L, which changes every figure on the
dashboard. And it does all of that silently — the import succeeds, the row
looks plausible, and nothing ever surfaces the mistake.

## Decision

Three rules:

1. **`YYYY-MM-DD` is always unambiguous** and parsed directly.
2. **Slash dates are resolved for the whole file, not per row.** Any row with a
   component above 12 settles the order for every row. Deciding per row would
   put two trades from one statement in different months.
3. **If nothing in the file settles it, no slash date is imported.** Every such
   row is flagged, and the preview explains why and how to fix it — re-export
   as ISO, or change one date and the rest follow.

Rule 3 is the one worth defending. Refusing is a worse first-run experience
than guessing, and it is the only honest option: a coin-flip on the user's cost
basis, presented as a successful import, is exactly the "plausible-looking
wrongness" this product cannot ship.

## Alternatives considered

**Assume the user's locale.** Feels smart, fails for anyone importing a US
broker's export from outside the US — which, given where this app is being
built, is the common case rather than the edge case.

**Assume `DD/MM` because most of the world uses it.** Same problem, different
majority.

**Ask the user with a toggle.** Reasonable, and worth adding if real files turn
out to be ambiguous often. Deliberately not built first: it is a question most
users cannot answer with confidence about a file they exported and never
opened, and offering a toggle invites a confident wrong answer where refusing
invites a correct re-export.

## Consequences

- Files with only same-month, low-numbered dates are rejected wholesale. Rare,
  and loudly explained when it happens.
- `detectDateOrder` is exported and unit tested independently, including the
  ambiguous case — it's the piece most likely to be "improved" later by someone
  who hasn't hit the failure it prevents.
