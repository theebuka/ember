-- ── Announcements, and the people allowed to make them ─────────────────────
--
-- One table read from both ends: the pinned banner and the notification centre
-- read `notices`, and `/admin` writes it. Everything else here exists to answer
-- the question that opens up the moment an application can write a broadcast —
-- **who is allowed to, and how would anyone know afterwards.**
--
-- Three tables and two functions:
--
--   admins        who may write. Its own table, select-only, for the reason below
--   suspensions   an account whose sync and delivery are switched off
--   admin_log     every admin write, append-only
--
-- ── This is the first application code that writes as a privileged user ────
--
-- Every previous migration had exactly one shape: the client reads and writes its
-- own rows, and anything needing more (`ngx_daily`, `digest_log`, `entitlements`)
-- is written by a script holding the service-role key, outside `src/`. That rule
-- has not moved — the service-role key still never appears under `src/`.
--
-- What is new is that an *admin*, signed in through the ordinary anon key, may
-- write `notices`. That is the right shape for this one case: broadcasting is
-- something a person does at a keyboard, with a preview in front of them, and
-- routing it through a script would mean composing a broadcast in SQL. The
-- privilege is narrow — three tables, no reads of anybody's ledger — and every
-- use of it is logged.

-- ── admins ─────────────────────────────────────────────────────────────────
--
-- **Not an `is_admin` column on `profiles`, and this is the same hole ADR 0038
-- caught for `plan`.** `profiles` carries a `for all` policy keyed on
-- `auth.uid() = id`, and RLS is row-level, not column-level — so a boolean living
-- there could be set by the browser it is meant to constrain. `update profiles set
-- is_admin = true` would be believed, and the account that ran it could then
-- broadcast to every user. The v3 plan asked for exactly that column; it is the
-- one instruction in it that could not be followed.
--
-- A separate table with no write policy has no such ambiguity. A row lands in it
-- when somebody with the service role, or the Supabase dashboard, puts it there.
create table if not exists public.admins (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  -- Why this person has it, in words, for whoever reads this table in a year.
  note       text,
  granted_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- You may read your own row and nobody else's. That is enough for the app to
-- decide whether to offer the screen, and it means the table is not a directory
-- of who to compromise.
create policy "admins may see their own grant"
  on public.admins for select
  to authenticated
  using (auth.uid() = user_id);

-- No insert, update or delete policy, deliberately.

-- ── is_admin() ─────────────────────────────────────────────────────────────
--
-- `security definer` so a policy on another table can ask the question without
-- that table's policy depending on `admins`' policy — a policy evaluating a
-- policy is where recursive-RLS bugs come from, and the failure mode is a
-- permission check that quietly returns false for everyone.
--
-- `stable` so the planner evaluates it once per statement rather than per row.
-- `search_path` pinned for the same reason `unsubscribe_digest` pins it: a definer
-- function resolving names through the caller's path is an escalation waiting for
-- somebody to create a table called `admins` in a schema they control.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ── suspensions ────────────────────────────────────────────────────────────
--
-- **A suspension is weaker than the word suggests, and the schema should say so
-- as plainly as the screen does.**
--
-- ember works fully with no account (ADR 0031): the ledger is local-first, the
-- engine answers anonymously, and the methodology and track record are public. So
-- there is no such thing as banning somebody from ember. What this row does is
-- exactly three things — it stops sync writes, it stops the email digest and it
-- stops push — and it cannot stop anyone opening the app, logging a trade, or
-- reading a broadcast, because `notices` is readable by `anon`.
--
-- A control labelled "Ban" that cannot ban is worse than an honest one, so the UI
-- calls it "Suspend sync and delivery" and this comment is why.
--
-- **The suspended user can read this row.** A restriction somebody cannot see is
-- indistinguishable from a bug, and they would reasonably spend a day thinking
-- sync was broken. The app tells them, with the reason.
create table if not exists public.suspensions (
  user_id      uuid        primary key references auth.users (id) on delete cascade,
  -- Shown to the suspended user, so it is written to be read by them.
  reason       text,
  suspended_by uuid        references auth.users (id) on delete set null,
  suspended_at timestamptz not null default now()
);

alter table public.suspensions enable row level security;

create policy "you can see your own suspension"
  on public.suspensions for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

create policy "admins may suspend"
  on public.suspensions for insert
  to authenticated
  with check (public.is_admin() and suspended_by = auth.uid());

create policy "admins may lift a suspension"
  on public.suspensions for delete
  to authenticated
  using (public.is_admin());

-- No update policy: lifting and re-suspending leaves two log entries, where an
-- edited row leaves one and loses the original reason.

create or replace function public.is_suspended()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.suspensions where user_id = auth.uid());
$$;

revoke all on function public.is_suspended() from public;
grant execute on function public.is_suspended() to authenticated;

-- ── the suspension is enforced, not merely recorded ────────────────────────
--
-- The three synced tables had one `for all` policy each. They are split now:
-- reading your own rows is always allowed, and writing them additionally requires
-- that you are not suspended.
--
-- **Reads are deliberately untouched.** Nothing here takes anything away — the
-- same rule `entitlements` states for a lapsed plan (decision 185). A suspended
-- user keeps every trade they typed, can still export it, and gets it back on a
-- new device; what stops is the account pushing new state up.

drop policy if exists "transactions are private" on public.transactions;

create policy "transactions are readable by their owner"
  on public.transactions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "transactions are writable unless suspended"
  on public.transactions for insert
  to authenticated
  with check (auth.uid() = user_id and not public.is_suspended());

create policy "transactions are editable unless suspended"
  on public.transactions for update
  to authenticated
  using (auth.uid() = user_id and not public.is_suspended())
  with check (auth.uid() = user_id and not public.is_suspended());

create policy "transactions are deletable unless suspended"
  on public.transactions for delete
  to authenticated
  using (auth.uid() = user_id and not public.is_suspended());

drop policy if exists "preferences are private" on public.preferences;

create policy "preferences are readable by their owner"
  on public.preferences for select
  to authenticated
  using (auth.uid() = user_id);

create policy "preferences are writable unless suspended"
  on public.preferences for insert
  to authenticated
  with check (auth.uid() = user_id and not public.is_suspended());

create policy "preferences are editable unless suspended"
  on public.preferences for update
  to authenticated
  using (auth.uid() = user_id and not public.is_suspended())
  with check (auth.uid() = user_id and not public.is_suspended());

create policy "preferences are deletable unless suspended"
  on public.preferences for delete
  to authenticated
  using (auth.uid() = user_id and not public.is_suspended());

drop policy if exists "watchlist is private" on public.watchlist;

create policy "watchlist is readable by its owner"
  on public.watchlist for select
  to authenticated
  using (auth.uid() = user_id);

create policy "watchlist is writable unless suspended"
  on public.watchlist for insert
  to authenticated
  with check (auth.uid() = user_id and not public.is_suspended());

create policy "watchlist is editable unless suspended"
  on public.watchlist for update
  to authenticated
  using (auth.uid() = user_id and not public.is_suspended())
  with check (auth.uid() = user_id and not public.is_suspended());

create policy "watchlist is deletable unless suspended"
  on public.watchlist for delete
  to authenticated
  using (auth.uid() = user_id and not public.is_suspended());

-- ── notices gains a pin, and its first writers ─────────────────────────────
--
-- A pinned notice is one that appears above the greeting on Home rather than only
-- in the notification centre. It is the loudest thing ember can do to a reader who
-- did not ask for anything, so **one at a time** is enforced by the screen and by
-- the reader — the banner renders the newest pinned notice and nothing else — and
-- the flag defaults to false so an ordinary release note stays where release notes
-- belong.
alter table public.notices add column if not exists pinned boolean not null default false;

create policy "admins may publish a notice"
  on public.notices for insert
  to authenticated
  with check (public.is_admin());

create policy "admins may edit a notice"
  on public.notices for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins may withdraw a notice"
  on public.notices for delete
  to authenticated
  using (public.is_admin());

-- The existing select policy admits rows whose `published_at` has passed, which is
-- what makes a scheduled broadcast a row rather than a job. An admin composing one
-- needs to see their own drafts, so they get a second select policy rather than a
-- weakening of the first.
create policy "admins may see unpublished notices"
  on public.notices for select
  to authenticated
  using (public.is_admin());

-- ── admin_log ──────────────────────────────────────────────────────────────
--
-- Every admin write appends one row. **An admin action with no record of who took
-- it is the kind of thing that is only missed once** — and the record has to be
-- written by the same statement-issuing client that took the action, so the
-- with-check pins `actor` to the caller. An admin can log their own actions and
-- cannot write an entry under somebody else's name.
--
-- Insert and select only. No update policy and no delete policy, for the reason
-- the table exists: a log an admin can edit is a log that says whatever the last
-- admin wanted it to say.
create table if not exists public.admin_log (
  id      bigint generated always as identity primary key,
  -- Nullable, and `on delete set null` rather than `cascade`. An admin account
  -- being deleted must not delete the record of what that admin did — that is
  -- precisely the case an audit log exists for. `not null` here would have been
  -- the natural spelling and it contradicts the delete rule: Postgres would
  -- refuse the deletion at the moment somebody most wanted it to work.
  --
  -- Nothing can insert a null actor anyway: the insert policy's with-check pins
  -- it to `auth.uid()`.
  actor   uuid        references auth.users (id) on delete set null,
  -- A verb and its object, e.g. `notice.publish`. Free text rather than an enum
  -- because a log that refuses to record an action it has not heard of is a log
  -- with a gap exactly where something unusual happened.
  action  text        not null,
  -- What was acted on — a notice id, a user id. Text because those are different
  -- kinds of identifier and the log is read by a human, not joined.
  target  text,
  -- Whatever else is worth keeping. The broadcast's title, the suspension reason.
  detail  jsonb       not null default '{}'::jsonb,
  at      timestamptz not null default now()
);

alter table public.admin_log enable row level security;

create policy "admins may read the log"
  on public.admin_log for select
  to authenticated
  using (public.is_admin());

create policy "admins may append to the log"
  on public.admin_log for insert
  to authenticated
  with check (public.is_admin() and actor = auth.uid());

create index if not exists admin_log_at_idx on public.admin_log (at desc);

create index if not exists notices_pinned_idx
  on public.notices (published_at desc) where pinned;
