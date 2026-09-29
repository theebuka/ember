# 0033 — Live data is four providers, and one of them is a problem

**Status:** accepted
**Date:** 2026-08-14

## Context

Phase 1 built the signal engine against a `MarketDataProvider` interface and a
generated implementation, on the explicit promise (ADR 0007) that turning on
real data would be an env var and a second implementation — no screen, no
route and no engine module changed. Phase 21 is where that promise gets tested.

The user supplied two free-tier keys: Finnhub and CoinGecko. Before writing
anything, both were **probed against the actual keys** rather than read off a
pricing page, because the two disagree.

**Finnhub's free tier:**

| endpoint | |
|---|---|
| `/quote` | ✅ real-time US equity quote |
| `/stock/financials-reported` | ✅ parsed 10-K and 10-Q line items |
| `/stock/metric` | ✅ 133 computed ratios |
| `/company-news`, `/news` | ✅ real headlines, sources and URLs |
| `/search` | ✅ every US listing |
| `/calendar/earnings` | ✅ |
| `/stock/candle` | ❌ **403** |
| `/crypto/candle`, `/forex/candle` | ❌ **403** |
| `/forex/rates` | ❌ 403 |
| `/calendar/economic` | ❌ 403 |

**CoinGecko's demo key:** everything needed for crypto — prices, daily
history, intraday, market cap, supply — capped at 30 calls a minute and **365
days of history**.

The shape of that table decides the architecture. The engine needs two hundred
daily bars before it will say anything at all, and Finnhub — the equity
provider — cannot serve a single one.

## Decision

**Live data is a composition, not a client.** `LiveProvider` routes each market
to whoever actually serves it:

| | prices | history | fundamentals | news |
|---|---|---|---|---|
| equity | Yahoo | Yahoo, 5y | Finnhub, filed 10-K | Finnhub |
| crypto | CoinGecko | CoinGecko, 365d | — | Finnhub |
| fx | ECB via Frankfurter | ECB, 5y | — | Finnhub |

Four consequential sub-decisions:

**1. An instrument is live as a whole or it is nothing.** No mixing at the
instrument level, and no falling back to generated data when an upstream
fails. A real quote drawn over a modelled price path is the single most
dishonest thing this app could render, precisely because it is indistinguishable
from the honest version. A failed instrument returns no candles, `buildContext`
drops it, and it is absent until the source recovers.

**2. Foreign exchange comes from the ECB, not from a vendor.** Frankfurter
republishes the European Central Bank's daily reference rates: free, no key, no
quota, and an official source rather than somebody's copy of one. One request
covers all fourteen crosses *and* the portfolio's conversion rates, because
every rate shares a base. The cost is that a reference rate is one number a
day: no open, high or low, and no weekends. Bars carry `o = h = l = c`, where
true range degenerates to the absolute close-to-close move — a real measure,
just a narrower one. Inventing a daily range to fill the gap was rejected
outright; that is fabricating market data.

**3. Fundamentals are filed statements, not computed ratios.** Finnhub serves
both. `/stock/metric` would have been far less code — 133 ready-made ratios —
and it was rejected: ember's whole claim is that its arithmetic is traceable to
a published method, and a P/E somebody else calculated is a number ember cannot
show its working for. `/stock/financials-reported` is the parsed 10-K, which is
the SEC EDGAR data ADR 0006 planned for without ember having to parse XBRL.

**4. The gate stays on generated data.** `verify.mjs` forces
`EMBER_DATA_PROVIDER=mock` for both the build and the server it starts. Every
number in CLAUDE.md §8 — layout shift, payload sizes, the screenshot set —
would otherwise be a fact about the market on the day it ran.

## The problem: equity price history

There is no licensed free source for it. Finnhub's candles are 403; Alpha
Vantage allows 25 requests a day against a universe of 110; Stooq is behind a
JavaScript bot check; Polygon and Tiingo are legitimate and free but need keys
that were not supplied, and creating accounts on someone's behalf is not
something to do quietly.

So equity daily and intraday bars come from Yahoo's `v8/finance/chart`
endpoint, which is undocumented and whose terms do not licence programmatic
use. It works, it is what almost every free finance project uses, and **it is
not acceptable in a product that charges money.**

Three options were weighed:

- **Leave equities generated.** Coherent and legally clean, and it means live
  data covers 38 of 110 instruments — a version of the feature that mostly
  isn't one.
- **Use Yahoo, default off.** Sounds cautious, behaves badly: the default path
  is then the underwhelming one above, and the flag exists to be switched on
  anyway.
- **Use Yahoo, default on, and put it in §7 next to the other things that have
  to change before ember charges anybody.** Taken.

That last is the same treatment two existing constraints already get: Stripe
has no Nigerian payouts, and Vercel Hobby forbids commercial use. Both are used
today, both are recorded as pre-revenue blockers, and neither is pretended
about. This is a third entry on that list, not a new kind of compromise.

The dependency is isolated to one file. Nothing above `MarketDataProvider`
knows it exists, so replacing it with a licensed feed is a single module.

## What this changed about the product, measured

- **110 of 110 instruments** carry a usable history. Equities get ~1,255 daily
  bars, FX ~1,282, crypto 365 (the demo plan's ceiling — a real asymmetry,
  since it leaves a coin about 165 backtestable days against an equity's 1,050).
- **Fundamentals resolve for 49 of 72 equities.** The 23 that don't are not a
  parsing failure — they are the methods' own scope. Banks file unclassified
  balance sheets with no current assets and no gross profit, so Piotroski and
  the Magic Formula cannot be computed for them; Greenblatt excludes financials
  and utilities from the Magic Formula by design. Integrated oil reports no
  gross margin at all. The strategies abstain, and abstention already costs
  coverage rather than confidence (decision 011).
- **MATIC left the universe and POL replaced it.** Polygon migrated its native
  token in 2024; CoinGecko still answers for the legacy contract, with 87 days
  of history against POL's 365. A row that cannot go live is a row that is
  wrong about the market.
- **News has real attribution for the first time.** ADR 0027 said the mock's
  outlets are invented on purpose, and that real publisher names should appear
  only when a real feed supplies them. This is that moment.

## Consequences

- Every figure in CLAUDE.md §8 that describes generated prices still describes
  generated prices, because the gate still runs on them. The live figures are
  recorded separately and labelled as a different measurement.
- The free tiers are a real constraint on cold start, and `cache.ts` is the
  answer: stale-while-revalidate, single-flight, and a disk tier so a restart
  is warm. Warm, `/api/advice` answers in 3ms.
- Policy rates stay compiled in. No free API serves central-bank targets, and
  Finnhub's economic calendar — which would at least give the meeting dates —
  is 403.
- The naira is the one base currency that is not live. The ECB publishes seven
  of ember's nine currencies and NGN is not among them, so it keeps its
  compiled value. That is worth stating rather than burying: it is the author's
  own currency.
