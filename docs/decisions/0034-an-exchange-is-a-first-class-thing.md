# 0034 — An exchange is a first-class thing

**Status:** accepted
**Date:** 2026-08-17

## Context

The universe was 110 instruments and every equity was American. Phase 23 took it
to 214 across sixteen venues, and the interesting part is not the rows — it is
what having a second time zone exposed.

`liquidityAt(at, market)` branched on `"equity" | "crypto" | "fx"` and, for
equities, hard-coded `America/New_York` and 09:30–16:00. That was correct for
every instrument in the app and became wrong the moment one of them traded in
Tokyo. Since the execution window is *the* differentiator — the thing every
competitor's BUY badge does not have — telling somebody to fill a Toyota order
at a time the Tokyo exchange is shut is not a rough edge. It is the feature
failing on the screen it exists for.

Two other things surfaced only because international data was probed rather
than assumed.

**London quotes in pence and Johannesburg quotes in cents.** Yahoo returns Shell
at 3313.825 with a currency of `GBp`, and Naspers at 79770 with `ZAc`. Taken at
face value a holding is misstated by a factor of a hundred, and every figure
downstream inherits it: cost basis, position weight, the concentration warning,
the value hero. A one-character difference in a field nobody reads.

**The Nigerian Exchange has no history available anywhere free.** Its own REST
API returns real OHLCV for all 147 listed symbols — for today, and only today.
Every spelling of a date parameter is accepted and ignored; there is no history,
chart or index-history endpoint. Yahoo does not list the exchange. Stooq is
behind a bot check. The feeds that carry it are paid. And the engine needs two
hundred daily bars before it will say anything.

## Decision

**An exchange is a modelled thing with four load-bearing properties**
(`lib/market/exchanges.ts`): a time zone and hours, a lunch break where there is
one, a quote currency, and a minor-unit divisor. Sixteen of them.

The intraday liquidity curve is re-expressed as **fractions of a session**
rather than clock times, so one documented shape describes a 4.5-hour Taipei day
and an 8.5-hour London one. It keeps its existing deviation — the open scores
*low*, because heavy volume with wide spreads is not good execution — and gains
a new one: a lunch break is liquidity **zero**, not "thin". Tokyo and Hong Kong
halt for an hour, and a window opening into a halt cannot fill at all.

Verified against a live server. Tokyo's window opens 13:17 JST, London's 12:17
BST, Taipei's 09:17 CST, Cairo's 13:17 EET, New York's 10:17 EDT. Before the
change all five were 14:15–20:00 UTC, which is the NYSE session to the minute.

**Currency and precision come from the venue, not the row.** Shell is pence in
London and dollars in New York; won and yen are quoted in whole units. Ninety-two
rows each declaring their own currency is ninety-two chances to disagree with the
exchange they trade on.

**The minor-unit divisor is applied once**, where the provider builds candles, so
nothing above `MarketDataProvider` ever sees a minor unit. It is read from the
exchange rather than sniffed from Yahoo's `currency` field: `GBp` versus `GBP` is
the *evidence* for the divisor, not a thing to branch on at runtime. Anchor
prices in `universe.ts` are written in major units to match, and a test asserts
both — Shell in tens, Naspers in hundreds.

**NGX gets a collector.** `scripts/collect-ngx.mjs` stores one session a day into
`ngx_daily`; the engine begins forming a view when a symbol has two hundred, about
ten months out. Until then those instruments carry `dataState: "collecting"`,
are priced live from the exchange's own board, and say on screen that ember is
building the history rather than that it has no view.

## Alternatives considered

**For the session problem: keep one curve and accept the error.** Rejected
immediately once it was measurable. It is not a small inaccuracy — it is the
window feature not working for 92 of 164 equities.

**For the minor units: detect `GBp` at runtime.** Fewer places to maintain, and
worse: a venue that changed convention would silently rescale every price in
somebody's book, where reading it from the exchange means a test fails instead.

**For NGX, four options were weighed:**

- *Pay for a feed.* EODHD and similar carry NGX history for roughly $20–80 a
  month, and would also replace the unlicensed Yahoo dependency — one purchase
  against two problems. It is the right answer the day there is a budget, and
  the user's instruction was to build on what exists and swap later.
- *List NGX with prices and no view, permanently.* Honest, and it makes the one
  exchange the author's own currency trades on a second-class row forever.
- *Skip Nigeria.* Simplest, and it removes the reason this app is being built
  where it is being built.
- *Collect.* Ten months of waiting, and at the end of it real signals on a
  market nobody else's free tier covers. Taken.

The deciding argument is that waiting is only worse than nothing if nothing is
the alternative. It is not: the instruments are priced, tradeable in the ledger,
and visible from day one — only the engine is quiet, and it says why.

## Consequences

- **Fundamentals are US-only.** Measured: Finnhub's filings endpoint is
  EDGAR-derived, returns an empty array for ASML and 403 for `SAP.DE`, and
  resolved for zero of twelve sampled international listings. Piotroski and the
  Magic Formula abstain for all 92, which costs coverage rather than confidence
  (decision 011) — and is the reason phase 24's new strategies must be
  price-only.
- **The naira is live**, along with fifteen other currencies. The ECB publishes
  thirty and not TWD, EGP or NGN; those three come from Yahoo. This closes a §8
  entry that stood for two phases, and extends the unlicensed dependency past
  prices into exchange rates — recorded in §7 rather than passed over.
- **Exchange holidays are not modelled.** Every venue is assumed open Monday to
  Friday, so a window can open into Golden Week or Christmas. Visible, wrong,
  and in §8.
- **The collector is not scheduled.** It runs and is idempotent; nothing invokes
  it. The ten-month clock has not started, and it starts with phase 26's cron.
- **The same instrument literal was hand-written in four places and three
  dropped `exchange`** — both providers' `listInstruments`, `buildContext`, and
  the asset route. Nothing failed; the feature simply did not happen. There is
  one `toInstrument()` now, exhaustive over `Instrument` and checked by the
  compiler, so a field added to the type cannot be dropped on its way to a
  screen again.
