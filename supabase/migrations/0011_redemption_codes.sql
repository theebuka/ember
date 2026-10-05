-- 0011 — redemption codes.
--
-- An admin creates a code worth a set period of Pro; a signed-in reader redeems
-- it on the Plan tab. Requires 0005 (entitlements), 0006 (is_admin, admin_log)
-- and **0010** (billing, cancel_at_period_end) — apply 0010 first.
--
-- **Redeeming writes `entitlements`, and nobody may write that table.** It is
-- select-only on purpose (decision 180): a user who could insert their own row
-- could make themselves Pro. So redemption is a `security definer` function —
-- the same shape as `unsubscribe_digest` (decision 172) — that does exactly one
-- thing: given a code the caller holds, extend the caller's own Pro by that
-- code's period. It never takes a user id; it reads `auth.uid()`.
--
-- **The code is the secret, so it is long.** Twelve characters from a
-- 31-letter alphabet is ~59 bits; guessing one is not a plan. There is no
-- per-user attempt limit in here, and that entropy is why one is not needed.

create table if not exists public.redemption_codes (
  -- XXXX-XXXX-XXXX, upper case, no 0/O/1/I/L. Generated in the admin's browser.
  code            text        primary key check (code ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$'),
  -- How much Pro one redemption adds. Days rather than an interval so the screen
  -- and the database agree on what "a month" is (30).
  period_days     integer     not null check (period_days between 1 and 3660),
  -- One code can serve a cohort. 1 is a personal code.
  max_redemptions integer     not null default 1 check (max_redemptions between 1 and 10000),
  redeemed_count  integer     not null default 0 check (redeemed_count >= 0),
  -- After this nobody can redeem it, however many uses are left.
  expires_at      timestamptz,
  -- Who it was for, in words. Only admins ever read it.
  note            text        check (char_length(note) <= 140),
  created_by      uuid        references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  revoked_at      timestamptz
);

alter table public.redemption_codes enable row level security;

drop policy if exists "admins may see codes" on public.redemption_codes;
create policy "admins may see codes"
  on public.redemption_codes for select
  to authenticated
  using (public.is_admin());

-- A new code starts unused and live; the with-check stops an insert that claims
-- otherwise.
drop policy if exists "admins may create codes" on public.redemption_codes;
create policy "admins may create codes"
  on public.redemption_codes for insert
  to authenticated
  with check (
    public.is_admin()
    and created_by = auth.uid()
    and redeemed_count = 0
    and revoked_at is null
  );

-- Revoking is the only edit the screen makes. Readers never see this table.
drop policy if exists "admins may revoke codes" on public.redemption_codes;
create policy "admins may revoke codes"
  on public.redemption_codes for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Who redeemed what, so a code cannot be redeemed twice by one account and an
-- admin can see a code was used. Written only by `redeem_code`.
create table if not exists public.code_redemptions (
  code        text        not null references public.redemption_codes (code) on delete cascade,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  period_end  timestamptz not null,
  primary key (code, user_id)
);

alter table public.code_redemptions enable row level security;

drop policy if exists "redemptions are readable by their owner and admins" on public.code_redemptions;
create policy "redemptions are readable by their owner and admins"
  on public.code_redemptions for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

-- The errors are short machine words, mapped to sentences in the browser
-- (`lib/redeem.ts`), so the copy lives with the rest of the copy.
create or replace function public.redeem_code(p_code text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_code    public.redemption_codes%rowtype;
  v_current public.entitlements%rowtype;
  v_from    timestamptz;
  v_end     timestamptz;
  v_is_pro  boolean := false;
begin
  if v_user is null then
    raise exception 'signed_out';
  end if;

  -- Locked, so two people redeeming the last use of a code cannot both get it.
  select * into v_code
    from public.redemption_codes
   where code = upper(btrim(p_code))
     for update;

  if not found
     or v_code.revoked_at is not null
     or (v_code.expires_at is not null and v_code.expires_at <= now()) then
    raise exception 'code_invalid';
  end if;

  if v_code.redeemed_count >= v_code.max_redemptions then
    raise exception 'code_used';
  end if;

  if exists (
    select 1 from public.code_redemptions
     where code = v_code.code and user_id = v_user
  ) then
    raise exception 'code_redeemed';
  end if;

  select * into v_current from public.entitlements where user_id = v_user for update;
  v_is_pro := found and v_current.plan = 'pro';

  if v_is_pro then
    -- Pro with no end was granted outright; there is nothing to add to it.
    if v_current.period_end is null then
      raise exception 'already_unlimited';
    end if;
    -- A paid plan that renews is billed by the merchant; a code must not turn
    -- it into one that silently stops renewing.
    if v_current.period_end > now()
       and not v_current.cancel_at_period_end
       and coalesce(v_current.provider_ref, '') not like 'code:%' then
      raise exception 'subscribed';
    end if;
  end if;

  -- Time stacks: a code redeemed with Pro still running adds to the end of it.
  v_from := greatest(
    now(),
    case when v_is_pro then v_current.period_end else now() end
  );
  v_end := v_from + make_interval(days => v_code.period_days);

  insert into public.entitlements
    (user_id, plan, period_end, provider_ref, billing, cancel_at_period_end, updated_at)
  values
    (v_user, 'pro', v_end, 'code:' || v_code.code, null, true, now())
  on conflict (user_id) do update
    set plan = 'pro',
        period_end = excluded.period_end,
        provider_ref = excluded.provider_ref,
        billing = null,
        -- A code is a fixed period; it never renews.
        cancel_at_period_end = true,
        updated_at = now();

  update public.redemption_codes
     set redeemed_count = redeemed_count + 1
   where code = v_code.code;

  insert into public.code_redemptions (code, user_id, period_end)
  values (v_code.code, v_user, v_end);

  return v_end;
end;
$$;

revoke all on function public.redeem_code(text) from public;
grant execute on function public.redeem_code(text) to authenticated;
