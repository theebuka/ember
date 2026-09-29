-- ember — profile fields
--
-- `profiles` shipped in 0001 with a single `display_name`, which was the only
-- personal field the app had. Phase 20 gives it a real Account screen, so the
-- column becomes a handful of them.
--
-- The list is short on purpose and the omissions are the considered part. No
-- date of birth, no address, no income bracket, no phone number: ember does no
-- KYC, holds no money and executes no trade, so it has no business asking. A
-- finance app is exactly where collecting all of that starts to feel normal.
--
-- Email is not here either. It belongs to `auth.users`, changing it goes
-- through a verification round trip, and a second copy in a synced table is a
-- copy that can disagree with the address you sign in with.

alter table public.profiles
  add column if not exists preferred_name text,
  add column if not exists first_name     text,
  add column if not exists last_name      text,
  -- ISO 3166-1 alpha-2. Suggests a base currency during setup and is where a
  -- future tax or regulatory question would hang off.
  add column if not exists country        text,
  -- IANA zone. Every execution window is quoted in the reader's local time,
  -- which is the product; this is what a server-sent digest would need to get
  -- that right without asking again.
  add column if not exists timezone       text;

-- Carried over rather than dropped, so a client that hasn't shipped yet keeps
-- working. `display_name` is no longer written.
update public.profiles
   set preferred_name = display_name
 where preferred_name is null
   and display_name is not null;
