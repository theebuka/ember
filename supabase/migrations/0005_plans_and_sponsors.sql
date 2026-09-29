-- ── The commercial surface ─────────────────────────────────────────────────
--
-- Two tables: what a person is entitled to, and what ember is allowed to put in
-- a sponsor slot. Neither can be written by the application, and the first one
-- especially.
--
-- **No checkout exists yet.** §7 records three things that must be settled before
-- ember charges anybody — the merchant of record (Stripe has no payouts to
-- Nigeria), the host (Vercel Hobby forbids commercial use) and the equity price
-- feed (Yahoo is unlicensed). So every account is `free`, and the only way a row
-- lands in `entitlements` today is somebody typing it into the dashboard. That is
-- the intended state: this migration builds the *gate*, not the till.

-- ── entitlements ───────────────────────────────────────────────────────────
--
-- **This is deliberately not a `plan` column on `profiles`, and the reason is a
-- hole rather than a preference.**
--
-- `profiles` has an RLS policy permitting a user to update their own row, which
-- is right for a display name and catastrophic for an entitlement: RLS is
-- row-level, not column-level, so a `plan` column there would let any signed-in
-- browser run `update profiles set plan = 'pro'` and be believed. Postgres offers
-- column privileges and a trigger as workarounds, and both are a second thing to
-- get right beside a policy that already says "you may write this row".
--
-- A separate table with a select-only policy has no such ambiguity. The client can
-- read what it is entitled to and cannot write it, in one sentence, with no
-- exceptions to remember. Same shape as `ngx_daily` and `digest_log`: the
-- application reads, and one credential outside the application writes.
create table if not exists public.entitlements (
  user_id     uuid        primary key references auth.users (id) on delete cascade,
  -- 'free' | 'pro'. Checked rather than an enum so adding a tier is a constraint
  -- change instead of a type rewrite.
  plan        text        not null default 'free' check (plan in ('free', 'pro')),
  -- When the current paid period ends. Null on free, and null on a plan that was
  -- granted by hand rather than bought.
  --
  -- Read as a *grace* boundary, never as a kill switch: the app treats an expired
  -- period as free at the next read, and nothing deletes or hides what a user
  -- entered while they were paying. A subscription lapsing must not take away a
  -- ledger someone typed by hand.
  period_end  timestamptz,
  -- Whatever the eventual merchant of record calls this account. Nullable because
  -- there is no merchant yet, and a column that assumed one would be the first
  -- thing to migrate when §7's question is finally settled.
  provider_ref text,
  updated_at  timestamptz not null default now()
);

alter table public.entitlements enable row level security;

-- Readable by its owner and nobody else. What you are paying for is your business.
create policy "entitlements are readable by their owner"
  on public.entitlements for select
  to authenticated
  using (auth.uid() = user_id);

-- No insert, update or delete policy exists, deliberately. With RLS on and no
-- write policy every client is refused, and a billing webhook authenticating with
-- the service role is the only thing that can grant a plan. Until that webhook
-- exists, the Supabase dashboard is.

-- ── sponsors ───────────────────────────────────────────────────────────────
--
-- Ember's own ad slots, served by ember.
--
-- **No third-party script, ever.** A network tag would learn which instruments a
-- reader looks at, which for a finance app is a list of what somebody is thinking
-- about doing with their money — and it would learn it from a product whose whole
-- argument is that it does not watch you. So a sponsor is four fields in a table
-- ember renders in its own typography, and there is nothing to block, nothing to
-- leak and nothing to load from another origin.
--
-- Readable anonymously because the slot renders for signed-out visitors too. There
-- is nothing private in it: it is the same copy every reader sees.
create table if not exists public.sponsors (
  id          uuid        primary key default gen_random_uuid(),
  -- Which slot this is eligible for. One slot per screen at most; the app decides
  -- placement, this decides eligibility.
  slot        text        not null check (slot in ('news', 'signals', 'portfolio')),
  sponsor     text        not null,
  -- One sentence, in ember's voice. Length-checked in the database as well as in
  -- the component, because a 400-character "ad" would break a layout that has no
  -- room to be broken and the constraint is cheaper than the incident.
  copy        text        not null check (char_length(copy) between 10 and 140),
  href        text        not null check (href like 'https://%'),
  -- The active window. A sponsor with no end date runs until somebody removes it;
  -- one with a past end date is simply not selected, so expiry needs no job.
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.sponsors enable row level security;

create policy "active sponsors are public"
  on public.sponsors for select
  to authenticated, anon
  using (starts_at <= now() and (ends_at is null or ends_at > now()));

-- No write policy. A client that can insert a sponsor row is a client that can put
-- its own advertisement in front of every reader.

create index if not exists sponsors_slot_window_idx
  on public.sponsors (slot, starts_at desc);
