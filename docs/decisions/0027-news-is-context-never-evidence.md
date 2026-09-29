# 0027 — News is context, never evidence

**Status:** accepted · phase 16 · **amends ADR 0005**

## Context

ADR 0005 set the rule the whole product rests on: every signal traces to
published, citable work, and a rule set that can't be cited doesn't ship. It
listed **sentiment scraping** among the things ruled out — "not reproducible,
not citable, and trivially gamed" — and the methodology page renders that
rejection to users.

Phase 16 adds a News tab. That is a direct collision with the rule, and it is
worth being precise about why it isn't a reversal.

The pressure here is real and will not go away. A feed of headlines sitting
one tab from a signal engine is a standing invitation: *surely a relevance
weight would help*, *surely an earnings story should nudge the confidence*,
*surely we can at least sort findings by whether something was written about
them*. Each is a small step and each is the same step.

## Decision

**News is display and context. It never enters the ensemble.**

ADR 0005's rejection stands unchanged and is extended with this clause: a
headline may be attached to a finding as *labelled context* — "here's what was
written about this" — and may never be attached as evidence, weight, score or
input of any kind.

Three things enforce it rather than merely stating it:

**The type carries nothing that could be used as an input.** `NewsItem` has no
sentiment, no relevance, no score, no weight, no impact. Those are the fields
that make a feed *look* like a signal and invite someone to wire it up. A test
reads the interface and fails if one appears.

**A test walks the engine's imports.** Every file under `lib/signals` is
scanned; if any of them imports a news module, the suite fails. This is the
same discipline as `server-only` on the API boundary — the other rule in this
codebase that would be worthless if it lived only in prose.

**The screen says so, and the methodology page says so.** The News tab carries
the sentence in full. ADR 0005's ruled-out entry was restated too: the old
wording only argued against *scrapers*, which would leave a reader looking at
a tab full of headlines to reasonably assume they feed the model.

## Consequences beyond the boundary

**The mock's sources are fictional.** Everything else in the mock provider
invents numbers. This would invent *words attributed to a named organisation*,
which is a different class of thing — a generated price labelled "Generated
prices" misleads nobody, but a fabricated Reuters headline about a real
company, screenshotted, is a fake news story with a real byline on it. The
outlets are invented until Finnhub supplies real attribution, and that should
be the only moment ember ever puts a real publisher's name on a headline.

**No template is directional.** Every generated story is procedural — a
filing, a schedule, a personnel move, a rate decision. Partly taste; mostly
structural, because a mock full of "ANALYSTS SEE 40% UPSIDE" would make the
boundary look arbitrary to anyone who read the screen.

**Trending is counted, not chosen.** The strip is topic frequency across the
window and nothing else. An authored list of "today's topics" is an editorial
claim wearing the costume of a measurement — the same failure as a hardcoded
track record, ruled out for the same reason. A topic mentioned once is a story,
not a trend, and is filtered out.

**No sentiment means no colour.** There are no tinted headlines, no
bullish/bearish tags and no ranking by likely price effect. A finance app that
colours its headlines is telling you what to think about them, which is the
claim ember has spent fifteen phases refusing to make without a citation.

## Alternatives considered

**Sentiment as a low-weighted input.** The version that sounds reasonable.
It fails ADR 0005 on its own terms — a sentiment score is not reproducible
across vendors, not citable to a method, and is the single most gameable input
available to anyone who wants to move a retail app's output. A small weight
does not make an unciteable input citable; it makes it harder to notice.

**News-derived relevance boosting the findings ranking.** Tempting because it
sounds like presentation rather than modelling. It isn't: the ranking decides
what the user sees, so anything that changes the order changes the advice.

**No News tab at all.** Coherent, and it was the position through v1. Rejected
because the user asked for it and because context genuinely helps — knowing an
earnings release is Thursday is useful whether or not any model reads it. The
execution window already routes around scheduled events (`lib/market/calendar`)
without any of them being a signal, which is the same relationship.

**Filtering "your assets" server-side.** Would mean sending held and watched
symbols to a route with no need for them. Phase 15 spent the one exception this
app gets (ADR 0025); filtering a page of headlines in the browser costs
nothing.
