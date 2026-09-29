-- ── profiles: the client owns updated_at, like every other synced table ─────
--
-- 0001 kept a `before update` trigger on `profiles` stamping `updated_at =
-- now()`, reasoning that nothing merged that table. Phase 20 started merging it
-- — the profile syncs through `pickNewer` exactly like preferences and the
-- watchlist — and the trigger stayed. So the timestamp recorded when a row
-- *arrived*, not when it was *typed*: a device that synced late always won,
-- however old its edit. That is decision 103's failure, on the one table that
-- still had it.
--
-- The client now sends its own `updated_at` on every profile write. Until this
-- runs the trigger overwrites it, which is the old behaviour and no worse.

drop trigger if exists profiles_touch on public.profiles;
