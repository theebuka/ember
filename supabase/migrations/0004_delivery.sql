-- ── Delivery ───────────────────────────────────────────────────────────────
--
-- Everything ember needs to reach you when the app is closed: push
-- subscriptions, email digest preferences, and a record of what was actually
-- sent.
--
-- Until now "autonomous" has had an asterisk on it. The alert watcher runs in a
-- tab, so a window that opened overnight was recorded and never delivered, and
-- §8 has carried that limit since phase 9. This is the half that removes it.
--
-- **Three boundaries are load-bearing here and none of them are new.**
--
-- 1. The service-role key never appears under `src/`. Sending needs to read
--    every recipient's row, which RLS correctly forbids to the anon key, so the
--    sender is a *script* (`scripts/send-digests.mjs`) that a scheduler runs —
--    the same boundary `collect-ngx.mjs` and `ngx_daily` already use.
--
-- 2. Nothing here stores a position, and email cannot carry a loss-prevention
--    warning as a result. Those need holdings the server deliberately does not
--    keep (ADR 0025 sends four derived numbers per request and persists none of
--    them), so a digest is scoped to the *watchlist*, which does sync. That is a
--    real limitation and the settings copy says it rather than implying push and
--    email carry the same things.
--
-- 3. No email address is stored. `email_prefs` keys on `user_id` and the sender
--    resolves the address from `auth.users` at send time through the admin API.
--    A second copy of everyone's email in a public-schema table is a liability
--    with no upside.

-- ── push_subscriptions ─────────────────────────────────────────────────────
--
-- One row per browser, not per user: someone with a phone and a laptop has two
-- subscriptions and expects both to buzz.
--
-- The endpoint is the primary key because it *is* the identity of a
-- subscription — the browser reissues the same endpoint for the same
-- installation, so an upsert on it is how a re-subscribe stays idempotent rather
-- than accumulating dead rows.
create table if not exists public.push_subscriptions (
  endpoint    text        primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  -- The two halves of the browser's public key material. Opaque to ember; they
  -- are what the sender encrypts a payload against.
  --
  -- The web-push spec calls the second one `auth`, and it is **deliberately not
  -- named that here**: `auth` is also the schema Supabase puts `auth.uid()` in,
  -- and a column of that name on a table whose RLS policy calls `auth.uid()` is
  -- an ambiguity waiting for the planner to resolve the wrong way. The script
  -- maps it back to `auth` when it builds the subscription object.
  p256dh      text        not null,
  auth_secret text        not null,
  -- Enough to tell a user which device is which in settings, and nothing more.
  -- Deliberately not the full user agent string, which is a fingerprint.
  label       text,
  created_at  timestamptz not null default now(),
  -- Bumped on every successful send. A push endpoint dies silently when the
  -- browser is uninstalled or the permission revoked; the sender deletes on a
  -- 404 or 410, and this is how a subscription that has gone quiet without
  -- erroring can be told from a live one.
  last_sent_at timestamptz
);

alter table public.push_subscriptions enable row level security;

create policy "push subscriptions are private"
  on public.push_subscriptions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

-- ── email_prefs ────────────────────────────────────────────────────────────
create table if not exists public.email_prefs (
  user_id           uuid        primary key references auth.users (id) on delete cascade,
  -- Off until asked for. An account is not consent to be emailed.
  digest_enabled    boolean     not null default false,
  -- 'daily' | 'weekly'. Checked rather than an enum type so adding a cadence is
  -- a migration on one constraint instead of a type rewrite.
  frequency         text        not null default 'weekly'
                                check (frequency in ('daily', 'weekly')),
  -- The trigger, and the reason this is a digest rather than a notification per
  -- finding: "a few opportunities have shown up" is the thing worth an email.
  -- Below this count on a given run, nothing is sent at all.
  min_findings      smallint    not null default 3 check (min_findings between 1 and 20),
  -- The unsubscribe key, and it has to work signed out.
  --
  -- An unsubscribe link that asks you to log in first is not an unsubscribe link.
  -- It cannot be the user id — that would let anyone holding one silence
  -- somebody — so it is an unguessable value with exactly one power, exercised
  -- through the function at the bottom of this file.
  unsubscribe_token uuid        not null unique default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.email_prefs enable row level security;

create policy "email prefs are private"
  on public.email_prefs for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── digest_log ─────────────────────────────────────────────────────────────
--
-- What was sent, not what was due. Same rule as the in-app inbox (decision
-- 106): re-deriving "what would be due now" would list interruptions nobody
-- received.
--
-- It is also the mechanism, not just the record. The frequency floor is
-- `max(sent_at)` for a user, so a scheduler that fires twice by accident cannot
-- email twice — the second run reads the first one's row and stands down.
create table if not exists public.digest_log (
  id           bigint generated by default as identity primary key,
  user_id      uuid        not null references auth.users (id) on delete cascade,
  channel      text        not null check (channel in ('email', 'push')),
  sent_at      timestamptz not null default now(),
  -- The symbols the send was about, so "never twice about the same thing" is
  -- enforceable at a coarser grain than the in-app alert log manages.
  symbols      text[]      not null default '{}',
  finding_count smallint   not null default 0
);

alter table public.digest_log enable row level security;

-- Readable by its owner: the settings screen shows when the last digest went
-- out, and a claim about what ember sent you should be checkable by you.
create policy "digest log is private"
  on public.digest_log for select
  to authenticated
  using (auth.uid() = user_id);

-- No client write policy, deliberately — same as `ngx_daily` and `notices`. The
-- sender writes with the service role, so nothing in the browser can forge a
-- record of a message it did not receive.

create index if not exists digest_log_user_sent_idx
  on public.digest_log (user_id, sent_at desc);

-- ── unsubscribe, signed out ────────────────────────────────────────────────
--
-- The privilege lives in the database, not in a key under `src/`.
--
-- The alternative was an API route holding the service-role key, which would
-- break the one rule this codebase treats as absolute. A `security definer`
-- function is the narrow version of the same power: it can flip exactly one
-- boolean on exactly one row, chosen by a value the caller must already
-- possess, and it can do nothing else.
--
-- `search_path` is pinned because a `security definer` function that resolves
-- names through the caller's path is a privilege-escalation waiting to happen.
create or replace function public.unsubscribe_digest(token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  hit integer;
begin
  update public.email_prefs
     set digest_enabled = false,
         updated_at = now()
   where unsubscribe_token = token
     and digest_enabled;

  get diagnostics hit = row_count;

  -- True for "you are unsubscribed", including when you already were — an
  -- unsubscribe link clicked twice should not report a failure, and it must not
  -- reveal whether the token exists either way.
  if hit > 0 then
    return true;
  end if;

  return exists (select 1 from public.email_prefs where unsubscribe_token = token);
end;
$$;

revoke all on function public.unsubscribe_digest(uuid) from public;
grant execute on function public.unsubscribe_digest(uuid) to anon, authenticated;
