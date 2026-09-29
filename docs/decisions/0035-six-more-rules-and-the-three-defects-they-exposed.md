# 0035 — Six more rules, and the three defects they exposed

**Status:** accepted
**Date:** 2026-08-17

## Context

The plan's diagnosis of the ensemble was that it is trend-heavy: five of ten rules
were trend or momentum, and the payoff shape §8 reports — a hit rate near four in
ten, a positive mean, a negative median, half the trades stopped out — is exactly
what a book of correlated trend rules produces. The remit for this phase was to
diversify *away* from trend.

Two constraints were already fixed before a line was written. Phase 23 measured
Finnhub's filings endpoint at **zero of twelve international listings** — it is
EDGAR-derived, so 92 of 164 equities have no accounts at all — which means every
addition has to be **price-only** or it is silently a US-only feature. And ADR
0033 recorded that no free tier ember has serves an inflation series, which turned
out to matter (below).

## Decision

**Six rules, all citable, all price-only.**

| Rule | Source | What it adds |
|---|---|---|
| Betting against beta | Frazzini & Pedersen (2014) | The first rule in the engine that is not a bet on price — it reads the *relationship* between an instrument and its market |
| Residual momentum | Blitz, Huij & Martens (2011) | Momentum with the factor exposure stripped out, which is what raw momentum is quietly carrying |
| 52-week high proximity | George & Hwang (2004) | An anchoring effect that separates a name that ran and held from one that ran and gave a third back |
| Short-term reversal | Jegadeesh (1990), Lehmann (1990) | The engine's genuine opposite number — a rule that says *sell the thing that just ran* |
| Industry momentum | Moskowitz & Grinblatt (1999) | The only rule about a group rather than an instrument |
| Currency momentum | Menkhoff, Sarno, Schmeling & Schrimpf (2012) | Total return rather than spot: FX had four rules and none of them added the carry to the price move |

**`defensive` is a new family**, not a kind of value. It needs its own regime
treatment because it is the only family whose edge *improves* when the market
falls — that is the published mechanism, not a coincidence — so it is the one
place a stressed regime raises a weight. Conservative weights it 1.35, the
strongest preference either profile expresses; aggressive weights it 0.6 rather
than zero, because taking more risk on purpose is not the same as pretending the
evidence is absent.

**A cross-section is a property of a market on a date, not of the instrument being
assessed** (`lib/signals/cross-section.ts`). Five of the six additions are
cross-sectional, and computing each one's peer sweep inside each strategy would
have meant the same 176-name pass run five times per assessment and 214 times per
evaluation date. The snapshot is computed once per market per day and shared,
cached on the universe object.

## What this phase found

None of these three was in the plan. All three were found by measuring — the
first by a test written to check something else, the second by a profiler, the
third by counting what the settings screen would show.

### 1 · Two of ten rules were one rule, and the ensemble could not tell

`collinearity.test.ts` was written because the plan asked for a check that the new
families are not collinear with the trend book. The first thing it measured was
**`ts-momentum` against `dual-momentum` at exactly 1.00** across 176 equities.

Dual momentum's score was `min(absoluteStrength, relative)`, and
`absoluteStrength` was `squash((own − cash) / vol, 1.2)` — the same expression, to
the character, as `ts-momentum`'s entire score. With twelve-month returns clustered
the way they are, the `min` almost always picked the absolute term.

This is not a cosmetic overlap, and it is worth being precise about why. `assess()`
weights each rule by its own confidence and **raises** blended confidence when
rules agree. A duplicated opinion therefore does not cancel out and does not
announce itself: it doubles one rule's weight and manufactures the unanimity this
codebase calls the tell of a gimmick. Two of ten voices on every equity were one
voice, and confidence was higher for it.

The fix is also the more faithful reading of Antonacci. His rule is a *switch* —
fail absolute momentum and you hold cash, clear it and you hold the best relative
performer — so magnitude was never meant to come from the absolute leg. The peer
ranking now carries the score on both sides of the gate, and "trailed cash and
everything else" is properly distinguished from "trailed cash while still leading
its peers". Correlation fell to 0.94.

### 2 · The most expensive thing in the engine was a loop that should not have existed

Profiled over 1,760 contexts, **`clenow` cost 1,726ms against 257ms for every
other rule put together** — essentially the entire cost of the walk-forward
backtest, and therefore of the 18.5-second track record §8 flags as too slow.

Two compounding mistakes in one loop. It read
`closesOf(peer.candles).slice(-WINDOW)`, converting all 420 bars of every peer to
produce ninety numbers — the exact error `annualisedVol`'s own comment in
`shared.ts` warns about, made three files away. And it recomputed a *market-wide*
quantity once per subject, when a peer's ninety-day momentum on a given date is
the same fact for every subject on that date.

Moving it into the snapshot took that sweep from 20,416 runs per backtest profile
to 579. `xs-momentum` and `dual-momentum` followed for the same reason, and once
no equity rule read a peer's bars at all, the 74,000-element copy `buildContext`
performed on every context became pure waste and went behind a memoised getter.

Measured with `runBacktest` directly, over one shared universe, all three
profiles:

| | six rules added | after the three fixes |
|---|---|---|
| conservative | 23.4s | **12.0s** |
| balanced | 17.9s | **8.2s** |
| aggressive | 9.4s | **4.7s** |
| all three | 50.7s | **24.9s** |

There is deliberately no "before this phase" column. The pre-phase figure in §8
(18.5s) is a *route* measurement — `/api/track-record` loads its own universe per
profile — and putting it beside an engine measurement would be comparing two
instruments while implying one number. The comparable claim is the one the gate
makes, and it is the useful one: the route costs about what it did before, with
60% more rules inside it.

**Every intermediate step produced byte-identical output** — the same call counts,
hit rates, average returns and drawdowns at each stage — which is the only thing
that makes a performance change safe to make in the same commit as a behavioural
one.

### 3 · Confidence is not comparable across ensemble sizes, and the floors broke twice

The last thing found, and the most consequential.

`assess()` reduces blended confidence for two reasons: strategies disagreeing
(`agreementFactor = 1 − dispersion`) and strategies abstaining (`coverage`
divides by every *applicable* rule, so a rule that honestly has no view still
costs the ones that do). **Both grow with the number of rules whether or not the
added rules are informative.** Going from ten to sixteen moved the whole
distribution down — mean 26, median 25, maximum 54 — and the fixed floors of
45 / 35 / 28 then bit far harder than they were calibrated to. Measured:

| Floor | Conservative | Balanced | Aggressive |
|---|---|---|---|
| 45 (old Conservative) | 4 | 4 | 5 |
| 35 (old Balanced) | 28 | 32 | 34 |
| 28 (old Aggressive) | 62 | 77 | 98 |

Two things are visible in that table. **Conservative surfaced 4 instruments out
of 214**, which is not a cautious profile but a broken one. And at any *shared*
floor the three profiles are nearly identical, which means the floor was again
doing essentially all the differentiating — the exact defect ADR 0013 exists to
document, recurring for the same underlying reason.

So the floors are re-derived from the distribution the engine now produces:
**37 / 28 / 23**, restoring the shares ADR 0013 chose. Measured after: 20 / 77 /
143 of 214, against 20 / 78 / 136 before this phase.

This is maintenance of a documented calibration rather than tuning toward a
preferred answer, and it is deliberately recorded as a *symptom*. **A fixed
threshold on a relative scale is not portable across a change in ensemble size**,
so every future phase that adds or removes a rule has to re-measure it. The
durable fix is to stop confidence depending on rule count — divide `coverage` by
the rules that could plausibly speak rather than by all of them, and make
dispersion sample-size aware — which changes every number in the app and belongs
with correlation-aware weighting in a phase of its own. It is §9's item 4.

One consequence is user-visible and worth stating rather than hiding: with
Balanced's floor at 28 and Aggressive's at 23, **all three profiles now surface
some calls badged `Low`**, where previously only Aggressive did. The label
describes the evidence and the floor describes what a profile asked to be shown;
they used to coincide at 35 and the coincidence was never the point.

## Alternatives considered

**An FX rule on real-yield deviations**, which is what the plan actually asked for.
Abandoned once written down: a real yield is a nominal rate less an inflation
rate, and no free tier ember has serves a CPI series — Finnhub's economic calendar
is 403 on the free plan, measured in phase 21. The choice was a formula with an
invented inflation number inside it or a different rule. A fabricated input is
worse than a missing formula, because the output looks exactly as calculated as a
real one. Currency momentum uses only what ember has (a spot path and a policy
rate) and is separately citable.

**Sector-neutral momentum** rather than industry momentum. Ranking a name within
its own sector is the more obvious reading of "sector-relative", and it removes
exactly the signal Moskowitz & Grinblatt say is doing the work — their finding is
that controlling for industry accounts for much of individual momentum, so the
industry *is* the signal. Every member of a sector gets the same score here, which
is the honest expression of a claim about a sector.

**A pairwise correlation gate set just under the worst surviving pair.** Rejected
for the same reason decision 092 rejected a CLS gate chosen to pass. The hard gate
is 0.98 — a duplication detector, calibrated on an actual duplicate — plus an
exact, named list of the pairs that genuinely move together, so nothing can join
it quietly.

**Leaving the confidence floors alone and documenting that Conservative surfaces
four instruments.** Honest, and a broken setting is not made acceptable by being
described accurately. The copy on that profile promises "fewer signals", not
almost none.

**Fixing the confidence formula in this phase instead of the floors.** The right
answer and much too large: it moves every figure in §8 and every count on the
settings screen, and it wants its own re-measurement rather than sharing one with
six new rules and three performance changes.

**Reclassifying the new momentum rules into other families to make the family
counts look more balanced.** The family is what the regime filter and the risk
profiles read, so it has to describe what the rule is, not what the register of
families ought to look like.

## Consequences

- **The gate passed on the recalibrated engine**: 350 tests, 60 page audits with 0
  violations, 58 screenshots with no horizontal overflow at any width from 320 to
  1920, layout shift worst 0.067, and a walk-forward over all 214 instruments.
  Balanced's average return is now **+0.1%**, which is zero — the honest outcome of
  more rules disagreeing over data with no structure in it, and worth stating
  rather than rounding past. The drawdowns fell across all three profiles while the
  medians held, which is the only part of the change that would be evidence of
  anything.
- **The additions are distinct, measured.** Strongest correlation against the
  existing ten: `week52-high` 0.76, `residual-momentum` 0.58, `short-reversal`
  −0.42, `industry-momentum` 0.26, `bab` 0.09, and `currency-momentum` −0.07
  against `fx-carry`. The negative figures are the point — short-term reversal
  exists to disagree, and BAB at 0.09 is very nearly orthogonal to everything.
- **Three rules remain near-collinear and it is not fixed here.** `ts-momentum`,
  `xs-momentum` and `dual-momentum` sit at 0.88–0.94, because all three are
  transforms of one twelve-month return. So sixteen rules is not sixteen opinions,
  and part of the agreement those three supply is arithmetic rather than evidence.
  The real fix is weighting by *effective independent voices*, which moves every
  number in the app and is a decision to take deliberately rather than fold into a
  phase about adding rules. In §8, with the guard test that stops it growing.
  - The first hypothesis for it was wrong and is recorded because it was checked:
    that generated prices have no market drift, so "beat cash" and "beat your
    peers" collapse into one comparison. Measured, the generated equity universe
    returns +10.9% over twelve months with a 36.6% cross-sectional spread. The
    overlap is in the rules, not in the data.
- **Adding rules lowers confidence, and on the old floors it collapsed the call
  counts.** Measured before the floors were re-derived: Balanced backtest calls fell
  from 1,357 to 774 and Conservative from 427 to 131, and the settings preview fell
  from 20 / 78 / 136 of 214 to 4 / 32 / 98. After the recalibration the counts land
  at **478 / 1,605 / 2,532** backtest calls and 20 / 77 / 143 in the preview. Every
  figure in §8 moves with this, and no single one of them can be attributed to any
  one of the three changes that landed together.
- **Peers were being compared across different dates, and that is fixed.**
  `buildContext` cut every peer at the *subject's* array index, with a comment
  saying that was sound "because instruments in one market share a trading-day
  grid". True while all 72 equities were American; false from phase 23, where
  Yahoo returns 1,214 bars for one listing and 1,280 for another. Peers are now
  cut by UTC day. Nothing failed before — cross-sectional rules simply ranked a
  Tokyo name's return-to-February against a New York name's return-to-today.
- **`FAMILIES` in `/api/strategies` is derived from the registry now.** It was a
  hand-written list of seven and adding `defensive` left it behind, which is the
  exact drift ADR 0012 built that route to prevent.
- **Residual momentum detects a change in drift, not a level of it.** A property
  of the published construction, easy to misread, and it is why the estimation
  window wants to be several times the measurement window. Blitz et al. get 3×;
  ember's 420-bar ceiling gives 1.8×, so the signal arrives attenuated. Recorded
  rather than tuned around — raising the ceiling would let a live evaluation see
  more history than a backtest evaluation, and that gap is the one thing that
  would stop the track record describing the live engine.
- **Two documented departures from Blitz et al.** They regress on Fama–French
  three factors; ember regresses on one equal-weight market, because SMB and HML
  need book values and market caps that 92 of 164 listings do not have. And they
  estimate over 36 months of monthly data. Both are on the methodology page.
- **Beta is estimated the paper's way, and that turned out to matter more here
  than in the paper.** Frazzini & Pedersen use three-day overlapping returns for
  the correlation to handle non-synchronous trading; with sixteen venues that bias
  is not hypothetical — Tokyo closes six hours before New York opens, so a
  Japanese listing's response to a US move lands on the following bar and a
  same-day regression misses it.
- **`short-reversal` is capped at 0.45 confidence and `bab` at 0.5.** Jegadeesh's
  edge lives largely inside the bid-ask spread and ember models no spread; the
  low-beta premium pays over years and says nothing about this week. Both caps are
  asserted in tests, because a caveat in a comment is a caveat until someone
  reaches past it.
