# 0006 — Free-tier-first infrastructure

**Status:** accepted · **Date:** 2026-08-12

## Context

The client wants to avoid real spend until there are paying customers, without
trading away functionality. The app will eventually need auth, a database,
market data, scheduled jobs, email, push and payments.

## Decision

| Need | Choice | Free tier | Note |
|---|---|---|---|
| Hosting | Vercel Hobby → Cloudflare Workers | Hobby free | See consequence below |
| Auth + DB | Supabase | 50k MAU, 500 MB Postgres | One vendor for auth, DB and storage |
| Cache / rate limit | Upstash Redis | 10k commands/day | Required to stay inside data-API quotas |
| Scheduled jobs | GitHub Actions | 2,000 min/mo | More generous than Vercel Cron's free tier |
| Email | Resend | 3k/mo | |
| Web push | self-hosted VAPID | free | No vendor needed |
| Equities + FX | Finnhub | 60 req/min | Primary |
| Crypto | CoinGecko Demo | 30 req/min | Primary |
| Fallback quotes | Twelve Data | 800 req/day | Failover |
| Fundamentals | SEC EDGAR | unlimited, official | Free permanently; powers Piotroski and Magic Formula |
| Analytics | PostHog | 1M events/mo | |
| Errors | Sentry | 5k/mo | |

Market data sits behind a `MarketDataProvider` interface with `mock` and
`live` implementations selected by env var. With no keys the app is fully
usable on generated data; with keys it runs on real candles and no component
changes.

## Alternatives considered

**Alpha Vantage** for quotes — 25 requests/day on the free tier, which cannot
support even a single user's watchlist. Rejected.

**Polygon.io** free — end-of-day only, 5 req/min. Kept in reserve for
historical backfill, not live quotes.

**Yahoo Finance via an unofficial client** — free and comprehensive, but
undocumented, unstable, and outside its terms. Rejected for anything that will
be charged for.

**Clerk for auth** — better DX than Supabase Auth, 10k MAU free. Rejected only
because Supabase already provides auth alongside the database the app needs
anyway; one vendor beats two at this size.

## Consequences

- **Vercel Hobby forbids commercial use.** It's fine for development, but the
  app must move to Cloudflare Workers or Vercel Pro before it takes money.
- **Supabase free projects pause after 7 days of inactivity.** Acceptable
  pre-launch, needs a keepalive or a paid tier once real users exist.
- **Stripe does not support payouts to Nigeria**, where the client is based.
  A merchant of record — Paddle, Polar or Lemon Squeezy — is the realistic
  route for global subscriptions, and absorbs VAT and sales-tax compliance as
  a side effect. Paystack or Flutterwave for local collection. This needs
  settling before the billing phase; it is the one item here that could
  invalidate a launch plan late.
- Upstash caching is not optional once live data is on: 60 req/min across a
  watchlist and a signal engine is consumed quickly without it.
