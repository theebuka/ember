# 0039 — The admin screen, and the word "ban"

**Status:** accepted
**Date:** 2026-08-17

## Context

ember needed a way to say something to everybody: a release note, a change to the
methodology, an outage. The `notices` table has existed since phase 19 and the
notification centre has read it since; nothing has ever written it, because the
only writer was going to be the Supabase dashboard.

The v3 plan asked for the other end of that table — a pinned banner on Home, an
`/admin` screen that composes broadcasts, an account-flagging control, and a log
of every admin write. It also flagged "let's discuss" against the admin half,
which was the right instinct: an admin panel is where a product decides what
power it is willing to hold over its own users, and this one is being built for a
product with none.

Two of the plan's own instructions turned out to be wrong when checked against
decisions already taken, and one of them is a security hole.

## Decision

### `is_admin` is not a column on `profiles`, and this is ADR 0038's hole again

The plan says "`is_admin` on `profiles` with RLS policies". That cannot ship.

`profiles` carries a `for all` policy keyed on `auth.uid() = id` — correct for a
display name, which is what the table exists for. **RLS is row-level, not
column-level.** A boolean on that table is a boolean the browser it constrains can
set: `update profiles set is_admin = true` would be accepted, and the account that
ran it could then broadcast to every user of the product.

This is exactly the argument ADR 0038 made three weeks earlier for `plan`, and it
is worth recording that the plan repeated the mistake for a second column — the
shape is *inviting*, because a flag about a user feels like it belongs on the
user's row. It does not. `admins` is its own table with a select-only policy: you
can read your own grant and nobody else's, and no client can write it at all.

`is_admin()` is a `security definer` function so a policy on `notices` can ask the
question without depending on `admins`' own policy — a policy evaluating a policy
is where recursive-RLS bugs come from, and that failure mode is a permission check
that silently returns false for everybody. `search_path` is pinned, the same
discipline `unsubscribe_digest` uses (ADR 0037).

### The admin writes as a signed-in user, and the service-role key stays out

Every other privileged job in this codebase is a script the scheduler runs, for
one reason: the service-role key must never appear under `src/`, and a route that
can read every user's rows would need it (ADR 0037).

Broadcasting is the one case where that shape is wrong. It is a person writing
prose with a preview in front of them, and routing it through a script would mean
composing a message to every user of the product in SQL, unreviewed, with no
preview at all. So the privilege lives in RLS instead: `is_admin()` gates writes to
three tables, the browser holds nothing but the ordinary anon key, and the rule
about the service role is untouched.

**The screen is not the permission.** Hiding `/admin` from a non-admin is a
courtesy; the refusal happens in Postgres. That is what makes it safe to render
the route to anybody who types the URL — and it is why there is no redirect on it.
A route that answers differently for an admin tells a prober that it matters.

### "Ban" is a lie in this product, and the control is named after what it does

Every admin panel in every product calls this Ban. Here it would be false, and
falsest on the one screen where power is exercised.

ember works fully with no account (ADR 0031): the ledger is local-first, the engine
answers anonymously, and the methodology and track record are public by design
(decision 051). **There is no server-side state whose removal stops somebody using
ember.** What a suspension can do is exactly three things — stop sync writes, stop
the email digest, stop push — so the control reads **"Suspend sync and delivery"**
and the panel lists both what it stops and what it cannot touch, so an admin
cannot come away believing they did more than they did.

Two consequences follow from taking that seriously:

**It is enforced, not merely recorded.** The three synced tables' policies are
split — reads always allowed, writes additionally requiring `not
is_suspended()` — and `scripts/send-digests.mjs` drops suspended recipients before
anything else runs. That second half matters more than it looks: the sender
authenticates with the service role, so RLS does not apply to it, and a suspension
that only lived in RLS would suspend sync while the digests kept going out.

**The suspended user is told.** The row is readable by its owner and the reason is
shown to them as a standing warning in the notification centre. A restriction
somebody cannot see is indistinguishable from a bug, and they would reasonably
spend a day believing sync was broken. The warning also says what still works,
because for a local-first app that is nearly everything, and a warning that
implies more was taken than was taken is its own dishonesty.

**Reads are untouched, deliberately.** A suspended user keeps every trade they
typed and can still pull it down onto a new device. Same rule `entitlements` states
for a lapsed plan (decision 185): nothing is taken away.

### There is no directory of users

An account is suspended by pasting its id, not by picking it from a list. Building
the list means an admin-wide select policy over `profiles`, which is a blanket read
of every user's name and time zone, granted to solve a problem ember does not have
— there is no support queue, and an admin who needs to find somebody has the
Supabase dashboard, where the read is at least in somebody else's logs.

A wrong id is caught by the foreign key rather than by a lookup, which is the
property that makes the narrow version work: the database answers "no such
account" without this screen ever being able to ask "which accounts exist".

### The preview is the same component the reader sees

`NoticeRow` moved out of `notifications-screen.tsx` so the composer can render it.
An admin about to message every user should be looking at the message as every user
will see it — the same icon, the same wrap, the same "→" on the action label. A
preview assembled from lookalike markup is correct until one of the two changes,
and the change that breaks it will not announce itself. Same argument as ADR 0012's
methodology page being derived from the registry rather than transcribed.

### The log is append-only and it is on the screen

`admin_log` has a select policy and an insert policy whose with-check pins `actor`
to `auth.uid()`. No update policy, no delete policy: **a log an admin can tidy is
not a log.**

It is rendered on the screen rather than left in the database, because an audit
trail nobody reads is decoration — the value of a log is that the person about to
take an action can see the last ten.

The append is not atomic with the action it describes, and that is a choice rather
than an oversight. PostgREST gives the browser one statement at a time, so the
alternatives were a stored procedure per action — which would move the composer's
logic into SQL for atomicity between two rows nobody reads together — or a
best-effort append after the fact. The failure this leaves open is an action with
no log line, which is visible and is the right direction to fail in; the reverse, a
log line for an action that did not happen, cannot occur, because the log is
written only after the action succeeds.

### One banner, above the greeting, and dismissing is not reading

A pinned broadcast is an interruption — the reader opened ember to look at a
balance and is being told something else first. That earns exactly one slot, and it
sits above the greeting rather than between the greeting and the balance, because
the greeting is the app addressing *you* and a service announcement dropped into
the middle of that breaks a single thought in half. Decision 082 already settled
that this screen has one focal point.

**Dismissal is by notice id, per device, and it is not the same as reading.** The
notice stays in the notification centre, still unread, still counted by the badge.
A banner that swallowed the message would make dismissing it the fastest way to
lose it. Dismissals also survive Clear, which empties the alert *history* — a
banner somebody closed is not an alert ember delivered, and resetting them together
would republish every pinned broadcast to anybody who tidied their inbox.

## Alternatives considered

**`is_admin` on `profiles`, as the plan specified.** A self-grantable
administrator flag. Rejected on the argument above; recorded here because the
instinct to put a fact about a user on the user's row is strong enough to have
produced the same bug twice in one plan.

**An admin-wide read over `profiles`, to list accounts.** Rejected: it is the
largest privacy grant in the schema, bought for a nicer form field.

**An authenticated API route holding the service role.** The shape ADR 0037 already
rejected for delivery, and it is worse here — the thing being protected is the
ability to message every user, and a shared secret in front of a service-role key
is not the same as not having the key.

**A drafts table and a scheduling control.** `published_at` already defaults to
`now()` and the existing select policy admits only rows whose timestamp has passed,
so a scheduled broadcast is a row rather than a job. A drafts *table* would be a
second thing to build for a screen with, today, one user. Withdrawing is one press
and takes effect immediately, which is the affordance that actually matters.

**An undo on withdraw.** Everywhere else in ember an undo beats a dialog (ADR
0015). Here it would misdescribe what happened: the broadcast has already been read
by whoever had the app open, and putting the row back does not unsend it. The toast
says so instead.

**Tinting the suspension warning `critical`.** It is the most consequential
condition in the notification centre. The `critical` tint is `down`, and `down`
means money moved — borrowing it for an account state blurs the one distinction the
palette exists to keep (decision 077, and the same rule ADR 0038 applied to
upsells). It leads the list instead, which is hierarchy that costs nothing.

**Reserving space for the banner.** Rejected. A pin is rare by design, and holding
an empty band at the top of Home on every ordinary day to avoid a settle on the
rare one is a worse trade every time.

## What using it once exposed

The screen was built, audited, captured and shipped. Then a real broadcast was
published through it, and three defects appeared that **68 page audits, 66
screenshots and 356 tests had all passed over** — because every one of them
needed a row in a table no machine check here can write.

**The broadcasts query had never run, since phase 19.** `useBroadcasts` passed
`initialData` with no `initialDataUpdatedAt`. React Query stamps initial data as
fetched *now*, so a ten-minute `staleTime` made it fresh on arrival and it refused
to fetch on mount — `/api/notices` was simply never called on a normal page load,
and the app served the four notices compiled into the build as if they were the
whole table.

Nothing caught that for nine phases because the `notices` table had never had a
row in it: the seeded answer and the real one were identical, so a query that
never ran was indistinguishable from one that did. The symptoms when it finally
mattered were a good puzzle — the broadcast appeared for the admin who published
it and for nobody else, and vanished from the admin's own screen on reload —
and they have one cause: publishing calls `invalidateQueries`, and an
invalidation ignores `staleTime`.

**The composer shipped a 404 to every reader.** The link field was free text
validated by `startsWith("/")`, which catches an external URL and nothing else, so
`/announcements/first-ever` published cleanly. Nothing in a browser can ask
Next.js whether a route resolves, so a stricter regex would only have agreed with
itself more confidently. The field is a select over a fixed list now, with no
custom-path escape hatch — that hatch gets used exactly once, in a hurry, on the
announcement that most needs to be right — and `/api/notices` drops an
unresolvable `href` on the way out, which repairs rows already sent.

**The banner's height was authored copy.** This document predicted "~76px" of
insert. Measured, the first broadcast ran to 230 characters, the banner came out
about 450px tall on a phone, and Home measured **0.253** of layout shift — two and
a half times the gate, on the screen with the tightest budget in the app.

Clamping title and body to two lines each took it to **0.157**. Better, still
over, and the real lesson: **the size of the insert was never the problem, the
insert was.** So the dismissals moved into a cookie (`ember_pins`), the server
resolves which pin to draw and paints it with the page, and Home measures
**0.0000** with a live pin on screen — its Lighthouse CLS actually *fell*, 0.092
to 0.041, because the banner absorbs part of the empty-book settle. That is ADR
0014's pattern, which §9 has been carrying since phase 17 as the answer to the
app's remaining layout shift; this is the first place it was actually spent.

The clamp stayed regardless, because it is the better design independently: **a
pin is a summons, not the message**, and the full text is one tap away in the
notification centre where it is not competing with a balance.

The costs, both taken deliberately: `/` is no longer prerendered, because it reads
a cookie; and the notices read is memoised for thirty seconds so resolving a
banner that renders on almost no visit is not a Postgres round trip in the landing
page's critical path. The admin composer deliberately bypasses that memo and
queries the table directly — otherwise an admin publishes something and watches it
not appear, which is precisely the symptom that made this whole failure so hard to
read.

Fixing the query then exposed a fourth, one screen over: with stored rows finally
arriving, the notification centre grew by two notices a round trip after paint —
0.103 against a gate of 0.1, on a screen that had measured 0.002. Its page wrapper
reads the broadcasts on the server now, so they are in the first paint.

The general lesson is not "test more". It is that **a feature whose first real use
is its first real test should be used once before it is called done**, and that
for anything gated on a row in a database, the gate is structurally blind.

## Consequences

- **`0006` is not applied**, so none of this has ever run. Probed against the live
  project on 2026-08-17: `admins`, `suspensions` and `admin_log` all 404, and
  `notices.pinned` answers 400. `0001`–`0005` *are* applied, which corrects a §8
  entry that had been claiming `0005` was outstanding — the second phase running
  where measuring the project found the document wrong about it.
- **The gate cannot reach any of it.** `/admin` is audited and captured in its
  signed-out state, which is what every visitor but one sees; the composer, the
  suspension panel and the log need an `admins` row and a session, so they are
  unphotographed and unaudited. Same class of gap as the upsell interstitial
  (phase 27) and the command menu (decision 052).
- **Adding `pinned` to the notices select broke the route, and measuring found
  it.** PostgREST answers **400** for a select naming a column that does not exist
  rather than omitting it, so `/api/notices` would have failed outright on every
  deployment running `0005` and not `0006` — which is the live project right now.
  The route selects `*` and maps to an explicit shape instead.
- **Non-admin writes to `notices` are refused, verified against the live project.**
  An anonymous insert answers `401` with `42501 — new row violates row-level
  security policy`. That is today's state, with no write policy at all; the same
  check has to be repeated against a real signed-in non-admin once `0006` lands,
  and that needs a human with an inbox.
- **Two extra reads per page for a signed-in user.** `useSuspension` runs wherever
  the bell renders. It is one primary-key lookup and it degrades to "not suspended"
  when the table does not exist, but it is a cost, and it is the price of being able
  to say *why* sync stopped rather than letting it look broken.
