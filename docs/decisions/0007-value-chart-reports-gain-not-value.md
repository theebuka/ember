# 0007 — The portfolio chart's headline number is gain, not change in value

**Status:** accepted · phase 2

## Context

The dashboard's value chart carries a chip summarising the selected range. The
obvious implementation is `lastValue − firstValue`, and it is what almost every
retail app shows.

On the sample book it read **+$56,411.58 over 3m**. The actual market gain over
that window was about **$5,155**. The difference was $25,494 of contributions —
two positions bought inside the range — plus the compounding of positions that
already existed.

A green chip reading +$56,411 next to a chart, on a screen whose other numbers
are all P&L, states that the user made fifty-six thousand dollars. They didn't.
It is not a rounding error or a debatable convention; it is the wrong number,
and it is wrong in the flattering direction.

## Decision

The chip reports the change in **unrealized gain**:

```
(value_end − cost_end) − (value_start − cost_start)
```

Subtracting cost at both ends removes contributions and withdrawals, leaving
the part the market moved. The label says `unrealized, over 3m` rather than
leaving the reader to infer what is being measured.

## Alternatives considered

**Change in value, labelled "value change".** Honest wording, but the chip is
tinted moss or clay and sits in a column of P&L figures — the treatment says
"gain" regardless of the label, and the treatment is what gets read.

**Time-weighted return.** The correct answer to "how well did I invest",
insensitive to the timing of contributions, and what a fund would report. It
is also a rate rather than an amount, needs a second explanatory line, and
answers a question the user hasn't asked yet. Worth adding on the portfolio
page beside the track record; wrong as the one number on a dashboard chip.

**Money-weighted return (IRR).** Same objection, plus it needs a solver and can
fail to converge on a book with large late contributions.

## Consequences

- Realized P&L booked *inside* the range is not counted in the chip, so a
  period whose gain came mostly from a sale reads lower than the user's
  intuition. Realized is shown separately in the hero, which is where it
  belongs; the chip is explicitly about what is still open.
- `portfolioValueSeries` has to carry cost alongside value at every point. It
  already did, because the chart draws the invested line — the honest number
  and the useful chart wanted the same data.
