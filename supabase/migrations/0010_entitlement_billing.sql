-- 0010 — what a subscriber's plan page needs to say.
--
-- `entitlements` knew whether an account was Pro and until when. A subscriber's
-- plan page also has to say *how* they pay and *whether it renews*: "Renews
-- 5 Nov · $12 a month" and "Ends 5 Nov — it won't renew" are different
-- sentences, and only the merchant of record can say which is true. Both
-- columns are written by the same thing that writes the rest of this table —
-- never the browser (the table has no write policy, decision 180).
--
-- Additive and nullable, and the app reads the row with `select *`, so a build
-- running before this lands simply has nothing to say about billing.

alter table public.entitlements
  add column if not exists billing text check (billing in ('monthly', 'yearly')),
  -- True once a subscriber cancels: Pro stays on to `period_end`, then lapses.
  add column if not exists cancel_at_period_end boolean not null default false;
