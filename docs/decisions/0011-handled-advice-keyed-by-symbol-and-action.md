# 0011 — Handled recommendations are keyed by symbol and action, and expire

**Status:** accepted · phase 5

## Context

Executing or dismissing a recommendation has to stop it reappearing at the top
of the feed. The obvious key is the assessment's identity.

There isn't one. `assess()` runs on every request and stamps its result with
`now`, so the "same" call has a different `createdAt` sixty seconds later.
Keying on it would suppress nothing.

The deeper question is what a dismissal actually means. Not "hide this object"
— objects don't persist here — but *"I've dealt with what ember is telling me
about EURUSD."*

## Decision

Key on **symbol + action**, with an expiry:

```ts
{ [symbol]: { kind: "executed" | "dismissed", action, at, until } }
```

- **A different action resurfaces the call.** If the read flips from Sell to
  Buy, that is genuinely new information and suppressing it because the user
  dismissed a Sell last Tuesday would be withholding the thing they came for.
- **`until` is the end of that assessment's own execution window.** A
  dismissal lasts exactly as long as the call it dismissed. After 72 hours the
  situation is new and the user deserves to be asked again.

## Alternatives considered

**Key on `createdAt`.** Suppresses nothing, because it changes every cycle.

**Key on symbol alone, forever.** Dismissing one Sell would silently mute an
instrument permanently — the worst possible failure for a product whose value
is telling you when something changed.

**Hash the assessment's contents.** Stable-ish, but any drift in score or
confidence produces a new hash, so a call would resurface on every small
recalculation. It also makes the stored state unreadable, and a user should be
able to look at their own data and understand it.

**A fixed 24-hour expiry.** Arbitrary. The window is already the model's own
statement about how long this call is live; reusing it means the two can't
disagree.

## Consequences

- Two `Undo`s exist with different scopes, and they are labelled differently
  for it. The toast that fires on execute *removes the transaction it just
  wrote*. The button on the card, which can be pressed days later, only says
  **Reopen** — it puts the call back among the open ones and leaves the logged
  trade alone. Silently deleting a trade from three days ago would be
  indefensible.
- Handled entries accumulate one per symbol and are overwritten, so the store
  cannot grow beyond the size of the universe.
- Nothing prunes expired entries. They stop suppressing on read, which is
  enough at this scale; a sweep belongs with server-side storage.
