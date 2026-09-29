# 0036 — The window engine, and two levers that turned out to be inert

**Status:** accepted
**Date:** 2026-08-17

## Context

The execution window is the product's differentiator — every competitor ships a
BUY badge and almost none say *when*. The plan for this phase carried four changes
to it, and the interesting result is that **two of the four could not do what they
were meant to**, which was only visible once they were built and measured.

## Decision

### 1 · The horizon is per-market, and derived

`HORIZON_HOURS = 72` was one constant for all three markets. The number was never
wrong for equities; it was the wrong *kind* of number, because nothing said what
it was for.

What it is for: **the horizon must be long enough to contain the next liquidity
crest, and no longer.** Decay strictly favours the earliest crest and liquidity is
near-identical from one session to the next, so the peak is always in the first
available session — searching past it draws three days of band to answer a question
settled in the first eight hours. So the binding constraint is the longest a market
can be *shut*:

| | longest closure | horizon |
|---|---|---|
| equity | Fri 16:00 → Mon 09:30 local, ~66h | 72h |
| fx | Fri 21:00 → Sun 21:00 UTC, 48h | 72h |
| crypto | never | **36h** |

Two of the three land on the same number and that is the finding rather than a
failure to differentiate: for exchange-traded instruments the *weekend* sets the
horizon, not the market's own cadence. Only crypto can be shorter.

The copy follows. "No tradeable window in the next three days" was a literal
string, and it became wrong on a third of the universe the moment crypto's horizon
was 36 hours — the same shape of defect as the methodology page's hardcoded
"prices in this build are generated" (decision 030). It is derived from the
horizon now.

### 2 · Dissent narrows the window — through the threshold, not the decay

`assess()` already cuts blended *confidence* when strategies disagree, which
governs whether a call is shown at all. The other half of that thought was missing
from the engine: a call four rules like and three dislike deserves a **shorter**
window, because the case for it is more fragile.

The first implementation shortened the effective half-life. It is the more elegant
story — a contested edge decays faster — and **measured, it did nothing at all.**

Decay across a 72-hour horizon is `exp(−ln2 · 3 / halfLifeDays)`. The blended
half-life of every call this engine actually produces lands between **24 and 75
days**, so that term is 0.92 at the fast end and 0.96 at the slow one. Against a
liquidity term that swings from 0 to 1 inside one session, a 4% tilt is invisible:
halving the half-life moved no window's boundaries by a single hour.

The span is decided by which hours clear `WINDOW_THRESHOLD`, so that is the only
lever that can narrow it. Dissent now raises that bar from half the crest to up to
80% of it, which reads as something true and stronger than the decay version:
**for a contested call, "good enough to fill in" means better.** Measured, on a
mid-week afternoon at a 45-day half-life:

| dissent | equity | fx | crypto |
|---|---|---|---|
| none | 6.0h | 13.0h | 36.0h |
| a quarter | 6.0h | 12.0h | 11.0h |
| half | 2.0h | 11.0h | 9.0h |
| all | 1.0h | 8.0h | 7.0h |

### 3 · The track record enters where a user could actually have filled

The backtest computed each assessment from bar *k*'s close and then **entered at
bar *k*'s close**. That is not lookahead in the signal — `buildContext` truncates
correctly — but it is lookahead in the *fill*: you learn a close at the close, and
the first price you can trade is the next session's open.

So entries move to the next bar's open, or later if the window opens later, and
each trade records `signalPrice`, `entryPrice`, `entryLagBars` and `actionGap` —
the return given up between the call and the earliest fill. The track record page
shows the average in its own block, because it answers a different question from
every other stat there: not how the calls did, but how much of that was reachable.

The stop stays where ember put it. The card gives an absolute price; if the delay
moved the market against you your risk on that trade is genuinely larger than the
card implied, and re-deriving the stop from the fill would hide exactly the cost
this change exists to publish.

## What was dropped, and why

### The risk profile's horizon axis

The plan asked for a third axis: "Conservative should not be shown short-window,
high-velocity calls at all — not merely fewer of them." It was built —
`minHorizonDays` on the profile, a `suitsProfile()` predicate kept deliberately
separate from `qualifies()` and `isReady()`, a row in the settings comparison — and
then measured, and it **filtered nothing**: 17 → 17 calls on Conservative, 78 → 78
on Balanced, 143 → 143 on Aggressive.

The reason is worth recording, because it is a fact about the ensemble rather than
about the threshold. A fast rule has to out-weigh fifteen slower ones to lead a
call, and the two fast rules cannot: `connors-rsi2` carries 0.2–0.85 confidence and
`short-reversal` is capped at 0.45 by design (its published edge lives inside a
spread ember does not model). Measured over every qualifying call, the leading
agreeing driver was **mean-reversion in 6 of 143 on Aggressive and 0 of 78 on
Balanced and 0 of 17 on Conservative**, and the blended holding period never fell
below 61 days on any profile.

So the ensemble structurally does not produce a short-horizon call, and a profile
axis to exclude them is machinery for a case that does not arise. It was removed
rather than shipped inert. A filter that never fires is a claim the product does
not keep — the same objection decision 047 makes to a disabled switch, which
"reads as *off*, and that is a claim about a setting".

This has a larger consequence, and it is in §8: **§5 attributes the app's tightest
execution windows to `connors-rsi2`, and in practice that essentially never
happens.** The window is set by liquidity and now by dissent; the half-life axis is
dormant for every call the engine actually makes.

## Alternatives considered

**Keeping `suitsProfile` as a guardrail** that would bite if a fast rule ever
gained weight. Rejected: an inert filter rots, and the thing that would need to
change first is the blend, at which point this is the wrong layer to be looking at.

**Raising the profile thresholds until they bit.** The blended holding period's
10th percentile is 61 days and its median 89, so a Conservative floor would have
to sit near 90 days to filter anything — a number chosen to make a feature fire
rather than derived from what the profile means. Exactly the failure decision 092
and the phase-24 floor recalibration both warn about.

**A tighter `WINDOW_THRESHOLD` for crypto**, because at zero dissent crypto's
window fills its entire 36-hour horizon. Rejected: the threshold means one thing —
"at least half as good as the best moment" — and crypto's window is wide because
crypto genuinely has no bad hour to exclude, not because the model is failing. The
crest is carried by `peakAt` and by the band's own intensity ramp, which is what
that ramp is for. Recalibrating the signature component's appearance across the app
to make one market's number look tidier is the wrong trade.

**Re-deriving the stop from the delayed fill.** What a real trader would do, and it
would quietly erase the cost the fill change exists to measure.

## Consequences

- **`halfLifeDays` is now on the `Assessment`.** It shapes the window and nothing
  outside `assess()` could read it — a band whose steepness comes from an invisible
  number is a band nobody can check.
- **The window's decay term is dormant, and that is now written down** rather than
  implied by a comment describing three multiplied factors. It would matter for a
  half-life of a few days; the blend does not produce one.
- **The action gap measures ~0 on generated data**, which is correct and says
  nothing: the next open against the previous close is symmetric noise on a random
  walk, and it averages out over 1,500 trades. It will be non-zero on real prices,
  where overnight gaps run with the signal.
- **On daily bars the window cannot change the fill.** The lag is exactly 1.00
  bars for every trade in every profile, because `opensAt` always falls inside the
  next bar. The "or later if the window opens later" branch is real code that a
  daily-bar backtest never exercises — the window is a live-trading affordance, and
  pricing it needs intraday bars ember does not have.
- **Every figure in §8 moved again**, and for a reason unrelated to the strategies:
  entries are now a bar later and at an open rather than a close.
- **Exchange holidays are still not modelled**, and the per-market horizon gives
  that a second place to bite: a Monday holiday puts the real next equity session
  ~91h out, past the 72-hour horizon. It changes nothing today only because
  `liquidityAt` also believes Monday is open.
