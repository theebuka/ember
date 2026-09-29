-- ember — initial schema
--
-- Run against a fresh Supabase project:
--   supabase db push          (with the CLI linked to the project)
-- or paste into the SQL editor.
--
-- ── What is stored, and what deliberately isn't ─────────────────────────────
--
-- The ledger, the preferences and the watchlist. That is the whole list, and
-- it is the same reasoning as ADR 0025: the server holds the minimum it needs
-- to hand your book back to you on another device, and works everything else
-- out from scratch on each request.
--
-- So there is no holdings table (CLAUDE.md §5 — holdings are derived from the
-- transaction log and a second copy could only ever disagree with it), no
-- positions, no realised P&L, no engine output, no assessments, no findings,
-- no alert history, and nothing about the device. Every one of those is a
-- function of the transaction log and today's prices, and a function is
-- cheaper to recompute than to keep consistent.
--
-- ── Row-level security ─────────────────────────────────────────────────────
--
-- RLS is on for every table and the policies are `auth.uid() = user_id` with
-- no exceptions. The anon key is public — it ships in the browser bundle, as
-- it is designed to — so RLS is not a second line of defence here, it is the
-- only one. A table without it is world-readable.
--
-- The service-role key is never used by this application and must never be
-- put in the environment of anything that serves a browser.

-- ── profiles ───────────────────────────────────────────────────────────────
-- One row per account, created by the trigger below. `display_name` is the
-- same string the greeting uses; it is the only personal data ember asks for
-- and it is optional there too.

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are private"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ── transactions ───────────────────────────────────────────────────────────
-- The one source of truth, mirroring `Transaction` in `lib/api/types`. The id
-- is the client's own — a `crypto.randomUUID()` generated when the row was
-- written on the device — which is what makes the sync idempotent: replaying
-- an upsert cannot duplicate a trade.
--
-- `deleted_at` rather than a delete. A device that has been offline needs to
-- learn that a transaction was removed, and a row that is simply gone is
-- indistinguishable from one it has not yet been told about — it would be
-- resurrected on the next push. Soft deletion is what makes "last write wins"
-- safe for removals as well as edits.

create table if not exists public.transactions (
  id         uuid primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  symbol     text not null,
  side       text not null check (side in ('buy', 'sell')),
  quantity   double precision not null check (quantity > 0),
  price      double precision not null check (price >= 0),
  fees       double precision not null default 0 check (fees >= 0),
  -- Stored as text in the same ISO form the client holds. A `date` column
  -- would be converted twice — once by Postgres, once by the client — and
  -- ADR 0010 exists because a date that shifts by a day silently moves a
  -- trade into another month and changes every figure downstream.
  trade_date text not null,
  account    text,
  note       text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists transactions_user_updated_idx
  on public.transactions (user_id, updated_at desc);

alter table public.transactions enable row level security;

create policy "transactions are private"
  on public.transactions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── preferences ────────────────────────────────────────────────────────────
-- One row per account, the whole preference object as JSON.
--
-- A column per setting would be the tidier schema and the wrong one: the
-- preference shape has changed three times already (v1 → v3, and the persist
-- middleware migrates it on the client), and every one of those changes would
-- otherwise have needed a migration here in lockstep with a client release
-- that may not have shipped yet. The client owns this shape; the server holds
-- it and hands it back.

create table if not exists public.preferences (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  -- The client's persist version, so a newer device can tell it is looking at
  -- an older shape and run the same migration it would run locally.
  version    integer not null default 1,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.preferences enable row level security;

create policy "preferences are private"
  on public.preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── watchlist ──────────────────────────────────────────────────────────────
-- `symbols` is null when the user is following everything.
--
-- That null is load-bearing, not laziness: decision 023 chose a sentinel over
-- a seeded list precisely so that adding an instrument to the universe appears
-- for someone who opened the app last year. Materialising it here — writing
-- all 110 symbols into a row — would put the universe in two places and
-- reintroduce the exact bug, from the server side this time.

create table if not exists public.watchlist (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  symbols    text[],
  updated_at timestamptz not null default now()
);

alter table public.watchlist enable row level security;

create policy "watchlist is private"
  on public.watchlist for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── notices ────────────────────────────────────────────────────────────────
-- Broadcasts: release notes, methodology changes, outages. The one table that
-- is read by everyone and written by nobody through this app.
--
-- Readable by anyone authenticated, and only when published — a draft is a
-- row with `published_at` in the future. Writes are left to the dashboard and
-- the service role, because a client that can insert a broadcast is a client
-- that can send every user a message.

create table if not exists public.notices (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  href         text,
  action       text,
  published_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

alter table public.notices enable row level security;

create policy "published notices are readable"
  on public.notices for select
  to authenticated, anon
  using (published_at <= now());

create index if not exists notices_published_idx
  on public.notices (published_at desc);

-- ── updated_at belongs to the client, and there is no trigger ──────────────
--
-- The obvious move is a `before update` trigger setting `updated_at = now()`,
-- and it is wrong for every table the sync touches.
--
-- These timestamps answer "when did the user make this edit", not "when did
-- it reach the server", and the merge in `lib/sync/merge.ts` resolves
-- conflicts by comparing them. Stamping on arrival means a device that syncs
-- late always wins: edit a trade on your laptop, edit it differently on your
-- phone an hour earlier, open the laptop last, and the phone's older edit is
-- written with a newer server timestamp and silently beats it.
--
-- So the client sends its own `updated_at` and the database records what it
-- is told. The client is the only writer, every table is single-user behind
-- RLS, and a user who forges a timestamp is only ever confusing themselves.
--
-- `profiles` is the exception and keeps its trigger: nothing merges it, and
-- the column is only ever read by a human looking at the dashboard.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Explicitly removed, in case an earlier revision of this file created them.
drop trigger if exists transactions_touch on public.transactions;
drop trigger if exists preferences_touch on public.preferences;
drop trigger if exists watchlist_touch on public.watchlist;

-- ── a profile per account ──────────────────────────────────────────────────
-- Created by a trigger rather than by the client on first sign-in: a client
-- that must remember to create its own row is a client that will one day
-- fail to, and the failure mode is a signed-in account with nowhere to put a
-- display name.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
