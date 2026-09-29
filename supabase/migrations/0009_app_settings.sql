-- 0009 — app-wide settings an admin can change without a deploy.
--
-- First use: whether Pro's price is shown converted into the reader's currency.
--
-- **Readable by everyone, writable only by an admin.** Every value here decides
-- how the app looks to all readers, including signed-out ones, so `select` is
-- open to `anon`; `insert` and `update` go through `is_admin()` (0006), exactly
-- like `notices`. No delete policy: removing a key is the same as resetting it,
-- and the client already treats a missing row as the default.
--
-- A key/value table rather than a column per setting, so the next switch is a row
-- and not a migration. `value` is jsonb so a setting can be something other than
-- a boolean without changing the table.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.app_settings enable row level security;

drop policy if exists "app settings are public" on public.app_settings;
create policy "app settings are public"
  on public.app_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "admins insert app settings" on public.app_settings;
create policy "admins insert app settings"
  on public.app_settings for insert
  to authenticated
  with check (public.is_admin() and updated_by = auth.uid());

drop policy if exists "admins update app settings" on public.app_settings;
create policy "admins update app settings"
  on public.app_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin() and updated_by = auth.uid());
