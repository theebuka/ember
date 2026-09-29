-- ── ngx_daily ──────────────────────────────────────────────────────────────
--
-- ember's own price history for the Nigerian Exchange, because nobody else's
-- exists.
--
-- The NGX publishes a REST API and it serves **today**: real open, high, low,
-- close and volume for every listed symbol, and no way to ask for any other
-- date. Every date-parameter spelling was probed and ignored; there is no
-- history endpoint, no chart endpoint and no index-history endpoint. Yahoo does
-- not list the exchange at all, Stooq is behind a bot check, and the feeds that
-- do carry NGX history are paid.
--
-- The signal engine needs two hundred daily bars before it will say anything,
-- so there are only four honest options: pay for a feed, list NGX with prices
-- and no view forever, skip Nigeria, or start collecting. This table is the
-- fourth. A row a day per symbol, and the engine begins assessing an instrument
-- the day it has enough sessions — roughly ten months from the first write.
--
-- Until then those instruments carry `dataState: "collecting"` and say so on
-- screen. That distinction matters: a priced instrument with no signal looks
-- identical to one the engine simply had no view on, and the second is a
-- judgement while the first is a wait.
--
-- **Written by `scripts/collect-ngx.mjs`, never by the app.** The collector
-- needs write access, which means the service-role key, and that key must never
-- appear under `src/` — so it lives in a script the cron runs and the
-- application only ever reads. Same reasoning as the `notices` table.

create table if not exists public.ngx_daily (
  symbol      text        not null,
  -- The session date, as the exchange reported it. Date rather than timestamp:
  -- a daily bar belongs to a trading day, not to an instant, and storing an
  -- instant invites a timezone to shift it across the boundary.
  session     date        not null,
  open        numeric     not null,
  high        numeric     not null,
  low         numeric     not null,
  close       numeric     not null,
  volume      numeric     not null default 0,
  -- When ember wrote the row, which is not the same as the session it describes.
  -- Kept so a backfill or a correction can be told from an original capture.
  captured_at timestamptz not null default now(),

  primary key (symbol, session)
);

alter table public.ngx_daily enable row level security;

-- Readable by anyone, including anonymously.
--
-- It is public market data, it holds nothing about any user, and the app has to
-- be able to draw an NGX chart for a visitor who has never signed in — the same
-- reasoning as `notices`, and the reason the app needs no elevated key.
create policy "ngx history is public"
  on public.ngx_daily for select
  to authenticated, anon
  using (true);

-- No insert, update or delete policy exists, deliberately.
--
-- With RLS on and no write policy, every client — anonymous or signed in — is
-- refused. The collector bypasses RLS because it authenticates with the service
-- role, which is exactly the boundary we want: one script, run by a scheduler,
-- is the only thing on earth that can add a bar.

create index if not exists ngx_daily_symbol_session_idx
  on public.ngx_daily (symbol, session desc);
