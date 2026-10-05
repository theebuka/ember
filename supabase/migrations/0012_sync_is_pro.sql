-- 0012 — sync is part of Pro, and the database says so (decision 289).
--
-- Requires 0005 (entitlements) and 0006 (is_suspended, the split policies).
--
-- `useSync` stands down on a free plan, but a check in the browser is a
-- suggestion: anyone holding a session could still write rows over REST. So
-- **writing** a synced row now needs Pro as well as not being suspended.
--
-- **Reading and deleting stay with the owner on every plan.** Nothing here
-- removes or hides a row: a lapsed account's data sits on the server untouched
-- and is there the moment Pro comes back. Deleting must keep working because
-- deleting an account deletes these rows first — and Postgres applies the
-- select policy to a delete with a `where`, which is why select stays open too.

-- Same shape as `is_admin()` and `is_suspended()`: definer, so a policy asks the
-- question without depending on `entitlements`' own policy, and a pinned
-- search_path. Mirrors `planFrom` in `src/lib/plan.ts` — an end date in the past
-- is free, and no end date is Pro granted outright.
create or replace function public.is_pro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.entitlements
     where user_id = auth.uid()
       and plan = 'pro'
       and (period_end is null or period_end > now())
  );
$$;

revoke all on function public.is_pro() from public;
grant execute on function public.is_pro() to authenticated;

-- ── transactions ───────────────────────────────────────────────────────────
drop policy if exists "transactions are writable unless suspended" on public.transactions;
create policy "transactions are writable on pro unless suspended"
  on public.transactions for insert
  to authenticated
  with check (auth.uid() = user_id and public.is_pro() and not public.is_suspended());

drop policy if exists "transactions are editable unless suspended" on public.transactions;
create policy "transactions are editable on pro unless suspended"
  on public.transactions for update
  to authenticated
  using (auth.uid() = user_id and public.is_pro() and not public.is_suspended())
  with check (auth.uid() = user_id and public.is_pro() and not public.is_suspended());

-- ── preferences ────────────────────────────────────────────────────────────
drop policy if exists "preferences are writable unless suspended" on public.preferences;
create policy "preferences are writable on pro unless suspended"
  on public.preferences for insert
  to authenticated
  with check (auth.uid() = user_id and public.is_pro() and not public.is_suspended());

drop policy if exists "preferences are editable unless suspended" on public.preferences;
create policy "preferences are editable on pro unless suspended"
  on public.preferences for update
  to authenticated
  using (auth.uid() = user_id and public.is_pro() and not public.is_suspended())
  with check (auth.uid() = user_id and public.is_pro() and not public.is_suspended());

-- ── watchlist ──────────────────────────────────────────────────────────────
drop policy if exists "watchlist is writable unless suspended" on public.watchlist;
create policy "watchlist is writable on pro unless suspended"
  on public.watchlist for insert
  to authenticated
  with check (auth.uid() = user_id and public.is_pro() and not public.is_suspended());

drop policy if exists "watchlist is editable unless suspended" on public.watchlist;
create policy "watchlist is editable on pro unless suspended"
  on public.watchlist for update
  to authenticated
  using (auth.uid() = user_id and public.is_pro() and not public.is_suspended())
  with check (auth.uid() = user_id and public.is_pro() and not public.is_suspended());

-- ── profiles ───────────────────────────────────────────────────────────────
-- One `for all` policy since 0001; split the same way. The sign-up trigger
-- that creates the row is a definer function, so it is unaffected.
drop policy if exists "profiles are private" on public.profiles;

create policy "profiles are readable by their owner"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles are writable on pro"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id and public.is_pro());

create policy "profiles are editable on pro"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id and public.is_pro())
  with check (auth.uid() = id and public.is_pro());

create policy "profiles are deletable by their owner"
  on public.profiles for delete
  to authenticated
  using (auth.uid() = id);
