# 0037 — The server reaches you, and the key stays out of `src/`

**Status:** accepted
**Date:** 2026-08-17

## Context

Since phase 9 every alert ember has fired came from a timer in an open tab. A
window that opened overnight was recorded in the inbox and never delivered, and
§8 has carried that as a stated limit for five phases: *autonomous, while a tab
is open.* The `push` handler in `public/sw.js` was written in phase 9 and has been
unreachable ever since — deliberately, because the payload shape only wants
deciding once.

The obstacle was never the browser. It is that **sending requires reading every
recipient's row**, and row-level security correctly forbids that to the anon key.
So delivery needs the service-role key, and the one rule this codebase treats as
absolute is that the service-role key never appears under `src/`.

## Decision

**The sender is a script, not a route** (`scripts/send-digests.mjs`), invoked by
GitHub Actions. The same boundary `collect-ngx.mjs` and `ngx_daily` already use:
one scheduled process can write, and the application can only read.

The plan for this phase said "a GitHub Actions cron against an authenticated
route". That was the wrong shape and it is worth saying why: any route capable of
reading all users' watchlists needs the elevated key, so "authenticated route"
just moves the forbidden credential into `src/` and puts a shared secret in front
of it. A script needs no shared secret, because possession of the key *is* the
authentication.

It also has a benefit the route version does not: **the engine stays exactly where
it is.** The script does not import `lib/signals`; it asks the running app over
HTTP, one `/api/advice` request per *risk profile*, shared by every recipient on
that profile. That is the useful half of the phase 14–16 review's caching
argument — compute once, deliver many — without the WebSockets, which at zero
users would be a costume.

**Unsubscribe works signed out, through Postgres rather than through a key.** An
unsubscribe link that asks you to log in first is not an unsubscribe link. The
privilege lives in a `security definer` function, `unsubscribe_digest(token)`,
granted to `anon`: it can flip one boolean on one row, chosen by a value the
caller must already hold, and it can do nothing else. `search_path` is pinned,
because a `security definer` function resolving names through the caller's path is
a privilege escalation waiting to happen.

**Push and email are deliberately not symmetrical, and the copy says so.** Push
carries everything, including a warning about a position you hold. Email cannot:
loss prevention needs holdings, and holdings never persist on the server — ADR
0025 sends four derived numbers per request and stores none of them. So a digest
is scoped to the **watchlist**, which does sync. That difference is stated in the
settings panel and in the email footer rather than left for someone to discover by
trusting an email to do the one thing it structurally cannot.

**Batched, with a floor, and the cron cadence is derived from the floor.** The
trigger is "a few opportunities have shown up", so the failure mode to design
against is not silence but an app that mails you twice on a busy Tuesday. Email
holds at 20 hours (daily) or 6 days (weekly) — under the nominal period on
purpose, because a job that demands a full 24 hours skips every other day the
moment the runner starts a minute late. Push holds at 2 hours and will not repeat
a symbol inside 24. **The push cron runs every two hours because the floor is two
hours**: a tighter schedule cannot deliver anything a looser one misses, it can
only burn runner minutes proving it.

**Nothing stores an email address.** `email_prefs` keys on `user_id` and the
sender resolves the address from `auth.users` at send time. A second copy of
everyone's email in a public-schema table is a liability with no upside.

## Alternatives considered

**A route with the service-role key, behind a shared secret.** What the plan
described. Rejected above.

**Vercel cron or Supabase `pg_cron`.** Both tie the schedule to a piece of
infrastructure §7 says has to change: Vercel Hobby forbids commercial use and has
to be migrated before ember charges anybody. A workflow in the repository moves
when the repository does.

**A separate "push enabled" switch in settings.** Subscribing *is* the preference.
A switch that can disagree with the browser's own permission is a setting that
lies half the time — decision 046's reasoning, and decision 047's objection to a
disabled control.

**Storing the risk profile on the subscription row** so the sender need not read
`preferences`. It would put the profile in two places, and the one in
`preferences` is the one the app syncs — so the copy would go stale the first time
someone changed it on another device.

**A column named `auth` on `push_subscriptions`**, which is what the web-push spec
calls it. Renamed to `auth_secret`: `auth` is also the schema `auth.uid()` lives
in, and a column of that name on a table whose RLS policy calls `auth.uid()` is an
ambiguity waiting for the planner to resolve the wrong way.

**A tracking pixel in the digest.** Never. A mail that phones home about whether
you opened it is not the register this product is written in, and the one thing an
ad-free finance app has is that it is not watching you.

## What was deferred again, and why the reason changed

**The Supabase warm store.** Phase 22 planned a `series_cache` table and deferred
it here on the grounds that "a store with nothing scheduled to fill it is half a
feature, and the cron that would fill it lands in phase 26". The cron now exists,
so that reason has expired — and the store is still not built, for a different
reason that only became visible on attempting it.

The obstacle is a shape mismatch, not a schedule. `providers/live/cache.ts` is
generic over its value type — `yahoo-daily` stores `{ candles, meta }`,
`coingecko-daily` stores `Candle[]`, `frankfurter-history` stores one rate table
for every FX pair at once — while the only process allowed to *write* the store is
a script running outside the app. So filling it requires one of:

- **the writer duplicating provider logic**, which is a second code path that can
  drift from the one the app actually uses;
- **a route that dumps the in-memory cache** for the script to persist, which is a
  new endpoint whose whole job is to export data from an upstream §7 already
  records as unlicensed;
- **a per-symbol read tier**, which is 214 round trips at load and slower than the
  8-second deadline it would be replacing.

None of those is a five-minute change, and a cache that serves one instrument's
bars under another instrument's key is a wrong stop on somebody's position. The
migration for it was written and then deleted rather than left in place: an unused
table in a migration is worse than no table, because the next person reads it as
something that works.

The load deadline (`LOAD_DEADLINE_MS`, phase 22) is what makes this safe to keep
deferring — a cold container is 8 seconds and honest about it. Recorded in §8 as a
design problem with three named options, which is a more useful state than a
scheduling excuse.

## Consequences

- **`public/sw.js`'s `push` handler is live and did not have to change**, five
  phases after it was written. That is the argument for having written it early.
- **Every push shows a notification**, because the subscription is created with
  `userVisibleOnly: true`. A Chrome requirement, and also a promise: a silent push
  is a background wake-up, and an app that quietly runs code on your device
  because a server asked it to is not what was consented to.
- **None of this can be verified by `npm run verify`.** Delivering a push to a
  closed app needs real hardware and a real push service; sending an email needs a
  real inbox. The gate can prove the app still builds, audits and renders — it
  cannot prove any of the actual capability. §8 says which parts are unobserved.
- **The daily-digest `Not yet` chip is gone**, replaced by a real control. That is
  the chip pattern working as intended: it names the thing that has to exist first,
  and then it goes away. Price levels still wear one, because nothing in the app
  can set a level.
- **The digest sends at a fixed UTC hour**, not in the recipient's morning. The
  time zone is already synced (decision 110 detects it), so per-timezone delivery
  needs an hourly cron and a filter rather than new data — 24 runs a day against a
  free tier's 2,000 minutes a month, which is a cost worth taking deliberately.
- **`web-push` is a devDependency**, not a dependency. It is used only by a script
  and must never reach the app bundle.
- **The NGX collector finally has a scheduler.** §8 has said since phase 23 that
  "the ten-month clock has not started" — it starts on the first run of the
  workflow against a project with `0003` and `0004` applied, which is a human step
  and is listed in §9 rather than assumed.
