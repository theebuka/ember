# 0032 — What a profile is allowed to hold

**Status:** accepted · phase 20

## Context

Phase 19 shipped accounts with one personal field: `display_name`, inherited
from the greeting. Phase 20 gives them a real Account screen, and a screen with
space on it is where scope creeps.

The pull is specific and it is worth naming. A finance app is *exactly* where
"date of birth, home address, income bracket, employment status, phone number"
starts to feel like the normal set — the Chime reference in the inspiration
folder asks for all of it across six screens, and it is right to, because Chime
issues a debit card and is legally obliged to know its customer.

**ember issues nothing.** It holds no money, executes no trade, and has no
counterparty. There is no KYC obligation to satisfy and no regulator to answer,
so every field is a straight cost: something to store, something to leak,
something to have to delete.

## Decision

**Five fields, and each one is used by something the user can see.**

| Field | What uses it |
|---|---|
| Preferred name | The greeting says it |
| First name | Greeting fallback; the name on a receipt when billing exists |
| Last name | The same |
| Country | Suggests a base currency during setup |
| Time zone | Every execution window is quoted in it — **detected, never asked** |

Email is deliberately not among them. It belongs to `auth.users`, changing it
requires a verification round trip, and a second copy in a synced table is a
copy that can disagree with the address you sign in with.

**Nothing is required and nothing is gated.** No completeness meter, no
progress ring, no "finish your profile" nudge. The greeting has a name-free
form and it is not a lesser one. A completion indicator on an optional form is
a way of telling someone their account is deficient in order to extract data
the product does not need.

**The time zone is detected rather than asked**, and that is the general rule
this table is written against: a question you can answer for someone is a
question you shouldn't ask.

### Deleting the account

Two gates, and they are different in kind. The first is a confirmation that
lists exactly what goes and what stays. The second requires **typing a phrase**.

A confirmation dialog is a reflex — anyone who has used a computer clears one
without reading it. Typing cannot be done by reflex, and that is the only
property that matters for an action with no undo.

This does not contradict [ADR 0015](0015-one-confirmation-dialog-and-it-is-earned.md),
which says ember has exactly one confirmation dialog and everything else gets
an undo. It is the same rule at a stronger point on the scale: Reset everything
is undoable in principle and merely inconvenient in practice, while deleting an
account removes rows on a server this client cannot restore. Where an undo is
impossible, a gate is what is left, and the gate scales with the damage.

**It says what it does not delete.** The copy in this browser stays, because
`localStorage` is not reachable from a row deletion. A user who deletes their
account and then finds their book still there would reasonably conclude the
deletion failed — so it is said beforehand, with a checkbox to clear the local
copy too.

**Rows first, sign-out second.** The other order signs the user out and then
attempts the deletes as an anonymous client, which RLS correctly refuses —
leaving an account that looks deleted and isn't.

## Consequences

**`displayName` moved out of preferences**, and the two now sync to different
tables. `use-profile` adopts the old value on first load rather than migrating
across stores, and the old key is not deleted: a user who somehow downgrades
keeps their greeting instead of losing it to a one-way migration.

**The full ISO 3166 list, named through `Intl`.** A curated list is shorter and
means deciding whose country counts; the cutoff is always arbitrary and always
wrong for somebody. The locale is pinned to `en-US` for the reason decision 016
pins the number formatter — otherwise the options are named by the server's
locale during SSR and the browser's at hydration, which is a mismatch on every
row of the select.

**The currency suggestion applies once, during setup, and never again.**
Changing your country in settings must not silently re-denominate a book you
have been reading in dollars for a year — a much larger change than the one the
user made.

## Alternatives considered

**Ask for everything now, use it later.** The version that feels efficient.
Every field collected before there is a feature that reads it is a field that
will be in a breach notification without ever having been useful.

**A single "Name" field.** Simpler, and it collapses two different things: what
to call you, and what to put on a receipt. Splitting them is why "Preferred
name" exists as its own row rather than as the only row.

**Soft-delete the account with a 30-day recovery window.** What most products
do, and it is defensible — but it means "delete" doesn't delete, which has to
be disclosed, at which point the button is doing something other than what it
says. Worth revisiting when there is billing to unwind; not worth the asterisk
now.

**A password confirmation on delete.** The obvious second gate, and impossible
here: [ADR 0031](0031-accounts-are-optional-and-the-ledger-is-local-first.md)
has no password. Re-sending a magic link to confirm a deletion would work and
puts an email round trip in the middle of a destructive flow, where a user who
loses the tab has no idea whether it happened.
