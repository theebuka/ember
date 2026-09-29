# 0005 — Signals come only from published, citable strategies

**Status:** accepted · **Date:** 2026-08-12

## Context

The client asked directly how advice signals were being generated, and said
the app has to be usable with confidence to find real edges rather than being
a gimmick.

This is the central credibility question for the product. The default approach
in this category — generate a plausible-looking score, wrap it in confident
language, never report whether it worked — is exactly what makes these apps
untrustworthy, and it is an architecture problem before it is a copy problem.

## Decision

Three binding rules:

1. **Every signal traces to published work.** Each strategy in
   `src/lib/signals/strategies/` carries a citation, and the methodology page
   shows it to the user. If a rule set can't be cited, it doesn't ship.
2. **The track record is computed, never authored.** It is the output of a
   walk-forward backtest over the same engine that serves live advice. If a
   strategy performs badly, the page says so.
3. **Disagreement is shown.** When strategies dissent, the advice card names
   which and why.

Advice always carries a **size and a stop**, never a bare direction.

The engine operates on OHLCV candles from day one, so mock data and a live
feed exercise identical code.

## Strategies accepted for v1

| Strategy | Source |
|---|---|
| Time-series momentum | Moskowitz, Ooi & Pedersen (2012) |
| Cross-sectional momentum | Jegadeesh & Titman (1993) |
| Clenow ranking | Clenow, *Stocks on the Move* (2015) |
| Dual momentum | Antonacci (2014) |
| Donchian breakout | Dennis/Eckhardt Turtle rules |
| Connors RSI(2) | Connors & Alvarez (2008) |
| Piotroski F-Score | Piotroski (2000), *Journal of Accounting Research* |
| Magic Formula | Greenblatt (2005) |
| FX carry | Lustig & Verdelhan, interest-rate differential |
| MVRV / realised-price band | Glassnode on-chain framework |

## Ruled out

**Stock-to-flow.** Broke badly out of sample; keeping it would undermine the
credibility of everything beside it.

**Chart patterns without statistical support** (head-and-shoulders, flags).
Widely believed, poorly evidenced, and unfalsifiable as stated.

**Sentiment scraping.** Not reproducible, not citable, and trivially gamed.

> **Amended in phase 16 by [ADR 0027](0027-news-is-context-never-evidence.md).**
> ember now has a News tab. This rejection stands unchanged and is extended:
> a headline may sit beside a finding as *labelled context* and may never be
> an input. `NewsItem` deliberately carries no sentiment, relevance or score,
> and a test fails if anything under `lib/signals` imports a news module.

**An opaque model score.** The point is that a user can read why. A number
they can't interrogate is the gimmick with extra steps.

## Consequences

- More work than a heuristic: ten strategies, a regime filter, position
  sizing, and a backtest harness must exist before the advice feed can render
  anything real. The engine is therefore built and unit-tested before any
  screen consumes it.
- The track record page can embarrass the product. That is the feature.
- Caveats must be stated plainly on the methodology page: no survivorship
  adjustment on the mock universe, no slippage model in v1, in-sample where
  noted. Overstating results would be the same failure the decision exists to
  avoid.
