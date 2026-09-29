# ember

A personal finance tracker that watches equities, FX and crypto, tracks what
you actually own, and issues buy/sell advice **plus the window to act in**.
Every rule traces to published, citable work, and the track record is computed
from the same engine that serves live advice rather than written by hand.

The working document is [`CLAUDE.md`](CLAUDE.md) — what is built, what was
decided, what was ruled out, and an honest list of what is incomplete.
Decision records with alternatives live in [`docs/decisions/`](docs/decisions).

---

## Running it

```bash
npm install
npm run dev
```

That is the whole setup. **No API keys, no database, no account.** Prices come
from the mock provider and everything you enter stays in `localStorage`. This
is a supported way to run ember rather than a crippled one — see
[ADR 0007](docs/decisions/0007-value-chart-reports-gain-not-value.md) for the
market-data half of that argument and
[ADR 0031](docs/decisions/0031-accounts-are-optional-and-the-ledger-is-local-first.md)
for the accounts half.

## The gate

```bash
npm run verify
```

Builds, starts a production server, runs the accessibility audit, the
screenshot and overflow capture, the performance and layout-shift measurement
and the engine measurement, then stops the server. Every step exits non-zero on
a failure.

Do not start a server yourself and point a script at it — `next start` resolves
its manifests at boot, so a leftover process serves a build that no longer
exists on disk ([ADR 0028](docs/decisions/0028-the-gate-owns-the-server.md)).

```bash
npm run verify -- --only=audit      # one step
npm run verify -- --skip-build      # reuse the build on disk
npx tsc --noEmit && npx eslint src --max-warnings=0 && npx vitest run
```

## Turning on accounts (optional)

Accounts make the ledger survive a cleared browser and follow you to a second
device. Everything works without them.

1. Create a project at [supabase.com](https://supabase.com) (the free tier is
   enough).
2. Run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
   — paste it into the SQL editor, or `supabase db push` with the CLI linked.
   It creates the tables, enables row-level security on all of them, and adds
   the trigger that gives each new account a profile row.
3. Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL`
   and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from **Project Settings → API**.
4. In **Authentication → URL Configuration**, add
   `http://localhost:3000/auth/callback` (and your deployed equivalent) to the
   redirect allow-list. Without it the magic link consumes its one-time code
   and lands on the site root.

Both variables are safe in the browser bundle — the anon key is designed to be
public, and RLS is what makes it safe. **Never put the service-role key in the
environment of anything that serves a browser**; nothing in ember needs it.

Sign-in is a one-time email link. There is no password field anywhere, which is
deliberate: see ADR 0031.

**What is stored:** your email, your transaction log, your preferences and your
watchlist. Not your positions, not your P&L, not anything the engine works out
— those are recomputed on every request. `supabase/migrations/0001_init.sql`
says the same thing in more detail, next to the tables that don't exist.

## Layout

| | |
|---|---|
| `src/lib/signals/` | the engine — indicators, strategies, ensemble, regime, sizing, windows, backtest, exposure |
| `src/lib/portfolio/` | derivation from the transaction log; pure and tested |
| `src/lib/market/` | providers (mock \| live), the universe, formatting, sessions |
| `src/lib/sync/` | the local ↔ Postgres merge; pure and tested |
| `src/app/api/` | the only place components reach the engine |
| `docs/` | decisions, methodology, design system, case-study artifacts |
| `scripts/` | the gate |

**Components never import the engine or a provider.** They go through
`lib/api/client.ts` → a route → `lib/api/server.ts`, which imports
`server-only` so breaking the rule is a build error. That boundary is why
turning on live market data is a config change rather than a rewrite.

---

ember gives information, not financial advice.
