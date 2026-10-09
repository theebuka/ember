# How ember decides

Source of truth for the in-app methodology page. Every claim here must match
`src/lib/signals/`; if they diverge, the code is right and this needs updating.

---

## The rule

**Every signal traces to published work.** No invented heuristics, no
unpublished rule sets, no opaque model score. If a strategy can't be cited,
it doesn't ship. See [ADR 0005](./decisions/0005-published-strategies-only.md).

---

## The pipeline

```
candles ─► indicators ─► strategies ─► ensemble ─► regime ─► sizing ─► window
            (pure)       (−1…+1 each)  (weighted)  (filter)  (Kelly)  (36–72h)
```

Every stage is a pure function over OHLCV bars in `src/lib/signals/`. The mock
generator and a live feed produce identical inputs, so turning on real data
changes nothing about how a decision is reached — **which is now measured
rather than claimed**: phase 21 connected four real providers without touching
a component, a route, a store or an engine module (ADR 0033).

### Where the numbers come from

`EMBER_DATA_PROVIDER=live` routes each market to whoever serves it:

| | prices and history | fundamentals | news |
|---|---|---|---|
| equity, US | Yahoo `chart` | Finnhub, the filed 10-K | Finnhub |
| equity, international | Yahoo `chart` | **none available** | Finnhub |
| equity, Lagos | the NGX itself | none | Finnhub |
| crypto | CoinGecko | — | Finnhub |
| fx | ECB daily reference rates | — | Finnhub |

ember watches 214 instruments across sixteen exchanges. Each venue carries its
own trading hours, so an execution window for a Tokyo listing is computed in
Tokyo hours and closes at the Tokyo close — including its lunch break, during
which liquidity is zero rather than merely thin.

Two consequences worth stating. **Piotroski and the Magic Formula abstain for
every non-US listing**, because the only free source of filed accounts is
derived from SEC EDGAR and knows about companies that file with the SEC.
Abstention costs coverage rather than confidence. And **the twelve Lagos
listings are priced but not assessed**: the Nigerian Exchange publishes today's
board and no history at all, so ember stores a session a day and will form a
view once it holds about two hundred.

Three things stay modelled even then, and each says so where it appears:
central-bank **policy rates** (no free API serves the set), the **macro release
calendar** (earnings dates are real; CPI, FOMC and payrolls are not), and a
coin's **realised capitalisation** (a 200-bar EMA of market cap, over a real
price path and a real supply).

Two limits are properties of the sources rather than of ember. The ECB
publishes one FX rate a day, so an FX bar has no open, high or low and its true
range is the close-to-close move; the same is true of crypto bars older than
thirty days. Fabricating a plausible daily range to fill either gap was
rejected outright — see ADR 0033.

---

## The strategies

### Trend and momentum

**Time-series momentum** — Moskowitz, Ooi & Pedersen (2012), *Journal of
Financial Economics* 104(2). Has this beaten cash over twelve months? The sign
of the trailing excess return predicts the next month's, across 58 instruments
and four asset classes — which is why it's the one strategy applied to all
three of our markets. Direction from the sign as published; conviction scaled
by volatility, following the paper's own vol-targeted sizing.

**Cross-sectional momentum** — Jegadeesh & Titman (1993), *Journal of Finance*
48(1). Is this beating its *peers*? The classic 12-1 construction: twelve
months of return, skipping the most recent one, because short-horizon returns
reverse and including them dilutes the effect. Useful precisely where
time-series momentum isn't — in a broad rally everything beats cash, and only
the relative measure identifies leadership.

**Clenow momentum ranking** — Clenow, *Stocks on the Move* (2015). Annualised
exponential regression slope × R². The R² term is the whole idea: two names
can post identical 90-day returns while one climbed steadily and the other
spiked once and chopped. Multiplying by goodness of fit separates the
tradeable from the already-resolved. Two published filters apply — price above
the 100-day average, and any single-day move beyond 15% disqualifies the name
as news rather than trend.

**Dual momentum** — Antonacci (2014). Absolute first, then relative. If it
hasn't beaten cash, nothing else matters and the answer is cash; only what
clears that gate gets ranked. The ordering is what makes this the ensemble's
defensive voice: pure relative momentum always names a best performer, even in
a market where everything is falling.

The absolute leg decides the *sign* and the peer ranking decides the strength,
because Antonacci's rule is a switch rather than a magnitude. Worth stating
because it used to work the other way, and the consequence was that this rule
and time-series momentum produced identical numbers — measured at a correlation
of 1.00 across 176 equities. Two of ten voices were one voice, and because
disagreement lowers blended confidence and agreement raises it, the duplication
made ember *more* confident rather than announcing itself.

**Donchian breakout** — the Dennis/Eckhardt Turtle rules, via Faith, *Way of
the Turtle* (2007). Twenty-day channel entry with fifty-five-day confirmation.
Distance beyond the channel is measured in ATR, not percent, so a breakout in
a quiet instrument and a violent one score on the same scale.

**Residual momentum** — Blitz, Huij & Martens (2011), *Journal of Empirical
Finance* 18(3). The same twelve-month signal, with the market taken out. Raw
momentum is partly a disguised factor bet: a name that outran its peers may have
done so on its own merits or may simply be the highest-beta thing in a market
that went up, and those are the same number in a return ranking. Stripping the
exposure out and ranking on the residual — scaled by residual volatility, which
is half the effect — earns the same return at roughly half the volatility.

Two departures from the paper, both forced by what ember can see. It regresses on
Fama–French three factors; ember regresses on one equal-weight market, because
SMB and HML need book values and market caps that 92 of 164 listings do not have,
and a three-factor version would silently be US-only. And it estimates over 36
months of monthly data where ember uses its 420-bar daily ceiling. One property
follows from the construction and is easy to misread: **this detects a change in
drift, not a level of it.** A name that has quietly out-drifted its market by the
same margin for two years scores zero here, correctly — momentum is a statement
about the recent past against the less-recent past, and a constant is neither.

**52-week high proximity** — George & Hwang (2004), *Journal of Finance* 59(5).
Where the price sits relative to the highest print of the past year. Their
finding is that this predicts returns better than twelve-month momentum does, and
that with both in the same regression the price-to-high measure survives while
past return largely does not. The reading is anchoring: the 52-week high is the
number every holder knows, so good news about a stock near it is discounted
slowly. It earns its place beside the momentum rules because the two come apart
in a common case — a name that ran hard and then gave a third back still ranks
well on twelve-month return and badly here.

**Industry momentum** — Moskowitz & Grinblatt (1999), *Journal of Finance* 54(4).
The sector's trend, not the instrument's. Their result is uncomfortable and that
is why it is carried: controlling for the industry a stock is in accounts for much
of individual-stock momentum, so what looks like "this company is winning" is to a
large extent "this company is in the sector that is winning". Every name in a
sector therefore gets the same score, which is the honest expression of a claim
about a sector — and it is capped low, because an industry tailwind is a reason to
prefer a name and never on its own a reason to buy one. A sector with fewer than
four names ember tracks is omitted: the mean of three companies is not an industry.

### Low risk

**Betting against beta** — Frazzini & Pedersen (2014), *Journal of Financial
Economics* 111(1). The cleanest violation of the CAPM there is. Theory says
expected return rises with beta; measured, the line is far flatter and often
slopes the wrong way, so low-beta assets earn more per unit of risk. The
explanation is what makes it credible rather than a curiosity: investors who want
more return than the market but cannot or will not borrow have one lever left,
which is to buy high-beta assets, and that crowding bids their prices up. It shows
up in US equities, in nineteen other equity markets, in Treasuries, in credit and
in futures.

This is the only rule in the engine that is not a bet on price — it reads the
*relationship* between an instrument and its market — which is why it is its own
family, and why it is the one thing the regime filter trusts *more* when the
market falls. Beta is estimated the paper's way: correlation from three-day
overlapping returns, volatility from daily ones, then shrunk 0.6/0.4 toward one.
The two windows are not a simplification but the paper's answer to
non-synchronous trading, and with sixteen venues that bias is not hypothetical —
Tokyo closes six hours before New York opens, so a Japanese listing's response to
a US move lands on the following bar and a same-day regression misses it.

Its confidence is capped at half scale. The low-beta premium is measured over
decades and says nothing whatsoever about this week; a risk premium must not be
able to produce the same conviction as a breakout that resolves in ten days, or
the execution window this product is built around stops meaning anything.

### Lottery demand and attention

**The MAX effect** — Bali, Cakici & Whitelaw (2011), *Journal of Financial
Economics* 99(2). Sort stocks on their largest single-day return over the past
month: the highest tenth underperformed the lowest by more than 1% a month, after
controls for size, value, momentum, short-term reversal, liquidity and skewness.
The reading is that some investors pay up for a small chance of a large payoff,
and a stock that has just shown it can jump looks like one. It also accounts for
the idiosyncratic-volatility puzzle, which is why ember carries this rather than a
separate volatility rule.

Equities only. In crypto the sign reverses, and coins with the biggest up-days
have kept rising (Li, Urquhart, Wang & Zhang, "MAX momentum"). Its confidence is
capped at 0.4, because the effect is strongest where retail investors trade and
weakest in large, institutionally held names, which is most of this universe, and
replications outside the US are mixed. It reads the same month as short-term
reversal; measured on the generated universe the two correlate at 0.32.

**The high-volume return premium** — Gervais, Kaniel & Mingelgrin (2001),
*Journal of Finance* 56(3), with international evidence in Kaniel, Ozoguz &
Starks (2012), *Journal of Financial Economics* 103(2). A stock that trades
unusually heavily over a week tends to rise over the following month or two, and
one that trades unusually lightly tends to fall, whichever way its price moved.
The explanation is visibility: a burst of trading puts a stock in front of
investors who were not looking at it. The premium appears in 41 countries.

"Unusual" is against the stock's own history: the last week is high volume when
it is the heaviest of the last eleven, low when it is the lightest, which is the
paper's top and bottom tenth of a fifty-day interval. Every other week, the rule
says nothing, because the paper's middle portfolio is the control group. A bar
from the evaluation day is never read, because on a live server it is still
filling. Equities only, capped at 0.35.

### Mean reversion

**Connors RSI(2)** — Connors & Alvarez, *Short Term Trading Strategies That
Work* (2008). A two-period RSI below 10 while price holds above its 200-day
average. The short period is deliberate — it flags brief sharp pullbacks
rather than sustained weakness — and the 200-day filter is what stops it being
a way to catch falling knives.

This is the ensemble's contrarian voice and the one most likely to dissent
from the momentum strategies. That disagreement is surfaced, not averaged
away. It also has the shortest half-life in the engine, which is why it
produces the tightest execution windows.

**Short-term reversal** — Jegadeesh (1990), *Journal of Finance* 45(3), and
Lehmann (1990), *Quarterly Journal of Economics* 105(1). The oldest published
anomaly here and the only one pointing squarely against the rest of the engine:
sort on the past month's return and the losers outperform over the next one. The
mechanism is not a forecast about fundamentals — short-horizon moves overshoot on
liquidity demand and the overshoot unwinds.

Its job is to disagree. Eight of ember's nineteen rules are trend or momentum, and
a rule that says *sell the thing that just ran* is the genuine diversifier; the
cases where it fights cross-sectional momentum are the cases a reader most needs
to see as a split rather than as a confident midpoint. It is not the same signal
as Connors RSI(2), which reads a two-day RSI, is gated on the 200-day average and
is long-only; this is a twenty-one-day cross-sectional rank with no trend gate,
and it will happily produce a sell.

Its confidence is capped lower than anything else in the engine, at 0.45. The
effect is real and replicated and **mostly eaten by costs** — the portfolio turns
over monthly, the spread on the names it likes is at its widest exactly when it
wants to buy them, and later work attributes much of the measured return to
bid-ask bounce. ember models no spread or commission, so a rule whose edge lives
inside the spread must not speak as loudly as one whose edge does not.

### Fundamentals

**Piotroski F-Score** — Piotroski (2000), *Journal of Accounting Research* 38.
Nine accounting tests, one point each, across profitability, leverage and
operating efficiency. Narrower than it's usually quoted as: the finding is
that *among cheap stocks*, the financially strengthening ones outperform the
deteriorating ones. Treated as a slow confirmation, not a trigger.

**Magic Formula** — Greenblatt, *The Little Book That Beats the Market* (2005).
Rank on earnings yield and on return on capital, then add the ranks. Cheap
alone is a value trap; profitable alone is usually expensive. Relative by
construction — it returns no view without peers to rank against.

**Asset growth** — Cooper, Gulen & Schill (2008), *Journal of Finance* 63(4),
with international evidence in Watanabe, Xu, Yao & Yu (2013), *Journal of
Financial Economics* 108(2). Rank on the year-over-year change in total assets:
the slowest growers beat the fastest, in large companies as well as small, and
across 40 markets. A company invests heavily when its cost of capital is low,
which is also when its expected return is low. Its own family, investment,
because it measures what a firm does with capital rather than what the business
earns or what the shares cost. US listings only, for the same reason as the two
rules above, and capped at 0.5 like betting against beta: a premium spread over a
year says nothing about this week.

### Carry and valuation

**FX carry** — Lustig, Roussanov & Verdelhan (2011), *Review of Financial
Studies* 24(11). The interest-rate differential between the two legs of a
pair. Uncovered interest parity says this should earn nothing; empirically it
has earned a great deal for decades. The catch is the shape: steady gains
punctuated by rare violent losses that arrive exactly when volatility spikes.
Dividing by realised volatility is a partial defence, and the regime filter
does the rest — carry is cut to 0.3× in a stressed regime.

**Currency momentum** — Menkhoff, Sarno, Schmeling & Schrimpf (2012), *Journal
of Financial Economics* 106(3). Momentum on a pair's **total** return rather than
its spot move. FX had four rules before this and three read the price path alone
while the fourth read the rate differential alone — and in currencies that
omission is not cosmetic, because a pair's return to a holder is the spot move
plus the carry earned on the way, and the two routinely have opposite signs. A
high-rate currency that drifted down 2% while paying 5% made money, and every
price-only rule reads it as a loser. The paper sorts on exactly that total excess
return and finds a momentum effect that is strong at one to three months and
largely unrelated to carry — separate premia rather than one measured twice,
which is what lets this sit beside FX carry instead of restating it. Measured on
ember's own fourteen pairs, the two correlate at −0.07.

Ranked at the level of the pair, not the currency. The paper sorts currencies
against the dollar; ember lists crosses with no dollar leg, and since a pair's
return is the difference of its two legs' returns, ranking pairs is the same sort
expressed in the things a user can actually hold.

**MVRV Z-score** — Mahmudov & Puell (2018), formalised by Glassnode. Market
capitalisation against realised capitalisation, normalised by its own standard
deviation. Realised cap prices every coin when it last moved, making it a
proxy for holders' aggregate cost basis.

Two honest limits: "every cycle so far" is a sample of three or four, so this
is a suggestive regularity rather than an estimated effect, and it carries the
lowest confidence in the engine. And it was built for Bitcoin — confidence is
reduced further on altcoins.

---

## Ruled out

| Rejected | Why |
|---|---|
| Stock-to-flow | Broke badly out of sample. Keeping it would undermine everything beside it. |
| Chart patterns (head-and-shoulders, flags) | Widely believed, poorly evidenced, unfalsifiable as stated. |
| Sentiment scraping | Not reproducible, not citable, trivially gamed. |
| An opaque model score | The point is that a user can read why. A number you can't interrogate is the gimmick with extra steps. |
| An FX rule on **real**-yield deviations | A real yield is a nominal rate less an inflation rate, and no free source ember has serves a CPI series. The choice was a formula with an invented inflation number inside it or a different rule — and a fabricated input is worse than a missing formula, because the output looks exactly as calculated as a real one. Currency momentum uses only what ember has. |
| Sector-*neutral* momentum | The obvious reading of "sector-relative", and it removes exactly the signal Moskowitz & Grinblatt say is doing the work. Industry momentum scores the sector instead. |

---

## The regime filter

Every strategy is *conditionally* good. Breakouts work in trends and bleed in
ranges; mean reversion works in ranges and is ruinous in a downtrend; carry
earns steadily until it doesn't. Weighting them identically in all conditions
would average a good strategy and an actively harmful one into mush.

Volatility is judged as a percentile of the instrument's **own** history, not
an absolute threshold — 60% annualised is a crisis in EURUSD and an ordinary
Tuesday in SOL.

| Family | Range | Downtrend | Stressed vol |
|---|---|---|---|
| Trend, momentum | ×0.7 | — | ×0.8 (unless already short) |
| Mean reversion | ×1.25 | ×0.4 | ×0.45 |
| Carry | — | ×0.7 | ×0.3 |
| Value, quality | — | — | ×1.1 |
| Defensive (low risk) | — | ×1.2 | ×1.2 |
| Investment | — | — | ×1.1 |
| Lottery demand | ×1.1 in a calm uptrend | — | — |
| Attention | — | — | — |

**These are individual branch effects, and they compound.** A market that is
both stressed *and* ranging damps trend twice — ×0.7 × ×0.8 = ×0.56 — and mean
reversion by ×1.25 × ×0.45 = ×0.56 as well. The in-app methodology page shows
the *combined* multiplier for four concrete regimes, computed by calling
`regimeWeight()` directly, which is why its figures differ from the branch
values above. Where the two disagree, the page is right: it is the code.

These are reasoned judgement calls, not fitted parameters. They're stated
openly so they can be argued with.

The filter also damps **absolute** confidence, not just relative influence —
otherwise a lone mean-reversion signal in a crash would carry exactly the
confidence it would in a calm uptrend. It can only ever reduce: a favourable
regime is not evidence.

---

## Momentum checks

Two published refinements adjust how much a stock momentum read is trusted.
Neither changes its direction, and both only ever lower confidence. Each says so
in the read's own sentence when it applies.

**Continuity** — Da, Gurun & Warachka (2014), "Frog in the Pan: Continuous
Information and Momentum", *Review of Financial Studies* 27(7). Momentum built
from many small moves persists; momentum built from a few large days does not.
Measured as information discreteness over the 12-1 window, sign(return) ×
(share of down days − share of up days), ranked against the market. The steadier
half is untouched; the more discrete half is discounted, down to 0.6. Applied to
time-series, cross-sectional, dual and residual momentum. Not to Clenow, whose R²
already rewards a steady trend.

**Momentum's own risk** — Barroso & Santa-Clara (2015), "Momentum Has Its
Moments", *Journal of Financial Economics* 116(1); Daniel & Moskowitz (2016),
"Momentum Crashes", *Journal of Financial Economics* 122(2). Momentum's crashes
arrive when its own recent volatility is high. ember builds the market's
winners-minus-losers portfolio (top and bottom tenth on 12-1 momentum, rebalanced
monthly), measures its six-month volatility, and scales the cross-sectional
momentum rules by its usual level over its current one, down to half. The paper
targets a fixed 12%; ember targets the series' own running average, because an
equal-weight decile portfolio over this universe has a different natural
volatility. Not applied to time-series momentum, which has tended to hold up in
the same conditions. Cederburg et al. (2020) found volatility scaling adds
nothing out of sample for most strategies, and momentum is one of the few where it
holds.

Both are equities only. On generated prices the second barely moves (never below
0.94 over five years), because a random walk's momentum portfolio has no crashes
to anticipate.

## Combining views

- Each strategy's weight is its own confidence × regime multiplier × risk-profile multiplier × independence.
- **Correlated rules share a voice.** Time-series, cross-sectional and dual momentum are three readings of the trailing twelve-month return and correlate at about 0.92, so together they count as about one voice (k / (1 + (k − 1)ρ), the usual effective-sample-size correction). Their agreement with each other is no longer counted as agreement.
- **Disagreement lowers confidence.** Weighted dispersion across strategies feeds directly into the final number, so a split verdict reads as one.
- **Only thin history costs coverage.** A rule that cannot assess an instrument at all (no filed accounts, no peers) and a rule waiting for its event (no breakout, an ordinary week of volume) are shown but left out of the blend, the agreement and the coverage. A rule the listing is too young for still counts against it, because with more history it would speak. This is what keeps confidence from falling every time a rule is added.
- **Silence is reported.** "Four of seven had no view" is information the user gets.

Risk profile shifts family weights, so Conservative and Aggressive produce
genuinely different books rather than the same list at a different size.

## What reaches the feed

A read has to clear **both** halves of the profile's bar, and both move with
it:

| Profile | Conviction (score, 0–1) | Evidence (confidence, 0–100) |
|---|---|---|
| Conservative | 0.35 | 32 |
| Balanced | 0.22 | 24 |
| Aggressive | 0.15 | 17 |

*(The live methodology page reads these out of `RISK_PROFILES` for whichever
profile you're on and is authoritative, per ADR 0012. The table above is a
convenience and can go stale — the page can't.)*

Conviction is how hard the strategies point; confidence is how much they agree
and how much they had to go on. A strong score the rules barely trust is not a
recommendation, and neither is a confident shrug.

The confidence floor used to be a fixed 35 for every profile. Because
confidence is a product of four sub-unit terms and rarely exceeds 55, that one
number was doing nearly all the filtering — all three profiles surfaced the
same calls while the copy promised fewer and more. ADR 0013.

All three floors sit at or below the `Moderate` label's boundary, so every
profile surfaces some calls badged `Low` — more of them the more aggressive the
profile. That is the trade each one asked for, and the badge on the card says
so. The label describes the evidence; the floor describes what you asked to be
shown. They are not the same statement and they are deliberately no longer the
same number.

**These floors are calibrated against the engine, and they have to be
re-measured whenever it changes.** Confidence falls when rules disagree and when
rules abstain, and both grow with the *number* of rules — so it is a relative
scale, not an absolute one. Phase 24 took the ensemble from ten rules to sixteen
and the whole distribution moved down; on the old floors the Conservative
profile surfaced four instruments out of 214, which is not caution, it is a
broken setting. The floors were re-derived from the new distribution to restore
the shares ADR 0013 chose. That this has now happened twice is the real finding:
the durable fix is for confidence to stop depending on how many rules are in the
room, which is an ensemble change rather than a threshold change.

Everything below the bar stays readable on the asset page, where a `Hold` is a
real answer to a question the user asked.

---

## Size and stop

Advice without a size is meaningless — the same "buy NVDA" is prudent at 2% of
a portfolio and reckless at 40%.

Size starts from volatility targeting: the weight that would contribute the
profile's target volatility if this were the only position. It's then scaled
by conviction and takes a fixed quarter haircut, and capped by the profile's
single-position limit.

On that haircut: Kelly sizing needs an estimated edge and variance, and
practitioners bet a quarter of it because edge estimates are unreliable. This
engine has a conviction score, not an estimated edge — calling the result
Kelly-optimal would be false precision. What survives is the discipline: size
well below what the signal appears to justify.

Stops are ATR multiples scaled to the holding period — 1.5 ATR for a two-day
mean-reversion trade, up to 3.5 for a multi-month trend position, and always
on the side the position loses on.

---

## The execution window

Four documented things, multiplied across the market's own horizon:

1. **Liquidity.** The U-shaped equity volume curve, the London/New York FX
   overlap, weekend thinning in crypto. The US equity open scores *low* — huge
   volume, but the widest spreads of the day. Depth into the close is the best
   window for a retail order.
2. **Events.** Earnings, CPI, FOMC, payrolls. None of these strategies claim
   to predict a release, so entering minutes before one is an unrelated
   coin-flip on top of the signal, at the worst spread of the week.
3. **Decay.** Each strategy's empirical half-life, so the window closes as the
   edge does.
4. **Dissent.** How split the rules are. A call four rules like and three
   dislike gets a *shorter* window than a unanimous one, because the case for it
   is more fragile and more easily overtaken — the display rule "disagreement is
   shown, not hidden" applied to timing rather than to a sentence.

**The horizon is per-market, and derived rather than picked:** long enough to
contain the next liquidity crest and no longer. That makes the longest *closure*
the binding constraint, so equities and FX both get 72 hours because of the
weekend, and crypto — which never shuts — gets 36.

The band's density ramp *is* that product. It rises to a crest and falls away
rather than sitting as a hard rectangle, because "Thursday late morning" is a
soft-shouldered claim and drawing it as a fence would overstate what the model
knows.

**Two current limitations, both measured rather than suspected.** The liquidity
curves are modelled from the documented shapes, not observed spread and depth —
with a real feed they become the latter. And the decay term is **dormant in
practice**: the blended half-life of every call this engine makes lands between 24
and 75 days, so across a 72-hour horizon that factor only varies between 0.92 and
0.96, against a liquidity term that swings from nothing to one inside a single
session. It would matter for an edge measured in days. The blend does not produce
one — a fast rule has to out-weigh fifteen slower ones to lead a call, and the two
fast rules are capped too low to manage it.

---

## The track record

Computed, never authored. `backtest.ts` runs the same `assess()` the advice
feed calls, on truncated history, stepping forward through time. If a strategy
performs badly, the page says so.

Two invariants keep it honest. **No lookahead** — context is truncated at the
evaluation bar and nothing downstream can see past it. **No overlapping
positions** — a symbol in a trade isn't re-evaluated until it exits, otherwise
one trend gets counted five times and the hit rate measures trend persistence
rather than whether the engine was right.

### Caveats, stated first and not last

- **Generated prices are a random walk with clustered volatility. There is no trend or reversal structure in them to find, so results near chance are the expected outcome and say nothing about real-world performance.** This is the most important line on the page.
- Synthetic data, not real market history.
- **Entries are the open of the first session after the call**, not the close the
  call was computed from — you learn a close at the close, and the earliest price
  you can trade is the next one. The record reports what that delay costs on its
  own line rather than assuming it away. It used to enter at the signal bar's own
  close, which is a fill nobody could get.
- No slippage, spread or commission on top of that, so real returns would be lower still.
- Fixed, known universe — no survivorship adjustment.
- Parameters are the published ones, fitted by their authors to real data, so this is not fully out-of-sample.
- On generated data, company fundamentals are invented too. On live data they are the filed 10-K, parsed from EDGAR by Finnhub — but they resolve for only **49 of the 72 equities**, and the gap is the methods' own scope rather than a data failure: banks file unclassified balance sheets with no current assets and no gross profit, so Piotroski and the Magic Formula are undefined for them, and Greenblatt excludes financials and utilities by design. Those instruments abstain, which costs coverage rather than confidence.
- On live data, crypto history is capped at 365 days by the provider's free tier. The engine needs 200 bars of warm-up, so a coin contributes about 165 backtestable days against an equity's 1,050 — a real asymmetry in how much of the record each market accounts for.
