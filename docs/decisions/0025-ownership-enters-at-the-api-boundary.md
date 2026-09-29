# 0025 — Ownership enters at the API boundary, and it costs a privacy property

**Status:** accepted · phase 15

## Context

ember was built to be an autonomous alpha finder. Through v1 it was a browser
of engine output: you navigated to Advice and read what the engine thought.

The structural reason is one line. `assess()` (`lib/signals/ensemble.ts`) takes
candles and a risk profile, and **has no idea what you own**. Everything
downstream inherits that. The stop it computes is anchored to last close for a
hypothetical new position, so on a `reduce` it sits *above* price — a
short-side stop, not a loss stop on the long the user actually holds. There is
no drawdown from an entry, no notion that the regime turned since the position
was opened, and nothing that can ever say *this one has stopped working, here
is how much to take off*. The portfolio join happened client-side in
`advice-screen.tsx`, purely to render "you hold 4.2%".

So the loss-prevention half of the product — half the reason the user asked for
it — did not exist, and could not be built without ownership reaching the
engine.

## Decision

**Ownership enters at the API boundary. The engine stays pure.**

`assess()` is unchanged. A new pure module, `lib/signals/exposure.ts`, takes a
position plus its assessment and its candles and returns zero or more
`RiskSignal`s. `lib/signals/findings.ts` combines both halves into one ranked
list of `Finding`s. The join happens on the server, in `getFindings()`, over
positions the client derived from its own ledger.

Three things fall out of putting the seam there rather than anywhere else:

- The engine stays a pure function of candles and a profile, so it stays
  testable against fixtures rather than against a book.
- It stays out of the browser bundle, which `server-only` enforces and which a
  grep of the production chunks verifies (CLAUDE.md §4).
- The client keeps deriving holdings from the transaction log, so the
  derived-not-stored rule survives intact.

**`/api/findings` is a POST**, because the answer depends on the caller. A book
in a query string would be personal data in a URL — logged by every proxy in
between — and would exceed what those proxies accept somewhere around thirty
positions.

## The cost, stated plainly

**Until this phase, nothing about the user left their device.** That was true
and the settings screen said so.

It is no longer true. Each findings request carries, per open position:

| Field | Why it is needed |
|---|---|
| `symbol` | Which instrument the exposure is in |
| `quantity` | Sizing the response — "reduce to 8%" has to become units |
| `averageCost` | The stop and the drawdown are both measured *from the entry*. This is the whole point |
| `openedAt` | Reconstructing the read as it stood when the position was opened, for thesis decay |

And deliberately **not**: the transaction log, individual trade prices or
dates, fees, account names, closed positions, realised P&L, or the base
currency. Weight is not sent either — the server computes each position's share
of the book from prices it already has, so asking for it would put a number on
the wire that the server could derive for free and would then be trusting a
client to have derived correctly.

Nothing is persisted server-side. The route answers and forgets; the only
caches are the universe and the per-profile assessments, neither of which
contains anything about a user.

This is stated in three places, because a privacy property that quietly expires
is worse than one never claimed: the settings copy (which previously read
"nothing is sent anywhere" and had to be *replaced*, not softened), CLAUDE.md
§8, and the route handler itself.

## Alternatives considered

**Run the exposure engine in the browser.** It is pure and it would work. It
would also mean shipping the strategies, the indicators and the regime filter
into the client bundle to produce the assessment each risk signal is evaluated
against — which is the one architectural rule the codebase actually enforces at
build time, and the reason live data can drop in without touching a screen.
Rejected.

**Send the transaction log.** Simplest, and strictly more capable — FIFO cost
basis and per-lot stops both need it. Rejected because it is a superset of what
the feature requires, and "we send everything because one day we might need it"
is exactly the reasoning that produces the privacy posture ember is positioned
against. When accounts land the log will live on a server anyway; that will be
a decision the user makes by signing up, not one made for them by a risk
warning.

**Keep the stop the engine already computes.** Free, and wrong in a way that
looks right: it is anchored to last close for a position opened today, so it
tells someone who is 30% underwater that their stop is 3% below the current
price. A number that is precise, plausible and about somebody else.

**Wait for accounts.** The honest option, and the one that defers the entire
loss-prevention half of the product behind auth, payments and a database.
Rejected: it is the feature the user asked for first.

## Consequences

- `HandledCall` and `AlertRecord` both re-key from `symbol` to `kind:symbol`. A
  risk and an opportunity can be live on the same instrument at once — a
  position over its concentration cap while the read still says accumulate —
  and with a shared key, dismissing or alerting one silently consumed the
  other. Both stores reset on migration rather than translate, because every
  stored entry suppresses something whose window has since closed.
- `Position` gains `openedAt`, tracking the start of the *current* exposure
  rather than the first trade in the symbol. Someone who bought in 2019, exited
  in 2023 and bought back last month has held this position for a month.
- `isActionable()` splits into `qualifies()` and `isReady()` — see the note in
  `ensemble.ts`. The backtest moves to `qualifies()`, which changes what it
  measures and invalidated the figures quoted in CLAUDE.md §8.
- The findings response is capped at twelve, ranked by urgency across both
  kinds. Measured on the expanded universe it was thirty-one, and an inbox of
  thirty-one items is a list — which is what ember already had.
