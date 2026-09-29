# 0038 — What a free tier is allowed to withhold

**Status:** accepted
**Date:** 2026-08-17

## Context

ember needs a commercial surface: a plan concept, a way to gate on it, a
vocabulary for saying "this is Pro" without becoming the thing the brief rules
out, and somewhere to put a sponsor. The plan for this phase set the constraint
that matters — **gate what the free tier can survive without, never what makes
ember trustworthy** — and named the public argument pages as untouchable (decision
051).

What it did not settle is the harder question, which is *which* gates are
legitimate. "Free tier limits" is a design space with a lot of room to be
dishonest in, and this product's whole argument is that it is not.

## Decision

### The rule for choosing a gate

**A gate needs a reason that survives being said out loud to the person hitting
it.** Two kinds qualify:

1. **It costs ember something per use.** Email delivery, push delivery, runner
   minutes. "We can't send unlimited email on a free tier" is true and a reader
   can check it.
2. **It is genuinely more of the same thing**, where the free tier still gets
   ember's *best* answer rather than a deliberately worse one.

What does not qualify: **anything free to serve, restricted only to create
pressure.** That is manufactured scarcity, it is indistinguishable from the
casino register the brief exists to avoid, and it is the reason the watchlist cap
below was rejected.

### What is gated

| | Free | Pro | Why it qualifies |
|---|---|---|---|
| Findings in the inbox | top 3 | all | More of the same, and the ranking means free gets the most urgent — not a worse answer, a shorter one |
| Push alerts | 3 a day | unlimited | Costs a push-service quota and runner minutes per send |
| Email digest | — | yes | Costs a Resend quota per send |
| Sponsor slot | shown | hidden | The thing being sold is its absence |

### What is not gated, and never will be

**The methodology page and the track record.** They are ember's public argument
(decision 051), they are reachable unauthenticated, and putting them behind a wall
would be the most self-defeating thing this product could do — the claim is "you
can check this", and a paywall is the opposite of that sentence.

Two mechanisms hold it, and which does what is worth stating precisely. The
**gate** proves reachability: `audit.mjs` loads both screens with no session on
every run, so a redirect or a wall fails the build straight away. The **unit test**
guards the direction the gate cannot see — it asserts neither screen so much as
*imports* `lib/plan`, `use-plan` or the upsell components. A gate has to import
something before it can exist, so catching the import catches the change while it
is still one line.

**The engine's answer itself.** A free user gets the same assessment, the same
confidence, the same execution window and the same sizing as a Pro user. Only the
*number* of findings surfaced differs. Degrading the analysis for non-payers would
mean shipping two engines and telling one group of users something ember does not
believe.

**Anything already in use.** A free tier introduced after the fact must not take
something away — a ledger someone typed by hand is theirs. `period_end` is read as
a grace boundary rather than a kill switch, and nothing anywhere deletes or hides
user data on a lapse.

### The upsell vocabulary

Three components, one register, and the rules are stated once so they cannot drift:

- **`PlanChip`** — an inline marker on a locked affordance. Says what it is, not
  what you are missing.
- **`PlanCard`** — a section-level pitch, used where a gate has actually bitten.
- **`PlanInterstitial`** — one modal, reusing `ResponsiveModal`, and only from a
  deliberate press.

Sentence case. Names its outcome. **No countdowns, no "limited time", no counts of
what other people are doing, no red, no urgency of any kind.** A price is stated
plainly or not at all. The phase 14–16 review proposed a blurred countdown reading
"Pro users exited this trade 11 minutes ago with a +2.4% peak gain"; §7 rules that
out permanently, and this vocabulary is the positive form of the same rule.

An upsell appears **at most once per screen**, and only where a limit has been
reached — never pre-emptively, and never on a screen the user did not hit a limit
on. An app that asks on every surface is an app whose free tier is an advert.

### Ads are first-party or they do not exist

A `sponsors` table with four fields, rendered by `SponsorRow` in ember's own
typography. **No third-party script, no iframe, no pixel, no remote origin.** A
network tag would learn which instruments a reader looks at — for a finance app,
that is a list of what somebody is thinking about doing with their money — and it
would learn it from the one product claiming not to watch them. There is nothing
to block, nothing to leak and nothing to load.

At most one slot per screen, and absent entirely for Pro, which is what makes
"no ads" a real thing to sell rather than a promise about volume.

### The plan lives in its own table, and that is a security fix

Not a `plan` column on `profiles`. `profiles` has an RLS policy letting a user
update their own row — correct for a display name — and **RLS is row-level, not
column-level**, so a `plan` column there would let any signed-in browser run
`update profiles set plan = 'pro'` and be believed. Postgres has column privileges
and triggers as workarounds; both are a second mechanism to keep right beside a
policy that already says "you may write this row".

`entitlements` has a select-only policy and no write policy at all, so the client
reads what it is entitled to and cannot write it — one sentence, no exceptions.
Only a credential outside the application can grant a plan.

## Alternatives considered

**A watchlist size cap on free.** Listed in the plan and rejected for two reasons.
There is no cost behind it — the engine assesses all 214 instruments regardless of
who is watching what, so a cap saves ember nothing and exists purely to squeeze.
And it is incoherent with decision 023: the watchlist's default is a "following
everything" sentinel, so a capped free user would be *following 214 instruments*
while being told they may follow 25. Fixing that would mean materialising the
sentinel into a list, which is the exact bug decision 023 exists to prevent.

**Capping how many markets a free user can watch at once.** Same objection: no
marginal cost, and it makes the product worse in a way that teaches nothing about
what Pro is for.

**Gating the per-strategy breakdown on the track record.** Tempting because it
looks like "advanced". It is evidence about whether ember works, which is the one
category that cannot be sold.

**Degrading free confidence or widening free windows.** Rejected outright. Two
engines is two products, and telling a user something ember does not believe in
order to sell them something is disqualifying.

**Storing the plan in `preferences`**, which already syncs. It is client-owned
JSONB by design (the client owns that shape), so it is writable by definition —
the same hole as the `profiles` column with an extra step.

**Building a checkout in this phase.** §7's three pre-revenue blockers are
unresolved: no merchant of record with Nigerian payouts, a host that forbids
commercial use, and an unlicensed price feed. A checkout would be the fourth thing
to migrate, and the first three have to be decisions rather than code.

## Consequences

- **Every account is `free` today**, and the only way to see the Pro path is to
  insert an `entitlements` row by hand. Intended: this is the gate, not the till.
- **`canUse` is the only place a gate is decided.** No component asks "is this user
  pro" and branches; they ask what they are allowed to do. It is the same
  discipline as `lib/plan.ts` being one file — a feature check inlined in a
  component is a rule nobody can find later.
- **With no Supabase project configured, nothing changes.** No plan, no
  entitlements read, no sponsor slot, no upsell — the app is exactly what it was,
  which is the same treatment ADR 0007 gave market data and ADR 0031 gave accounts.
- **A signed-out user is free, not blocked.** ember has always worked with no
  account and that does not change; the free limits simply apply.
- **The free findings cap is the one gate a reader will feel**, and it is the one
  with the weakest cost argument. It is included on the "more of the same" ground
  and it is worth revisiting with real users: if the top three turn out to be all
  anyone reads, the cap is selling nothing and should go.
- **A sponsor row has no impression or click tracking.** Which means ember cannot
  tell a sponsor how many people saw it, and that will be a commercial problem the
  first time somebody asks. Recorded rather than solved: the answer is aggregate
  server-side counting, not a pixel, and it needs designing rather than reaching
  for.
