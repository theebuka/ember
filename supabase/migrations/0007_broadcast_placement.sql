-- ── Where a broadcast shows up ─────────────────────────────────────────────
--
-- `0006` gave `notices` a `pinned` boolean, which was the right shape while
-- there was one kind of pin. There are two now — a card above the greeting on
-- Home, and a bar across the top of every screen — and a boolean plus a style
-- column would admit a row saying "not pinned, as a bar", which is not a state
-- anything can render.
--
-- One column with three values cannot say that:
--
--   inbox  the notification centre and the bell. Every broadcast is here
--   card   *also* a card on Home
--   bar    *also* a strip above the app's own chrome, on every screen
--
-- Neither pin replaces the inbox copy. They are extra places to catch somebody
-- who has not opened the bell.
--
-- **The bar is deliberately the loudest thing ember has**, so it is worth
-- saying what that costs: it sits above the header on every screen, it is the
-- first thing a reader meets whatever they came to do, and it is the one
-- announcement they cannot navigate away from. Reserve it for an outage or a
-- change to what ember stores.

alter table public.notices
  add column if not exists placement text not null default 'inbox'
  check (placement in ('inbox', 'card', 'bar'));

-- Carry `0006`'s booleans across rather than stranding them. A row that was
-- pinned was pinned as a card, because a card was the only pin that existed.
update public.notices set placement = 'card' where pinned and placement = 'inbox';

-- `pinned` is left in place rather than dropped. Dropping it would break any
-- deployment still running the previous build the moment this migration lands —
-- the old code selects it — and a nullable orphan column costs nothing to leave
-- for one release. Remove it in a later migration, not this one.
comment on column public.notices.pinned is
  'Superseded by placement (0007). Kept for one release so an older build does not break mid-deploy.';

create index if not exists notices_placement_idx
  on public.notices (published_at desc) where placement <> 'inbox';
