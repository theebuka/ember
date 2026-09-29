# 0031 — Accounts are optional, and the ledger stays local-first

**Status:** accepted · phase 19

## Context

CLAUDE.md §9 has had auth as the next thing for four phases, for three reasons:
nothing is monetisable without accounts, the ledger should survive a cleared
browser, and three deferred features (push while closed, the daily digest, a
real cache) are all waiting on a server that knows who you are.

The obvious way to build it is the way most apps do: a sign-in wall, a database
as the source of truth, and the client as a view onto it. That would be wrong
here for reasons this codebase has already argued twice.

**ADR 0007** made market data optional — a mock provider means the whole
product works with no API keys, and turning on real data is a config change
rather than a code change. **CLAUDE.md §7** rules out spend before revenue, and
a free-tier Supabase project *pauses*. An app that hard-requires one is an app
that is down when the project sleeps.

And the ledger is the one thing in ember the user typed by hand. Everything
else — positions, cost basis, P&L, findings, the track record — is recomputed
from it on every render. Moving the source of truth to a network makes the
cheapest, most reliable part of the app depend on the least reliable one.

## Decision

**Local-first, with optional sync.** `localStorage` remains what every screen
reads from. Sync pushes and pulls around it.

- **No project configured → the app is exactly what it was.** `AUTH_CONFIGURED`
  is read at module scope, so it inlines at build time. No sign-in control
  renders anywhere, and the settings section is *absent* rather than disabled:
  a greyed-out row claims a setting exists and is currently unavailable, which
  is a different and false statement.
- **Signed out with a project configured** is a first-class state too. You get
  a standing notice saying your ledger lives on this device, and everything
  works.
- **A magic link, and no password field.** A password means ember is in the
  business of storing, resetting and being breached for credentials, to protect
  a ledger the user can retype. It also removes the account-enumeration problem
  — "wrong password" and "no such account" leak whether an address is
  registered, and a magic link says the same sentence either way.
- **Last write wins, per row, with tombstones** (`lib/sync/merge.ts`, tested).
- **RLS on every table, `auth.uid()` policies, no exceptions.** The anon key
  ships in the browser bundle by design, so RLS is not a second line of defence
  — it is the only one. The service-role key appears nowhere in `src/`.

### What is stored

The transaction log, preferences, the watchlist, and an email address.

That is the whole list, and it is the same reasoning ADR 0025 used for
`/api/findings`: the server holds the minimum needed to hand your book back on
another device and recomputes everything else per request. So there is **no
holdings table** (CLAUDE.md §5 — a second copy could only ever disagree with
the log), no positions, no realised P&L, no assessments, no findings, no alert
history, and nothing about the device.

`sidebarCollapsed` and `hasOnboarded` are deliberately excluded from the
preference sync. They are facts about *a device*: a collapsed rail on a laptop
says nothing about a phone, and syncing `hasOnboarded` would skip setup on a
device that has never run it — including the cookie write that setup exists to
perform (ADR 0014).

## Consequences

**One edit can lose.** The same trade edited on two devices between syncs
resolves to the later write and the earlier one is gone. That is the accepted
cost of last-write-wins, and it is why the merge is a tested pure function
rather than a few lines inside the hook. Whole-document LWW — the simpler
option — would have been much worse: logging a trade on a phone would silently
discard the three logged on a laptop that morning, and the survivor looks
perfectly coherent, so nobody notices.

**Deletions are rows, not absences.** A device that has been offline cannot
tell "this was deleted" from "I haven't been told about this yet", and guessing
the second pushes deleted trades back up. So the client keeps tombstones and
the server keeps `deleted_at`.

**`updated_at` belongs to the client, and there is no trigger.** The obvious
`before update set updated_at = now()` is wrong for every table the sync
touches: it stamps arrival rather than authorship, so a device that syncs late
always wins. Edit on your laptop, edit differently on your phone an hour
earlier, open the laptop last, and the phone's older edit is written with a
newer server timestamp and beats it.

**None of it is verified against a live project.** No Supabase project exists
yet, so the gate runs — and passes — in the unconfigured mode, which is the
mode it exercises. The merge has 20 tests; the wire format, the RLS policies
and the auth flow have been reasoned about and not observed. That is recorded
in CLAUDE.md §8 rather than glossed.

## Alternatives considered

**Server as source of truth, client as a view.** The conventional shape. It
turns every screen into a loading state, breaks offline entirely, and makes a
paused free-tier project look like a data-loss event. It also throws away the
property that makes this app fast: derivation from a local array.

**Sync the derived portfolio as well, to save recomputing it.** Tempting, and
it contradicts the rule the whole product rests on. Holdings are derived, never
stored (ADR 0004) — a stored copy is a copy that can disagree with the ledger,
and the sync would then have to reconcile *two* representations of the same
fact.

**CRDTs.** Correct, and enormously more machinery than a single user on two
devices needs. Every table here is single-user behind RLS; there is no
concurrent-editing problem to solve, only a two-device ordering one.

**Passwords, or OAuth with Google/Apple.** Passwords are covered above. OAuth
is a reasonable future addition and a poor first one: it needs per-provider
setup, and the sign-in screen would be making three claims about identity
providers before ember has made one about itself.

**Waiting for auth to also deliver push-while-closed.** They are separable, and
bundling them would mean shipping neither for another phase. Push needs VAPID
keys and a server holding a subscription per user; the handlers in
`public/sw.js` are still waiting, and the notification centre now says so on
the screen rather than only in settings.
