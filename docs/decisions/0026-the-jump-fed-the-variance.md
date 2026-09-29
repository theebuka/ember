# 0026 — The jump fed the variance, and a hundred instruments found it

**Status:** accepted · phase 15

## Context

Expanding the universe from 13 instruments to 110 turned three engine tests
red. Every price in the affected series was `NaN`.

The first suspicion was the inputs: six of the new crypto rows carry an
annualised volatility above 1.0, where v1's ceiling had been 0.92. That was
wrong, and it is worth recording *why* it was wrong, because capping the inputs
would have made the tests pass while leaving the defect in place.

## The actual defect

`generateReturns` in `mock/series.ts` models volatility clustering with a
GARCH(1,1) variance process (ADR 0009 — without clustering there are no
regimes, and the regime filter is untestable). Jumps are layered on top for the
discontinuities a diffusion cannot produce.

The variance recursion was fed **the whole return, jump included**:

```ts
r = drift − variance/2 + sd·z            // diffusion
if (rng() < jumpRate) r += ±sd·(2…5)     // jump
previous = r                             // ← both, into the next variance
```

A jump is 2–5σ *by construction*. So `α · jump²` is between 0.32 and 2.0 times
the current variance, and with α = 0.08, β = 0.9 every single jump ratcheted
the volatility level permanently upward — faster than β could decay it before
the next one arrived. Over a thousand bars at a jump rate of ~2.5%, the process
compounded instead of clustering.

Once `variance` overflows, `exp(−variance/2)` underflows to zero, the final
close is zero, and the rescale in `generateDaily` divides by it. The whole
series comes out `NaN`, and the engine consumes it silently — `assess()`
returned a score of `NaN`, which compares false against every bound and
propagates to the screen.

α + β = 0.98 makes the recursion stationary *in expectation*, which is what
made this look safe. Stationary in expectation is not bounded. Thirteen
instruments over a thousand bars simply never rolled the seeds that trip it;
a hundred and ten did.

## Decision

**Only the diffusive residual feeds the variance recursion.** This is the
standard GARCH-with-jumps specification — the variance is driven by the
diffusion, and the jump component sits beside it rather than inside it.
Clustering is unaffected: a large diffusive shock still raises the variance and
still decays slowly. What stops is the one-way ratchet.

**And a hard ceiling at 25× the base variance** — five standard deviations of
daily move — as a backstop. Measured across all 110 instruments after the fix,
the peak realised 20-day volatility is **4.13× spec** (TIA), so the clamp does
not bind on any generated path. It exists so that no seed, on no instrument
added to the universe later, can produce a series of `NaN` prices.

## Alternatives considered

**Cap the volatility inputs at 0.92.** The change the symptom suggested. It
would have made the tests pass, left the ratchet in place, and made the defect
a property of the *data* — so the next person to add a volatile instrument
would rediscover it, with no comment anywhere explaining the ceiling.

**Guard the rescale against a non-finite scale.** Defensive code that hides a
bug. The series would stop being `NaN` and start being silently wrong.

**Lower β.** Would reduce how often it compounds without making it impossible,
and it would weaken clustering — which is the one thing this generator exists
to produce.

## Consequences

- **Every generated price changes.** Anchors still hold, since the rescale is
  unchanged, but every return in every series is different. Combined with the
  move from `isActionable` to `qualifies` in the backtest, this invalidated the
  track-record figures quoted in CLAUDE.md §8; they were re-measured in the
  same phase with `scripts/measure.mjs`.
- The existing test that walks every instrument checking `h ≥ max(o,c)` is what
  caught it, and is what will catch it again — it is a whole-universe
  invariant, not a spot check, which is why 110 instruments could find what 13
  could not.
