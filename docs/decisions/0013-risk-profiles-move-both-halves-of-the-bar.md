# 0013 — The risk profile moves both halves of the bar, not just conviction

**Status:** accepted · phase 8

## Context

The risk profile is sold as the setting that changes what ember recommends.
`RISK_PROFILES` gave each profile its own `actionThreshold` — the blended
conviction a call needs before it reaches the feed — along with a volatility
target, a position cap and its own family weights. Conservative asked for
0.35, Aggressive for 0.15.

`isActionable()` also required `confidence >= 35`, and that number was a
constant shared by all three profiles.

Phase 8 built a comparison into the settings screen: how many instruments
clear each profile's bar *right now*, computed by running the ensemble once
per profile. It came back **3 / 3 / 3**.

Not a bug in the counter. The engine's confidence is a product of four
sub-unit terms and lands in roughly 10–55 in practice, so a fixed floor of 35
excluded most of the universe on its own, and it excluded the same instruments
whichever profile was asking. Meanwhile the conviction thresholds almost never
bit: on that day MSFT scored 0.578 — clear of even Conservative's 0.35 — and
was filtered out of all three by confidence 28.

So the profile changed position *sizes* and nothing else visible, while its
own copy promised "fewer signals" and "more signals". Those sentences were
false, and had been since phase 1.

## Decision

`confidenceFloor` becomes part of `RiskProfileConfig` and moves with the
profile:

| Profile | Conviction | Confidence |
|---|---|---|
| Conservative | 0.35 | 45 |
| Balanced | 0.22 | 35 |
| Aggressive | 0.15 | 28 |

The same market now reads 2 / 3 / 4.

Balanced keeps the original 35 deliberately, so the documented backtest
figures still describe the profile they were measured on.

## Alternatives considered

**Leave the engine, rewrite the copy.** Honest, and much worse: it would
concede that the app's most prominent setting is mostly cosmetic. The
consequence sentences were right about what the setting *should* do.

**Raise conviction thresholds until they bind.** Would work, but it models the
wrong thing. Conviction is how strongly the strategies point; confidence is how
much they agree and how much evidence they had. A cautious investor's real
demand is *more evidence*, not a bigger swing — and it is the second of those
that the numbers say is scarce.

**Scale confidence to fill 0–100 so 35 means something.** Rescaling a
calibrated quantity to make a UI threshold look reasonable is how a number
stops meaning anything. The labels (`Low` < 35, `Moderate` 35–55, `High` ≥ 55)
are calibrated to the real distribution and stay that way.

## Consequences

- **Aggressive surfaces calls badged `Low`,** because 28 sits below the
  `Moderate` boundary. That is the trade the profile asked for, and the badge
  says so on the card rather than hiding it.
- Conservative genuinely surfaces less. On the current universe that is two
  calls out of thirteen instruments, and the settings comparison says so
  before the user picks it — the alternative is a near-empty feed that reads
  as breakage.
- The backtest gates on `isActionable`, so the Conservative and Aggressive
  track records change. Balanced's — the one quoted in `CLAUDE.md` — does not.
- The finding is the argument for the feature. A settings screen that shows
  the measured consequence of a setting caught a false claim that three phases
  of building the engine, and its own tests, did not.
