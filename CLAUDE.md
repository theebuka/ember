# CLAUDE.md — ember

> **This file is the context-reset document.** After `/clear`, reading this file should fully restore working context: what the product is, what's built, what was decided, what was rejected, and what not to break.
>
> **Maintenance rule:** update this file at the end of every phase, and immediately whenever a decision is made or an approach is ruled out. Never let it drift from the code. If you change an architectural rule, update §5 in the same commit.

---

## 1. What ember is

A personal finance tracker that watches equities, FX and crypto, tracks the assets the user actually owns, and issues buy/sell advice **plus the time window to act in**. The differentiator is timing — every competitor ships a BUY badge; almost none tell you when to act or show whether their calls worked.

Target user: a self-directed retail investor who already trades a little, wants a second opinion grounded in real methodology, and is tired of hype apps. Eventually a paid subscription with a free tier, user accounts and referrals.

Tone: calm, decisive, trustworthy. Never hypey, never casino-like.

---

## 2. Current status

| Phase | State |
|---|---|
| 0 — Foundation & design system | **done** |
| 1 — Signal engine | **done** |
| 2 — Dashboard | **done** |
| 3 — Portfolio & transactions | **done** |
| 4 — Watchlist | **done** |
| 5 — Advice feed | **done** |
| 6 — Track record & methodology | **done** |
| 7 — Asset detail | **done** |
| 8 — Settings & onboarding | **done** |
| 9 — Window alerts | **done** |
| 10 — Polish & case-study capture | **done** |
| **v1 complete — v2 begins here** | |
| 11 — Fix what's broken | **done** |
| 12 — Design system v2 | **done** |
| 13 — Shell and layout | **done** |
| 14 — De-card the app | **done** |
| 15 — The alpha finder | **done** |
| 16 — News | **done** |
| 17 — Re-verify & refresh the case study | **done** |
| **v2 complete** | |
| 18 — Launch screen & onboarding rebuild | **done** |
| 19 — Accounts, sync & the notification centre | **done** |
| 20 — Settings tabs, profile, news detail | **done** |
| 21 — Live market data | **done** |
| **v3 begins here** | |
| 22 — Speed, and the news feed | **done** |
| 23 — The universe goes global | **done** |
| 24 — More strategies | **done** |
| 25 — The window engine | **done** |
| 26 — Server-side delivery | **done** |
| 27 — Plans, upsell and sponsor slots | **done** |
| 28 — Announcements & admin | **done** |

Full plan: `/Users/chukwuebukanwaju/.claude/plans/breezy-puzzling-kurzweil.md`
(now the **v2** plan — v1's record lives in §6–§8 below)

**v2 is a repositioning, not a reskin.** ember was a browser of engine output;
as of phase 15 it is an autonomous alpha finder that watches what you own and
what you follow, and comes to you with both opportunities and loss-prevention
warnings. The visual system moved from warm graphite + ember orange to a
light-first, #2563EB-based neobank register. Direction taken with the user:
light-first, Satoshi self-hosted, 4 icon-only tabs + a profile control, 110
instruments with a search-and-add seam. **Next.js stays on 16** — ADR 0001's
open question is settled and closed.

**Live data is on.** `EMBER_DATA_PROVIDER=live` routes prices, filed accounts,
news and the earnings calendar to four real upstreams; unset, ember runs
entirely on generated data and is fully usable, which is what `npm run verify`
measures against. The promise ADR 0007 made in phase 1 held exactly: the live
provider landed **without touching a component, a route, a store or an engine
module**. See ADR 0033 — including the one dependency that has to be replaced
before ember charges anybody.

**The unit is now a `Finding`**, not an "actionable assessment": `{ kind:
"opportunity" | "risk" }`, ranked against each other by urgency in one list.
Home is that list. The loss-prevention half is `lib/signals/exposure.ts`, and
it is the reason ownership now reaches the server — the one privacy property
this phase spent, deliberately and in writing (ADR 0025).

---

## 3. Commands

```bash
npm run dev          # dev server (Turbopack), http://localhost:3000
npm run build        # production build
npm run start        # serve production build
npm run lint         # eslint
npx tsc --noEmit     # typecheck — run before declaring any phase done
npx vitest run       # unit tests — 362 passing (engine, exposure triggers,
                     #   finding ranking, backtest invariants, mock calendar,
                     #   portfolio math, CSV import + export round-trip, ledger
                     #   validation, watchlist resolve, alert scheduling for both
                     #   kinds, trending computation, the news/engine boundary,
                     #   greeting + lead question, onboarding redirect safety,
                     #   cn() type-scale guard, the six phase-24 rules against
                     #   fixtures, peer date-alignment, and the collinearity
                     #   matrix — which is a gate, not a report; plus the sync
                     #   and push guards and the horizon-copy guard)

npm run push:keys    # a VAPID keypair in .env shape. Generate ONCE — a second
                     #   pair invalidates every stored subscription
npm run push:test    # sign a real payload and post it to the push service
npm run dev:https    # dev over TLS on localhost. Not enough for a phone: the
                     #   cert is self-signed and browsers won't register a
                     #   service worker behind an untrusted cert. For push on
                     #   real hardware use a tunnel with a real certificate
                     #   (`cloudflared tunnel --url http://localhost:3000`)

# The gate. Builds, starts a production server, measures against it, stops it.
npm run verify                    # audit · capture · perf · measure
npm run verify -- --only=audit    # one step
npm run verify -- --skip-build    # reuse the build on disk
```

**Never start the server yourself and point a script at it.** `next start`
resolves its manifests at boot, so a server left running from an earlier
session serves a build that no longer exists on disk — phase 17 opened by
reading seven accessibility violations that were entirely that, four of them
the Next.js error page. `npm run verify` owns the process and refuses an
occupied port. ADR 0028. And never `next dev`: the overlay injects its own DOM
and the service worker isn't registered there, so auditing it audits the
harness.

The four steps:

| | |
|---|---|
| `audit.mjs` | axe-core · 15 routes × 2 themes × 2 widths, on a seeded book |
| `capture.mjs` | 62 screenshots + a 320→1920 overflow sweep |
| `perf.mjs` | Lighthouse scores, and layout shift observed on a seeded ledger |
| `measure.mjs` | track record, payload sizes, cold/warm route timings |

**These are how every number in §8 gets its value.** Anything the engine or the
universe changes — the track record, the response sizes, the route timings —
stops being true the moment they do, and a documented figure that is quietly
wrong is worse than no figure on a product whose claim is that you can check
it. Re-run and restate rather than editing a number by hand.

---

## 4. Architecture map

```
CLAUDE.md                    this file
scripts/
├─ verify.mjs ★              the gate — builds, serves, runs the four below,
│                            stops the server. Owns the process on purpose
├─ audit.mjs                 axe-core over every screen — a gate, not a report
├─ capture.mjs               screenshots + the responsive overflow sweep
├─ perf.mjs ★                Lighthouse + layout shift, both measured per run
├─ measure.mjs               track record, payload sizes, route timings — the
│                            source of every number quoted in §8
├─ warm.mjs ★                fills the market cache by driving the real routes,
│                            polling until `pending` reaches zero
└─ generate-icons.mjs        PWA icons, the iOS launch bitmaps, and the
                             `<link>` list that points at them — all from the
                             one ember-point SVG
docs/
├─ decisions/                numbered ADRs — choice, alternatives, why
├─ methodology.md            every strategy + its citation
├─ design-system.md          tokens, type specs, component rules
└─ case-study/               README, architecture.svg, window-band.md,
                             accessibility.md, responsive.md, screens/
src/
├─ proxy.ts                  first-run gate — one cookie read at the edge
├─ app/
│  ├─ api/                   quotes · series · advice · instruments · fx ·
│  │                         track-record · strategies · asset · risk-preview ·
│  │                         findings ★ (POST — the only route carrying a book) ·
│  │                         news · notices
│  ├─ auth/                   sign-in + the magic-link callback (optional)
│  ├─ notifications/          the inbox
│  ├─ asset/[symbol]/        prerendered per instrument
│  ├─ onboarding/            chrome-free, three steps, art panel + column
│  └─ …                      routes (page.tsx is a thin server wrapper)
├─ components/
│  ├─ ui/                    shadcn, restyled to our tokens
│  ├─ shell/                 app-shell, bottom-nav, side-panel, command-menu,
│  │                         logo, theme, page-header
│  ├─ dashboard/             dashboard.tsx (composes the inbox), greeting-line,
│  │                         pinned-banner ★ (one at a time, above everything)
│  ├─ findings/              findings-inbox ★ — Home, and the product's point.
│  │                         finding-row ★ (one layout, both kinds)
│  ├─ market/                sparkline, price-chart, change-chip, ticker,
│  │                         market-pulse, data-source-chip, data-source ★
│  │                         (whether prices are generated — a server fact
│  │                         handed down from the layout, never a query)
│  ├─ news/                  news-screen — trending strip + headlines
│  ├─ asset/                 asset-screen
│  ├─ signals/               window-band ★, signal-card, strategy-breakdown ★,
│  │                         signals-screen, track-record-screen,
│  │                         methodology-screen, equity-curve,
│  │                         next-window-card, action-badge, confidence
│  ├─ watchlist/             watchlist-panel (a Portfolio segment now),
│  │                         watchlist-row, add-symbols
│  ├─ settings/              settings-screen, risk-profile-setting ★,
│  │                         alert-settings, data-settings, setting-row
│  ├─ auth/                  auth-screen — magic link, no password field
│  ├─ notifications/         notifications-screen, notifications-button,
│  │                         notice-row ★ (shared with the admin preview),
│  │                         use-inbox (badge, list, and useBroadcasts)
│  ├─ admin/ ★               admin-panels (the settings Admin tab — `/admin`
│  │                         redirects there), broadcast-composer (previews
│  │                         with the reader's own NoticeRow), suspension
│  │                         panel, record.ts (the log append)
│  ├─ onboarding/            onboarding-screen, onboarding-art ★ (the three
│  │                         panels), splash ★ (also the route's SSR fallback)
│  ├─ portfolio/             value-hero, value-chart, positions-list,
│  │                         positions-table, transaction-form ★,
│  │                         transaction-history, csv-import, portfolio-screen
│  └─ common/                section ★ (Section/Rows/Row/Stat/Divider),
│                            icon ★ (the only file naming an icon vendor),
│                            section-header, empty-state, error-state,
│                            page-body (+ PageColumns), segmented,
│                            ember-point, responsive-modal
├─ lib/
│  ├─ signals/               THE PRODUCT — indicators, strategies, ensemble,
│  │                         regime, sizing, backtest,
│  │                         window.ts ★ (per-market horizons, and dissent
│  │                           narrowing the span — ADR 0036),
│  │                         context.ts ★ (loadUniverse + LOAD_DEADLINE_MS),
│  │                         cross-section.ts ★ (a market on one date, computed
│  │                           once and shared — beta, residual momentum, the
│  │                           52-week anchor, sector aggregates; tested),
│  │                         exposure.ts ★ (loss prevention, pure, tested),
│  │                         findings.ts ★ (the unit, and its ranking)
│  │  └─ strategies/         16 rules, each with its citation. index.ts is the
│  │                         registry and the only place a rule is enumerated
│  ├─ market/                providers, format, calendar,
│  │                         exchanges.ts ★ (16 venues: zone, hours, lunch,
│  │                         currency, minor-unit divisor — tested),
│  │                         sessions.ts (liquidity, now per-venue),
│  │                         universe.ts (214 instruments, toInstrument ★),
│  │                         news.ts (trending, computed — tested)
│  │  └─ providers/
│  │     ├─ index.ts ★       which provider answers — flag + both keys, tested
│  │     ├─ mock/            generated everything, deterministic per symbol+date
│  │     └─ live/ ★          cache.ts (SWR + single-flight + a disk tier, tested),
│  │                         http.ts (per-host quota), mapping.ts (tested),
│  │                         finnhub.ts, coingecko.ts, frankfurter.ts,
│  │                         yahoo.ts (+ the minor-unit divisor), ngx.ts ★
│  ├─ portfolio/             derive.ts (pure, tested — and `positionInputs`, the
│  │                         one place deciding what leaves the device),
│  │                         csv.ts (tested), export.ts (tested),
│  │                         transaction-schema.ts (tested), sample.ts
│  ├─ notifications/         permission.ts (state + delivery),
│  │                         push.ts ★ (VAPID subscribe/unsubscribe, written
│  │                           straight to Postgres — subscribing *is* the
│  │                           preference),
│  │                         schedule.ts (what to alert on, both kinds, tested),
│  │                         inbox.ts ★ (three sources, one unread count, tested),
│  │                         release-notices.ts (broadcasts in the build)
│  ├─ supabase/              config (is there a backend at all), client,
│  │                         server (server-only), proxy (edge refresh)
│  ├─ sync/                  merge.ts ★ (LWW per row + tombstones, tested),
│  │                         rows.ts (the wire shape), stamp.ts,
│  │                         owner.ts ★ (which account this device's data
│  │                           belongs to — a different one stops and asks)
│  ├─ admin.ts ★             what an admin may do and — the load-bearing half —
│  │                         what a suspension cannot touch. A leaf module
│  ├─ plan.ts ★              the only place a gate is decided — `canUse`, the
│  │                         limits table, and the upsell copy beside the rules
│  │                         it describes. A leaf module: imports nothing
│  ├─ greeting.ts            the two lines at the top of Home — greeting and
│  │                         lead question, seeded, daypart-aware (tested)
│  ├─ onboarding.ts          the cookie mirroring `hasOnboarded` (tested)
│  ├─ utils.ts               cn() — twMerge, taught our type scale (tested)
│  └─ api/                   client.ts (fetchers + query keys), server.ts,
│                            types.ts
├─ store/                    zustand: use-portfolio, use-preferences,
│                            use-watchlist, use-advice-actions, use-alert-log,
│                            use-notifications ★ (the inbox history),
│                            use-sync-state ★ (sync's outcome — one runner,
│                              many readers)
├─ hooks/                    use-market-data, use-now, use-hydrated,
│                            use-media-query, use-scroll-direction,
│                            use-notification-permission, use-finding-alerts,
│                            use-session ★, use-sync ★, use-admin ★
│                              (+ useSuspension — one row each, and neither
│                               is a permission check)
supabase/migrations/         0001 schema + RLS · 0002 profile fields ·
                             0003 ngx_daily ·
                             0004 delivery ★ (push subscriptions, email prefs,
                             the send log, and the signed-out unsubscribe
                             function) ·
                             0005 plans + sponsors ★ (entitlements is its own
                             table, not a column on profiles — decision 180) ·
                             0007 broadcast placement ★ (inbox | card | bar —
                             one column, because a boolean plus a style admits
                             a state nothing can render; `pinned` kept for one
                             release so a mid-deploy build still works) ·
                             0008 profiles client stamp (drops the arrival-
                             time trigger — decision 237) ·
                             0006 announcements + admin ★ (admins is its own
                             select-only table for the *same* reason —
                             decision 190 — plus suspensions, admin_log, and
                             the three synced tables' write policies rewritten
                             to exclude a suspended user)
.github/workflows/           scheduled.yml ★ — the NGX collector and both
                             senders. Not a Vercel cron: §7 says that host has
                             to change, and a workflow moves with the repo
.env.example                 every variable, all optional
```

**Data flow, non-negotiable:** components → `lib/api/client.ts` → `app/api/*` routes → `lib/api/server.ts` → `lib/market/providers/*` → `lib/signals/*`. Components never import mock data or a provider directly. This is what lets real market data drop in without touching a single screen.

**Ownership enters at the API boundary and nowhere earlier.** `assess()` is still a pure function of candles and a risk profile; `evaluateExposure()` is a pure function of a position, its read and its candles. The join happens on the server in `getFindings()`. That is what keeps the engine testable against fixtures rather than against a book, and out of the browser bundle. ADR 0025.

The rule is **enforced, not just documented**: `lib/api/server.ts` imports `server-only`, so pulling it into a client component is a build error. `client.ts` re-exports engine types with `export type`, which is erased — verified by grepping the production client chunks for strategy names (nothing).

---

## 5. Rules not to break

### Design tokens
Every colour lives in `src/app/globals.css`. Nothing else defines a colour — **except `public/offline.html`**, which duplicates them as literals because it is served precisely when the stylesheet can't be fetched. Change the palette, change that file too.

The brand is **`#2563EB`**, chosen by the user. It is exactly Tailwind's `blue-600`, which is why the neutrals below are custom and cool rather than `slate`: paired with Tailwind's own greys this would be the default palette reproduced wholesale. ADR 0022.

| Token | Light | Dark | Role |
|---|---|---|---|
| `ink` | `#0B0C0F` | `#F4F5F7` | Primary text. Cool near-black — **never `#000`** |
| `graphite` | `#2E3038` | `#C9CCD4` | Headings, secondary emphasis |
| `stone` | `#62656F` | `#8E919B` | Labels, muted copy, axis ticks |
| `faint` | `#9A9CA6` | `#5C5F69` | Gridlines, disabled, placeholder — **never text** |
| `line` | `#ECEDF1` | `#23262E` | Hairline borders |
| `ground` | `#FFFFFF` | `#0A0B0D` | Page background |
| `surface` | `#FFFFFF` | `#101216` | Cards — **same as ground on light, deliberately** |
| `surface-2` | `#F5F6F8` | `#171A20` | Wells, inputs, secondary buttons |
| `brand` | `#2563EB` | `#2563EB` | The brand. Fills, marks, active state, primary CTA |
| `brand-text` | `#1B4FD0` | `#8AB0FF` | Brand as text |
| `up` | `#0A7C55` | `#3ECF8E` | Positive / buy |
| `down` | `#C8322F` | `#FF7A75` | Negative / sell |

- **Never use Tailwind's default grays** (`zinc`, `neutral`, `slate`, `gray`). Loudest tell of an assembled-not-designed interface, and doubly so here — see above.
- **`faint` is not a text colour.** It measures 2.7:1. Gridlines, disabled states, placeholders. There are exactly **two** muted text levels, `stone` and nothing below it; hierarchy below `stone` is carried by size. ADR 0018.
- **Direction colours are calibrated against their own tints, never white.** `text-up` lives on `bg-up-tint`. Measured against white every tinted chip in the app sits just under AA.
- **A card is not the default container.** On light, `ground` and `surface` are both `#FFFFFF`, so a card cannot lift off the page by value and has to earn its edges. Default to `Section` + `Rows`; `Card` is for a genuinely elevated hero object, a modal body, or floating chrome. ADR 0023 and §5 "Layout".
- Hairlines instead of shadows. **One exception:** `shadow-overlay`, for chrome that floats *over* scrolling content. Never on a card.
- **Contrast is measured, not guessed.** `node scripts/audit.mjs` is a gate; it exits non-zero on any violation.

### Typography
- **Satoshi** variable (300–900), self-hosted from `src/app/fonts/`. Fontshare, free for commercial use.
- **IBM Plex Mono** for ticker symbols and timestamps only — uppercase, `+0.04em` tracking.
- **All money and percentages use `font-variant-numeric: tabular-nums` in Satoshi, never mono.** Mono numerals everywhere is the tell that a finance app was themed rather than designed. Tabular figures also stop digits jittering as prices tick.
- Scale: `64 / 40 / 28 / 20 / 17 / 15 / 13` → `figure / display / title / heading / body / caption / micro`.
- **A new size goes in two places**: `@theme` in `globals.css` *and* the `font-size` group in `lib/utils.ts`. tailwind-merge assumes an unrecognised `text-*` is a colour and will silently delete it when a colour follows — ADR 0016. A test reads the CSS and fails if the lists drift.
- **There is no width axis any more.** Satoshi has none, so hero figures get their density from weight 600 plus `-0.025em`, and a column heading that won't fit steps *down a size* and hyphenates. Never truncate to `Conse…`, never invent an abbreviation. ADR 0023.

### Controls and icons
- Ramp is **56 / 48 / 40 / 32** (`xl` / `lg` / `default` / `sm`), fully rounded at every size. `tap-target` puts a 44px floor under the hit region on coarse pointers — vertical only, ADR 0021.
- Inputs and selects are **filled wells** (`surface-2`), not bordered boxes. On a white page a 1px outline is the weakest possible signal that something is editable.
- **Icons come from `components/common/icon.tsx` and nowhere else.** One house weight; never set `strokeWidth` at a call site. Active navigation is `weight="fill"`, not the same outline in a different colour.

### Charts
- **No candlesticks. No red/green chart fills. Ever.** Single-hairline area lines with a 6% tint. Red-green flicker is the strongest casino signal in a trading UI and the brief explicitly rules that feeling out. Direction belongs in badges and chips where it reads calmly.

### Live data
- **An instrument is live as a whole or it is nothing.** No mixing at the
  instrument level, and **never a fall back to generated data on failure** — a
  real quote drawn over a modelled price path is the most dishonest thing this
  app could render, because it is indistinguishable from the honest version. A
  failed instrument returns no candles and is simply absent.
- **Never fabricate a bar.** The ECB publishes one FX rate a day and CoinGecko
  has no daily OHLC past thirty days, so those bars carry `o = h = l = c` and
  true range degenerates to the close-to-close move. That is a real, narrower
  measure. Inventing a plausible high and low to fill the gap is fabricating
  market data.
- **Fundamentals are filed statements, never somebody's computed ratio.**
  Finnhub serves both; `/stock/metric` would have been a tenth of the code and
  is rejected, because a P/E ember did not calculate is one it cannot show its
  working for.
- **A new instrument needs its mapping in the same commit.** A crypto row with
  no CoinGecko id, or an equity whose Yahoo ticker is wrong, returns no candles
  and vanishes silently — indistinguishable from an instrument the engine had no
  view on. `mapping.test.ts` fails on it.
- **An equity belongs to an exchange, and the exchange decides three things.**
  Its currency, its precision and — the load-bearing one — the time zone and
  hours the execution window is computed in. Never hard-code a session.
- **Never hand-write an `Instrument` literal.** Use `toInstrument()`. Four
  places did it by hand and three silently dropped `exchange`, which meant every
  equity on earth had its window computed in New York hours and nothing failed.
  The helper is exhaustive over `Instrument` and checked by the compiler
  (decision 142).
- **A minor-unit venue divides once, in the provider.** London and Johannesburg
  quote in pence and cents. Anchor prices in `universe.ts` are in major units to
  match. Getting this wrong is a factor of a hundred on somebody's holding.
- **Whether prices are generated is a server fact, never a query.** `useSynthetic()`
  reads what the root layout computed from `EMBER_DATA_PROVIDER`. Reading it from
  a query caused an app-wide hydration failure and a false "Generated prices" on
  live builds for as long as the query took (decision 236).
- **Anything still modelled says so where it appears.** Policy rates, the macro
  calendar and realised capitalisation are modelled even when live. The
  methodology page reads `synthetic` rather than asserting it (decision 030 —
  the paragraph claiming "prices in this build are generated" was a hardcoded
  string, and it became a lie the day a feed was connected).

### The signal engine
- **Every signal traces to a published, citable method.** No invented heuristics, no unpublished rule sets. If a strategy can't be cited, it doesn't ship.
- **The track record is computed, never authored.** It is real backtest output over the same engine that serves live advice. If a strategy performs badly, the page says so.
- **Disagreement is shown, not hidden.** When strategies dissent, the advice card says which and why. Fake unanimity is the tell of a gimmick.
- Advice always carries a **size and a stop**, never a bare direction. **This binds the risk engine too** — every `RiskSignal` carries a `RiskAction`, and there is exactly one rule behind all of them (`reduceTo`): *reduce to the weight ember would hold today*. Never invent a fraction. "Halve it" is a number with no derivation and it looks like a calculation.
- **`qualifies()` and `isReady()` are separate, and must stay separate.** Conviction is not timing. Collapsing them is what suppressed "found it — the window opens Thursday", which is the differentiator.
- **The window's horizon is derived, not picked.** Long enough to contain the next
  liquidity crest and no longer, which makes the longest *closure* the binding
  constraint: 72h for equities and FX because of the weekend, 36h for crypto
  because it never shuts. Anything that states a horizon in prose reads it from
  `HORIZON_HOURS` — "the next three days" was a literal and became wrong on a third
  of the universe the day crypto's horizon changed.
- **Dissent narrows the window through the threshold, never through the decay.**
  Measured: the blended half-life of every call this engine produces is 24–75 days,
  so the decay term across a 72-hour horizon varies between 0.92 and 0.96 — a 4%
  tilt against a liquidity term that swings 0→1 inside a session. Halving a
  half-life moves no boundary. The span is decided by which hours clear
  `WINDOW_THRESHOLD`, so that is the only lever that can narrow it.
- **A risk fires on detection; it has no window.** There is nothing to route into a liquidity crest because the position is already on. Anything that treats a risk like an opportunity will delay every loss warning to the market's deepest hour, which is backwards.
- **A healthy position must stay cheap to say nothing about.** A risk engine that always finds something is a scaremonger and is ignored within a week.
- **Cross-sectional data belongs in `cross-section.ts`, never in a strategy.** A
  peer's twelve-month return, its beta or its distance from its 52-week high on a
  given date is one fact about the market, not 214 facts about 214 subjects.
  Computing it inside a rule means the same 176-name sweep runs once per
  assessment — `clenow` did exactly that and cost **1,726ms against 257ms for
  every other rule put together**, which was essentially the whole cost of the
  track record. Add a column to the snapshot; never a peer loop in an
  `evaluate()`. FX is the one exception, at fourteen instruments.
- **Two rules that produce the same number are one rule, and the ensemble cannot
  tell.** Weights are each rule's own confidence and blended confidence *rises*
  with agreement, so a duplicate does not cancel out — it doubles one opinion's
  weight and manufactures unanimity. `ts-momentum` and `dual-momentum` measured
  **1.00** for the engine's whole life before phase 24. `collinearity.test.ts`
  fails at 0.98 and holds an exact list of the pairs above 0.85.
- **A peer is cut by UTC day, never by array index.** Yahoo returns 1,214 bars for
  one international listing and 1,280 for another, so the same index is a different
  calendar day. Nothing fails when this is wrong; the cross-sectional rules just
  quietly rank one name's return-to-February against another's return-to-today.
- **A new rule needs a citation, a confidence cap it can justify, and a
  collinearity number.** "We cited a different paper" is not evidence that a rule
  adds information.

### Plans and money
- **A gate needs a reason that survives being said out loud to the person hitting
  it.** Two kinds qualify: it costs ember something per use, or it is genuinely
  *more of the same thing* with free still getting ember's best answer. Anything
  free to serve and restricted only to create pressure is manufactured scarcity,
  and it is out. ADR 0038.
- **The methodology page and the track record are never gated, on any plan, with or
  without an account.** They are how a reader checks whether ember works. There is
  a test that fails if either screen so much as *imports* the plan module.
- **The engine's answer is never degraded.** Same assessment, same confidence, same
  window, same sizing on every plan. Only how many findings are surfaced differs —
  two engines is two products.
- **A cap applies after ranking, never before.** The inbox is sorted by urgency, so
  a free reader sees the three that matter. A cap applied before the sort would be
  selling a different product to people who had not paid.
- **Nothing is ever taken away on a lapse.** `period_end` is a grace boundary, not
  a kill switch; a ledger somebody typed by hand is theirs whether or not they are
  currently a customer.
- **Entitlements live in their own select-only table, never on `profiles`.** RLS is
  row-level, so a `plan` column on a table the user may update is a column the user
  may update.
- **A plan gate that a server enforces must be enforced on the server.** The email
  and push caps live in `scripts/send-digests.mjs`; the UI copy is only copy.
- **Upsell register: sentence case, names its outcome, at most one per screen, only
  where a limit actually bit.** No countdowns, no "limited time", no counts of what
  other people are doing, no urgency, no direction colours — `up`/`down` mean money
  moved and a commercial prompt tinted like a gain blurs the one distinction the
  palette exists to keep.
- **Ads are first-party or they do not exist.** No third-party script, iframe, pixel
  or remote origin, ever. A network tag on a finance app learns what somebody is
  thinking of doing with their money.

### Announcements and admin
- **A flag about a user does not go on the user's row.** `profiles` carries a
  `for all` policy on `auth.uid() = id` and **RLS is row-level, not
  column-level**, so anything there is writable by the browser it constrains.
  `plan` and `is_admin` both belong in their own select-only tables, and this
  rule exists because the same mistake was made twice (decisions 180, 190).
- **The admin screen is not the permission.** The refusal happens in Postgres;
  hiding the screen is a courtesy. `/admin` redirects everybody to
  `/settings?tab=admin` identically, and a non-admin lands on Account — a route
  that answered differently would tell a prober that it matters.
- **A control is named after what it does, and the panel says what it cannot do.**
  ember works with no account, so nothing in the schema can ban anybody. A
  suspension stops sync, email and push, and it says so; the word "ban" is out.
- **A restriction the user cannot see is a bug they will spend a day on.** The
  suspension row is readable by its owner, the reason is shown to them, and the
  copy names what still works.
- **A privilege enforced in RLS is not enforced against the sender.** Scripts
  authenticate with the service role, so RLS does not apply to them. Anything a
  suspension is meant to stop has to be dropped in `send-digests.mjs` as well.
- **Every admin write appends to `admin_log`, and nothing can edit it.** Select
  and insert policies only. It is rendered on the screen, because an audit trail
  nobody reads is decoration.
- **The broadcast preview is the reader's own component.** `NoticeRow`, the same
  one the notification centre renders. A preview built from lookalike markup is
  right until one of them changes.
- **One promoted broadcast per placement, and dismissing is not reading.** The
  notice stays in the notification centre, unread, still counted by the badge.
- **A broadcast has one placement, never a flag plus a style.** `inbox` / `card` /
  `bar`. Two booleans would admit "not pinned, as a bar", which nothing renders.
- **The bar is for outages and changes to what ember stores.** It is on every
  screen, above the app's own chrome, and it is the one announcement a reader
  cannot navigate away from. A card is the default for anything quieter.
- **The bar is sticky, and everything else sticky offsets by `--bar-h`.** The side
  panel, the page header and the two `lg:sticky` asides. Anything new that sticks
  to the top has to do the same, or it slides under the bar.
- **Nothing in the root shell may read a cookie.** It would make every route
  dynamic, including 214 prerendered asset pages. Anything there that needs
  device state reserves space with a pre-paint inline script instead.

### Settings and dense screens
- **A tab is one subject.** Account was carrying identity, billing and an admin
  entry point; Plan and Admin are their own tabs now.
- **Space is not the fix for density; words are.** Tightening the rhythm to 32px
  while the paragraphs were still there made the pane denser rather than calmer.
  Cut the copy first, then give it 40px.
- **One heading per block, and the first block on a tab has none** — the tab title
  is its header. An eyebrow repeating the page title is a word said twice and one
  more thing to read before a control.
- **`max-w-prose` is 65ch, which measures 666px at `text-caption`.** Too wide.
  Descriptive text caps at 48ch.
- **One vertical rhythm**: 40px between blocks (`space-y-10`), 12px from a header to its content.
  Three values on one screen is what "improper spacing" looks like from outside.
- **A description is one or two lines.** Every setting needs one (a bare label
  beside a switch makes people find out by experiment); none of them needs a
  paragraph, and the long version belongs on the About tab or the methodology page.
- **Never two of the same call to action on one screen.** Settings had Sign in
  twice, 1,800px apart.

### Reaching the user
- **The service-role key never appears under `src/`, and that decides the
  architecture rather than being a lint rule.** Anything that has to read every
  user's row — the NGX collector, both digest senders — is a **script** the
  scheduler runs, never an API route behind a shared secret. A route capable of
  it would need the key, and a secret in front of the key is not the same as not
  having it.
- **A privilege that must work signed out lives in Postgres, not in a key.**
  Unsubscribe is a `security definer` function granted to `anon` with a pinned
  `search_path` — one boolean, one row, chosen by a token the caller already
  holds. Reach for this shape before ever reaching for the service role in a route.
- **Email cannot carry a loss-prevention warning, and the copy has to say so.**
  Those need holdings; holdings never persist server-side (ADR 0025). A digest is
  watchlist-scoped. Anything implying the two channels carry the same things is
  false.
- **A device's local data belongs to one account.** `lib/sync/owner.ts` records
  which; a different account signing in is held until the person chooses to use
  the account's data or add the device's to it. Never merge silently.
- **A sample book never syncs.** It is labelled by a local flag that would not
  survive the trip.
- **Applying synced data is not editing it.** Merged rows keep their own
  `updatedAt`, and a pulled document's stamp is set to the server's time.
  Stamping either as *now* lets a device that only *read* something beat an edit
  made elsewhere.
- **One sync runner.** `useSync()` runs in `AppShell` only; everything else reads
  `useSyncStatus()`.
- **A digest is batched, with a floor, and the cron cadence matches the floor.**
  Never one message per finding. A schedule tighter than the floor cannot deliver
  anything the looser one misses.
- **No tracking pixel, ever, in anything ember sends.**
- **A watchlist still holding the "everything" sentinel gets nothing.** Resolving
  `null` to all 214 instruments would mail somebody every call ember has —
  decision 084's rule one layer out.

### Portfolio
- **Holdings are derived, never stored.** The only persisted object is the transaction log. Cost basis, realized and unrealized P&L all fall out of it. Never add a `holdings` table or store — it will desynchronise.
- **No headline change figure may count contributions as gains.** A number tinted up or down is read as P&L whatever its label. Change over a period is always `Δ(value − cost)`, never `Δvalue`. See ADR 0007 — the naive version overstated the sample book's three-month gain by a factor of eleven.
- **Sample data is opt-in and stays labelled** until the user logs a trade of their own. ADR 0008.

### UX quality bar
The user is explicitly particular about this. These are requirements, not aspirations:
- Optimistic updates with undo on every reversible action. No confirm dialog where an undo will do.
- Skeletons match final layout exactly — **zero cumulative layout shift** when data lands.
- No dead ends: every empty state and every error names the next action.
- Focus trapped and restored in sheets/dialogs, visible focus rings, complete keyboard path.
- `prefers-reduced-motion` honoured everywhere, including the ticking `now` marker.
- Money formatted to the instrument's real precision; timezones explicit; relative times that update.
- Offline app shell; last-loaded portfolio stays readable with no network.

### Copy
- Restrained analyst, not a bot. `Moderate · 68`, never `🔥 HIGH`.
- Buttons name their outcome and keep the name through the flow (`Execute` → toast `Executed`).
- Sentence case. Active voice. No emoji in product UI.
- **No counts or horizons as literals in copy.** "Ten strategies", "a 72-hour
  window" and "the next three days" all went stale. Read the number from the
  engine (`describeHorizon`, `HORIZON_HOURS`) or describe the kind.
  `horizon-copy.test.ts` fails on the horizon phrasings.
- **Developer instructions never reach a customer.** A config variable or an
  `npm` command in product copy is gated on `NODE_ENV`.
- "ember gives information, not financial advice" appears under the advice feed and in settings.

---

## 6. Decisions made

See `docs/decisions/` for full ADRs. Summary:

| # | Decision | Why |
|---|---|---|
| 001 | Next.js **16.3** (App Router), not 15 | `create-next-app@latest` no longer ships 15; 16 is current stable with the same App Router model. **Flagged to the user — downgrade is cheap if they want 15 specifically.** |
| 002 | Near-monochrome warm-graphite palette + one ember accent | Brand colours undecided; personality carried by type and information design instead, so a palette swap never becomes a redesign |
| 003 | Archivo variable with the `wdth` axis as the signature | Character has to come from somewhere when colour is neutral; the width axis is distinctive and not a default stack |
| 004 | Holdings derived from a transaction log | Single source of truth gives cost basis, realized and unrealized P&L for free and cannot desynchronise |
| 005 | Signal engine built real from day one over OHLCV candles | Mock data feeds it now, live data later, engine never changes — and it means the product isn't a gimmick |
| 006 | shadcn with the **Radix** base, not Base UI | Radix is the mature, well-understood primitive set; Base UI is newer with a smaller surface |
| 007 | Provider interface with `mock` and `live` implementations behind an env flag | App is fully usable with no API keys; adding keys turns on real data with no code change |
| 008 | Free-tier-first infrastructure | No spend before revenue. Supabase, Upstash, Resend, Finnhub, CoinGecko, SEC EDGAR, GitHub Actions |
| 009 | Mock prices use GARCH(1,1) volatility clustering, not plain GBM | Constant volatility means no regimes, which would make the regime filter untestable and every vol indicator read flat |
| 010 | The regime filter damps absolute confidence, not just relative weight | Weighting alone cancels out of a weighted mean, so a lone mean-reversion signal in a crash scored identically to one in a calm uptrend. Clamped at 1 so a good regime can never manufacture conviction |
| 011 | Confidence excludes abstaining strategies, but abstentions cost coverage | With eight strategies on an equity, a few "nothing to trade here" reads dragged every call toward the floor |
| 012 | Backtest equity curve applies the engine's own position sizes | Compounding raw returns treated a 0.9% position like a full-book bet and reported a fictional 98% drawdown where the real figure is 4.1% |
| 013 | The value chart's chip reports **change in unrealized gain**, not change in value ([ADR 0007](docs/decisions/0007-value-chart-reports-gain-not-value.md)) | On the sample book the naive figure read +$56,411 where the market gain was $5,155 — the rest was contributions. A moss-tinted chip in a column of P&L figures says "you made this" whatever the label |
| 014 | The sample book is opt-in and stays labelled ([ADR 0008](docs/decisions/0008-sample-book-is-opt-in.md)) | An app that shows you holdings you never entered has broken the one thing it can't break. Silent seeding is standard practice and wrong here |
| 015 | `AdviceAction` and `ACTION_LABELS` live in `lib/api/types`, not in the ensemble | A badge needs five strings; importing them from `ensemble.ts` would drag ten strategies and every indicator into the client bundle |
| 016 | Locale pinned to `en-US` in `lib/market/format.ts` | `Intl` defaults to the runtime's locale — the server's during SSR, the browser's at hydration. A user in Lagos would get `1,234.56` from Node and `1.234,56` from Chrome, and React throws a hydration mismatch on a number |
| 017 | Clock-dependent markup renders `null` until mounted (`useNow`) | The server can't know the viewer's timezone. Anything reading local time is a guaranteed hydration mismatch, so those spots reserve their height and fill in one frame later |
| 018 | The transaction form re-walks the **whole ledger**, both sides, both symbols ([ADR 0009](docs/decisions/0009-ledger-validated-as-a-whole.md)) | Editing a *buy* down past a later sell is the case that actually breaks a derived ledger, and a sell-scoped check waves it straight through |
| 019 | CSV date order is inferred per file, and ambiguous files are refused ([ADR 0010](docs/decisions/0010-csv-refuses-to-guess-dates.md)) | A misread `03/04/2025` moves a trade into the wrong month, which changes cost basis and every figure downstream, silently |
| 020 | `ui/form.tsx` is hand-authored against the standard shadcn API | The `form` entry in the `radix-nova` registry resolves to a manifest with no files — `shadcn add form` reports success and writes nothing. This is why it was missing after phase 0 |
| 021 | Focus restoration in `ResponsiveModal` is explicit, not left to Radix | Measured in the browser, closing either modal dropped focus on `<body>`. The trigger is captured in `onOpenAutoFocus` and refocused in a `rAF` after the layer is gone |
| 022 | Undo toasts last 10s, not sonner's default 4s (`lib/toast.ts`) | An undo that expires before it's read is a notification with a button on it — and it makes the no-confirmation-dialog rule indefensible |
| 023 | Watchlist stores `null` for "following everything", not a seeded symbol list | A seeded list puts the universe in two places, so adding an instrument would silently never appear for anyone who had already opened the app |
| 024 | An action badge is **muted** unless the read clears the user's risk profile | The watchlist shows every read including holds. A tinted `Buy` beside `Low · 29` would have this screen contradicting the advice feed, which won't surface that call at all |
| 025 | Undo restores the prior *state*, never the inverse *operation* | Undoing a watchlist removal with `add` materialised the sentinel into a fixed list — the exact failure 023 exists to prevent. Same reason an edited transaction is restored wholesale rather than diffed |
| 026 | Handled advice is keyed by **symbol + action** and expires with the window ([ADR 0011](docs/decisions/0011-handled-advice-keyed-by-symbol-and-action.md)) | `assess()` restamps `createdAt` every cycle, so there is no stable id to key on. A flipped read is a new call and must resurface |
| 027 | The card's control says **Reopen**, not Undo | The toast on execute removes the transaction it just wrote; the card can be pressed days later and only puts the call back in the feed. Two scopes, two labels |
| 028 | Citations travel on `Contribution`, not looked up client-side | Components can't import the engine, and a citation the reader has to go and find on another page is most of the way to not having one |
| 029 | Only actionable reads get action buttons or a tinted badge | Under "Every read" the card is showing the model's working on something ember has declined to recommend. An Execute button there is the app arguing with itself |
| 030 | The methodology page is **derived from the engine**, never transcribed ([ADR 0012](docs/decisions/0012-methodology-page-is-derived-not-transcribed.md)) | A page that was true when someone typed it is worthless on a product whose claim is "you can check this". Building it this way immediately exposed a docs table that had drifted |
| 031 | The equity curve is compounded in **exit** order, not entry order | `trades` is sorted by entry and positions overlap, so the curve's x-axis ran backwards. Final equity was unaffected but `maxDrawdown` is measured from the path — it was reporting the drawdown of an arbitrary ordering |
| 032 | The track record's caveats are the first thing on the page | Every app in this category buries them. Putting the random-walk caveat under a headline number would be a lie of arrangement |
| 033 | The mobile nav is a **floating capsule**, inset from all three edges | A full-bleed bar with a hairline on top is what every framework ships and reads as browser chrome. Detaching it makes it an object the content scrolls beneath |
| 034 | The desktop panel has **no surface and no dividing border** | A white slab plus a hard rule is the stock admin shell. Content is already cards lifting off `ground`, so the separation draws itself — leaving the active pill as the only elevated thing on screen |
| 035 | Active nav in both is the same **ember-tint pill**, not a 2px tick | A dash above an icon never looks attached to the thing it marks. One vocabulary across both navs means "where am I" looks identical on either |
| 036 | `useReducedMotion()` on every `layoutId` animation | The `prefers-reduced-motion` block in globals.css only reaches CSS transitions. Shared-layout animations run in JavaScript and sail straight past it |
| 037 | Asset metrics are **the inputs the strategies read**, not a generic tile grid | It makes a rationale traceable: "earns 8.5% on its enterprise value" on the advice card, `Earnings yield 8.5%` one page away |
| 038 | The risk profile moves **confidence as well as conviction** ([ADR 0013](docs/decisions/0013-risk-profiles-move-both-halves-of-the-bar.md)) | The confidence floor was a fixed 35 for all three profiles and, because confidence tops out near 55, it was doing all the filtering. All three surfaced the identical three calls while the copy promised "fewer signals" and "more signals". Now 2 / 3 / 4 |
| 039 | The risk-profile setting shows its consequence **measured, not described** | `/api/risk-preview` runs the ensemble once per profile so the counts are the engine's output. Building it is what exposed 038 |
| 040 | First run is gated by a **cookie read in `proxy.ts`** ([ADR 0014](docs/decisions/0014-onboarding-gate-is-a-cookie-read-at-the-edge.md)) | `hasOnboarded` lives in `localStorage`, which the server can't see, so an effect-driven redirect renders the dashboard and then takes it away. The cookie mirrors the store and self-heals when they disagree |
| 041 | **One confirmation dialog in the product**, on Reset everything ([ADR 0015](docs/decisions/0015-one-confirmation-dialog-and-it-is-earned.md)) | Clearing transactions is undoable and gets a toast like everything else. Reset takes the preferences with it, so there is nothing left to restore from — which is exactly and only when a dialog is justified |
| 042 | `cn()` is given the type scale explicitly ([ADR 0016](docs/decisions/0016-cn-is-taught-the-type-scale.md)) | tailwind-merge assumes an unknown `text-*` is a colour, so `text-micro` was being deleted by the `text-stone` beside it. 27 components across every phase were rendering at the browser default |
| 043 | Alerts are **one timer capped at two minutes, re-armed** ([ADR 0017](docs/decisions/0017-alerts-are-one-timer-and-a-grace-period.md)) | A timer per call leaks; one long `setTimeout` dies silently on a sleeping laptop or a throttled tab. Recomputing from `Date.now()` means the worst case is two minutes late rather than never |
| 044 | A window that opened more than **10 minutes** ago is recorded, never fired | Opening ember in the morning would otherwise fire one notification per window that opened overnight, each announcing itself as news. The grace period is also what lets a late timer still deliver |
| 045 | A **visible tab gets a toast**, a hidden one gets the system notification | Interrupting the OS about a screen the user is looking at is how an app's notifications get switched off. Same content, different delivery |
| 046 | Permission is asked from the **switch**, and `denied` is a state with its own copy | Browsers don't offer a second prompt and JavaScript can't un-block. On iOS `Notification` doesn't exist outside an installed PWA — that's `unsupported`, not `denied`, and needs a different sentence |
| 047 | The two alert types that don't exist show a **"Not yet" chip**, not a switch | A disabled switch reads as "off", which is a claim about a setting. A chip reads as "not a setting yet", which is true |
| 048 | `mist` is **not a text colour**, and there are two muted levels, not three ([ADR 0018](docs/decisions/0018-colours-are-calibrated-against-their-own-tints.md)) | 90 uses of `text-mist` measured 2.4–3.2:1. The lightest warm grey that clears AA is 5% off `stone` — indistinguishable, so the palette has room for two. Hierarchy below `stone` is carried by size |
| 049 | Direction colours are calibrated against **their own tints**, not white | `text-moss` lives on `bg-moss-tint`, never on white. Measured against white every tinted chip and the nav pill sat just under AA — 4.33 for ember, 4.46 for moss |
| 050 | Placeholders reserve a **line box**, not a rectangle ([ADR 0019](docs/decisions/0019-skeletons-are-sized-by-type-metrics.md)) | `h-4` where `text-body` lands is 7px a row, and the asset page measured 0.635 CLS against a stated rule of zero. A transparent glyph in the real type class can't drift |
| 051 | The public argument pages are **exempt from the first-run gate** | Lighthouse found the redirect made every route uncrawlable. Methodology and track record hold nothing personal, they are the pages you would send someone, and setup is a bad welcome |
| 052 | ⌘K is **desktop-only and mounted only there** | A key combination is not an affordance on a touch screen, and the bottom nav already puts every destination one thumb away |
| 053 | A navigation out of onboarding is **claimed by a ref before it starts** ([ADR 0020](docs/decisions/0020-the-onboarding-gate-is-verified-not-assumed.md)) | `completeOnboarding()` flips a subscribed selector in the same commit, so the self-heal effect re-ran and its `router.replace("/")` overtook the `/portfolio` the button asked for. A ref, not state, because it must be true before the render that schedules the effect |
| 054 | The gate cookie write is **read back**, and "cookies blocked" is a screen | `document.cookie =` fails silently under restricted storage. The app redirected into `proxy.ts`, got bounced, self-healed, and bounced again — a loop that survives reload and in which every button looks dead. A `?onboarded=1` escape hatch was rejected: it survives one navigation and then lies |
| 055 | Sticky chrome is **opaque, never `backdrop-blur`** | `backdrop-filter` forces a compositing layer, and composited `position: sticky` is a long-standing iOS Safari hit-test hazard — the layer paints where it scrolled to while its tappable region stays put. It was the only structural pattern shared by the onboarding footer and the page header, which is what predicted "and some other buttons" |
| 056 | The 44px minimum is enforced as a **hit region, and only vertically** ([ADR 0021](docs/decisions/0021-the-44px-floor-is-a-hit-region-not-a-size.md)) | Expanding horizontally too is the usual version and it is harmful: edit and delete on a transaction row are 28px wide and 4px apart, so the regions overlap and delete owns the overlap. Correcting the *visible* ramp is the redesign's job; correcting the *hit* region was a correctness fix that couldn't wait |
| 057 | The palette is **measured before it is written** ([ADR 0022](docs/decisions/0022-the-palette-is-derived-and-the-neutrals-are-the-hard-part.md)) | A script computes every text-on-surface pair the palette produces and refuses to proceed on a failure. Every pair cleared AA first try, and `audit.mjs` returned 0/36 first run. ADR 0018 was the lesson; this is the habit |
| 058 | Light mode is **white on white** — `ground` and `surface` are the same value | The palette-level half of "a card is not the default container". If a card lifts off the page for free, it stays the default forever. Dark keeps real value separation because there it costs nothing |
| 059 | **Primary is the brand**, reversing v1's ink button | v1 reasoned that a saturated button reads as a sales pitch, which was right for orange in a monochrome app. Every reference in this category puts the brand on the primary action — that is what makes a brand colour mean "press this" |
| 060 | Hover is a **token per theme**, not an opacity step | `bg-primary/80` blends toward whatever is behind, so it darkens on light and lightens on dark only by accident, and over a tinted surface does neither |
| 061 | **Satoshi**, self-hosted, and the width axis is gone ([ADR 0023](docs/decisions/0023-satoshi-and-the-loss-of-the-width-axis.md)) | Chosen by rendering candidates on the app's own strings against the new palette, with Archivo as a control. Won over Switzer on the numerals, which is the right criterion for a column of prices. Hero density now comes from weight and tracking |
| 062 | **Phosphor, behind one module** | v1 set `strokeWidth` by hand at 30 sites with eight different values, which is most of why the icons read as assembled. Phosphor also has a `fill` cut of every glyph — the outline-to-fill active state that Lucide cannot express |
| 063 | `up`/`down` replace `moss`/`clay`; `faint` replaces `mist` | The v1 names described warm hues. Semantic names survive a palette change; descriptive ones become lies |
| 064 | **A card is not the default container** ([ADR 0024](docs/decisions/0024-a-card-is-not-the-default-container.md)) | 31 wrappers across five screens. The tell is the *structure* — a uniform grid of bordered rectangles — so restyling the card would have changed nothing. Default is `Section` + `Rows`; `Card` keeps three jobs |
| 065 | Desktop caps at **1600px and answers width with a second column** | v1 capped at 1024 with no `lg:`/`xl:` anywhere, so the layout was identical at 768px and 3440px. Text never gets wider; the page gets *more*. Screens that are genuinely one column get `narrow` (896px) instead |
| 066 | Nav is **four icon-only tabs** ([ADR 0029](docs/decisions/0029-four-tabs-and-a-profile.md)), Settings behind a profile control | A gear as a peer of Home and Portfolio claims configuration is a main surface. Watchlist folded into Portfolio as a segment — under an alpha-finder framing it is an input to the engine, not a destination |
| 067 | `/advice` → `/signals`, `/watchlist` → `/portfolio?view=watching`, both permanent redirects | The old paths are in installed PWA shortcuts and in notification payloads sitting in OS queues. The segment lives in the URL so the redirect lands on the right one |
| 068 | The greeting is **seeded once per visit** and renders `null` until mounted | It reads the local hour and a stored name, neither of which the server knows (ADR 0017). Picking at render time would flicker during hydration and change the wording mid-read |
| 069 | The chart's end marker is **CSS, not `<svg:circle>`** | The plot is `preserveAspectRatio="none"`, so anything round in that space renders as an ellipse stretched by the chart's width. Invisible at 960px, obvious once the column reached 1160px |
| 070 | **Ownership enters at the API boundary**, and derived positions cross the wire ([ADR 0025](docs/decisions/0025-ownership-enters-at-the-api-boundary.md)) | The loss-prevention half of the product cannot exist without it, and moving the engine to the browser would ship ten strategies into the bundle. Four derived numbers per open position — never the ledger. **This spends a privacy property that used to be absolute**, and it is said in settings, in §8 and in the route |
| 071 | `isActionable()` splits into **`qualifies()` and `isReady()`** | It required `hasWindow`, which is false only when the market is shut for the whole 72-hour horizon — so it read as a timing gate while behaving as a market-closed gate, and did neither job. Split, each says one true thing, and "found — the window opens Thursday" becomes sayable |
| 072 | The **risk sizing rule is one function**, `reduceTo` | Six triggers, one answer: reduce to the weight ember would hold today. Per-trigger fractions would each need their own derivation, and "halve it" is a made-up number wearing the costume of a calculation |
| 073 | Risk and opportunity are **one ranked list**, not two panels | Two panels make the user do the triage, which is the job. A token-unlock watch on 12% of the book does not belong above a high-conviction buy with the window open now, and only one ordering can say so |
| 074 | `HandledCall` and `AlertRecord` re-key on **`kind:symbol`** | Both keyed on the bare symbol. A position over its concentration cap while the read still says accumulate is two live findings on one instrument — dismissing or alerting either silently consumed the other. Both stores reset on migration rather than translate |
| 075 | Only the **diffusive residual** feeds the GARCH variance ([ADR 0026](docs/decisions/0026-the-jump-fed-the-variance.md)) | A jump is 2–5σ by construction, so `α·jump²` was 0.32–2.0× the variance and every jump ratcheted volatility permanently upward. Overflow → `exp(−σ²/2)` underflows → the rescale divides by zero → the whole series is `NaN`. α+β = 0.98 is stationary *in expectation*, which is not bounded; 13 instruments never rolled it, 110 did |
| 076 | The advice page limit is **unconditional**, including over actionable calls | The first cut exempted anything clearing the bar, reasoning that a limit hiding a recommendation is a bug. Measured, that exemption *was* the bug: 36 of 110 cleared the Balanced bar, so a page of 25 served 38 and 315 KB. Nothing is hidden — the full `actionable` list is a few hundred bytes of strings, and the feed states what it didn't draw |
| 077 | **Severity is a word, not three tints** | Only `critical` gets the direction tint. Three coloured levels turn the inbox into a traffic light, which is the casino register the brief rules out — and a list where everything is coloured says nothing about which item matters |
| 078 | `SectionHeader` **wraps rather than truncates** | Title, hint and link have no slack at 375px, and `truncate` turned "12 strongest of 28" into "12 s…" while squeezing the title onto three lines. Same rule as ADR 0023: never produce a word fragment to make a heading fit |
| 079 | **News is context, never evidence**, and it is enforced ([ADR 0027](docs/decisions/0027-news-is-context-never-evidence.md)) | ADR 0005 ruled out sentiment; a headline feed one tab from a signal engine is a standing invitation to relitigate that. A test walks `lib/signals` imports and a second reads `NewsItem` for a `sentiment`/`relevance`/`score` field. A rule that lives only in prose erodes the first time someone reaches for "just a relevance nudge" |
| 080 | The mock's **news outlets are invented** | Every other mock invents numbers. This invents *words attributed to an organisation* — a fabricated Reuters headline about a real company, screenshotted, is a fake news story with a real byline. Real attribution arrives only with a real feed |
| 081 | Trending is **counted, not chosen** | An authored list of "today's topics" is an editorial claim dressed as a measurement — the same failure as a hardcoded track record. Topic frequency, and a topic mentioned once is a story rather than a trend |
| 082 | The value hero **leads Home again**, with findings directly beneath | The inbox led for one iteration and it was wrong: a home screen needs a focal point, and on a finance app that is the balance. A screen opening on a queue of warnings is a to-do list. Findings second is still a reordering of v1, where they sat below the chart, the positions and the movers |
| 083 | The greeting is **stone with the name in `brand-text`**, not a heading | It shipped at `text-title font-semibold text-ink` — byte-identical to every page title — directly above a 64px balance, so it read as a stray `h2` that had lost its section. Size stays put: two things competing to be the focal point is how a home screen stops having one |
| 084 | "Yours" **ignores an uncurated watchlist** | The watchlist defaults to a "following everything" sentinel, so resolving it selected all 110 symbols and the filter silently did nothing — measured at 43 of 43. Same rule as the urgency nudge in `findings.ts`: a preference expressed about everything is a preference expressed about nothing |
| 085 | The gate **owns the server** ([ADR 0028](docs/decisions/0028-the-gate-owns-the-server.md)) | Every script said "run against a production build" and then trusted whatever answered the port. A `next start` left over from an earlier session reported seven violations on Home, four of them the Next.js error page — `next start` resolves its manifests at boot, so it served a build that no longer existed. Detection can't work (build-id assets are served from disk, so a stale process returns 200 for the new build); owning the process can. An occupied port is now a hard failure, not something to attach to |
| 086 | The **lead question is a second line**, and it inherits the money rule | Asked for by the user. The pool's natural register is "fancy making some money?" and that is the one line it cannot have — it sits four rems above a balance that might be red, on the screen someone opens the morning after a bad week. `greeting.ts`'s header already banned money, markets and performance in this block; phase 17 turned that into `MONEY_WORDS` and a test, because a rule in a comment is a rule until someone reaches past it |
| 087 | The question steps down by **size, not colour** | `stone` is the last muted level and `faint` is not a text colour (ADR 0018), so below `stone` the only hierarchy left is the type scale — 28px medium over 17px regular. Buying separation with a lighter grey would put the quieter line under the contrast floor, which is how the palette got measured in the first place |
| 088 | Both greeting lines share **one `aria-live` region** | They arrive in the same commit and they are one thought. Two polite regions queue two announcements, and the second interrupts a screen-reader user mid-sentence for a pleasantry |
| 089 | The asset hero is **one element, not a fragment** | `PageBody` is `space-y-9`, so a fragment made the name block and the price row two siblings: the price sat 36px under the name where its `mt-3` asks for 12, and the one-element skeleton could never match the two-element hero however carefully its rows were sized. 50px of the asset screen's layout shift was this alone |
| 090 | `Your position` is **reserved from the ledger, filled from the queries** | It needs quotes, rates and `instrument`, and `instrument` rides the slowest call on the page — so a 149px section appeared four seconds in and pushed everything under it down while the reader was looking at it. Whether there is a position is knowable from `localStorage` one frame after hydration. Net quantity, not "has ever traded": space held for a block that never arrives collapses upward, which is the same shift pointing the other way |
| 091 | The value hero steps down **below 375px as well as past nine digits** | Digit count is a property of the number; room to draw it is a property of the viewport. At 320px an ordinary six-figure dollar balance pushed the document 36px wide on four screens. `max-[374px]:` takes the same step a long number takes, and the two compose — the skeleton takes it too, or the shift it prevents comes back |
| 092 | The CLS gate is **Google's 0.1**, not a number chosen to pass | Nine screens measure under 0.02 and would clear a gate at 0.03. The asset page's remainder is the documented hydration insert, and closing it needs a cookie mirroring the ledger's existence — a decision to take deliberately, not to reach for because a figure is ugly. Tightening the gate is the right move the day that cookie exists and not before |
| 093 | `capture.mjs` **empties the screenshot directory** before writing | Phase 13 renamed a slug and phase 14 restructured a screen; both sets of PNGs simply stayed on disk. A folder where some images are current and some are two redesigns old, with nothing to tell them apart, is worse than no folder |
| 094 | The splash is the **route's SSR fallback**, not an overlay with a timer ([ADR 0030](docs/decisions/0030-the-launch-screen-fills-a-frame-that-was-already-blank.md)) | `/onboarding` reads `useSearchParams`, so the prerendered HTML *is* the `Suspense` fallback — an empty white rectangle held for the length of hydration, and the first thing every new user has ever seen. Putting the splash there costs zero milliseconds. A minimum display time on an app-wide splash was rejected outright: this codebase publishes its own LCP |
| 095 | The launch ground is **`ink`, not the brand blue** | `#0B0C0F` is what the app icon is already drawn on, so the OS launch frame, the home-screen icon and the in-app splash are one object seen three times. Hard-coded rather than tokenised for the same reason `offline.html` duplicates the palette — it has to be right before the theme is known, and it is the same in both |
| 096 | Onboarding is an **art panel plus a column**, not a column | It shipped as one 512px stack of prose — step one alone ran a headline, a lede, three claims with full paragraphs and a disclosure block, over a thousand pixels tall on a phone and identical at 3440px. Every reference in the category opens on a picture and about forty words. The claims are one line each now; each is restated with citations on the methodology page, which is where someone who wants the detail is going anyway |
| 097 | The panels are **illustration, and never look like data** | A fake equity curve on a welcome screen would cost more credibility than any illustration could buy, on a product whose argument is that its numbers are real. The vocabulary is the ember point at sizes it never reaches inside the app. Two of the three respond to the choice beside them — the arcs light with the profile, a market dims when switched off — which is what earns the space |
| 098 | The onboarding shell is **`h-dvh` with nothing sticky** | `min-h-dvh` let the column grow past the viewport, so `flex-1` resolved to content, the *page* scrolled, and the controls went below the fold — which is why they were sticky. Pinning to the dynamic viewport makes the middle the only scroller. It also removes the last `position: sticky` from the one screen that was reported as having dead buttons on mobile: a composited sticky layer is the iOS hit-test hazard decision 055 only half-addressed |
| 099 | Market blurbs describe a **kind, never a count** | They said "six large-cap US names" and "three major pairs", written when the universe was thirteen instruments. It is 110. A number in onboarding copy is a promise `universe.ts` has to keep, and nothing was keeping it |
| 100 | **Accounts are optional**, and the ledger stays local-first ([ADR 0031](docs/decisions/0031-accounts-are-optional-and-the-ledger-is-local-first.md)) | Same argument as ADR 0007 made for market data: with no Supabase project configured the app is exactly what it was, and no account control renders anywhere. §7 rules out spend before revenue and a free-tier project *pauses* — an app that hard-requires one is down when the project sleeps. The ledger is also the one thing the user typed by hand, and everything else is recomputed from it; moving the source of truth to a network makes the most reliable part of the app depend on the least |
| 101 | A **magic link, and no password field** | A password puts ember in the business of storing, resetting and being breached for credentials, to protect a ledger the user could retype. It also removes the enumeration problem — "wrong password" and "no such account" leak whether an address is registered, and a link says the same sentence either way |
| 102 | Sync is **last-write-wins per row, with tombstones** | Whole-document LWW is simpler and much worse: logging a trade on a phone silently discards the three logged on a laptop that morning, and the survivor looks perfectly coherent so nobody notices. Deletions are rows rather than absences because an offline device cannot tell "deleted" from "not told about yet", and guessing the second pushes deleted trades straight back up |
| 103 | `updated_at` **belongs to the client; there is no trigger** | The obvious `before update set updated_at = now()` stamps arrival rather than authorship, so a device that syncs late always wins. Edit on a laptop, edit differently on a phone an hour earlier, open the laptop last, and the phone's older edit is written with a newer server timestamp and beats it |
| 104 | `pickNewer` takes a **wrapper, not a nullable value** | Caught by its own test. The first version read `null` as "no row on the server", which is right for preferences and catastrophic for the watchlist, where `null` is decision 023's "following everything" sentinel — a server row saying "everything" would lose to a stale local list and be overwritten by whichever device synced next |
| 105 | The notification badge **never counts a warning** | Three sources, and a warning is not an event: it is a condition, true until the thing changes. A badge that includes one can never reach zero, and a badge that can never reach zero is one the user stops seeing within a week — at which point it has stopped working for the alerts too, which are the ones that expire |
| 106 | The inbox is a record of what was **sent**, not what is due | Written by the alert watcher at the moment of delivery. Re-deriving "what would be due now" on the screen would list interruptions that were never made, because the watcher only runs while ember is open — an inbox full of notifications nobody received is worse than an empty one |
| 107 | Broadcasts are **seeded from the build**, and the table is additive | `/api/notices` returns the stored rows *plus* the release notes compiled in, and the client renders the compiled ones as `initialData`. A fresh project has no rows and would otherwise show an empty screen; and the skeleton this removes was 0.39 of layout shift |
| 108 | Page padding **steps to 16px below 360px** | The bell made four controls in the header beside the lockup, and at 320px the row pushed the document 7px wide on four screens. Header and `PageBody` move together or the title stops sitting over its content — and `bleed`'s `-mx-5` had to follow, or the risk table hung 4px off each edge |
| 109 | Settings is **navigated, not scrolled** ([ADR 0032](docs/decisions/0032-what-a-profile-is-allowed-to-hold.md) is the profile half) | One column of eight stacked sections was ~2,400px on a phone with the risk comparison table buried in it. Ordering by consequence was right and only helps someone reading top to bottom, which nobody does on a settings screen. Desktop gets a real sidebar beside a measure-capped pane — the one screen in this app where a persistent list of destinations is the standard pattern. The section lives in `?tab=` so it is linkable from a warning or another screen |
| 110 | A profile holds **five fields**, and each is used by something visible | A finance app is exactly where "date of birth, address, income bracket" starts feeling normal — Chime asks for all of it, correctly, because it issues a card. ember issues nothing, so every field is a straight cost: something to store, leak and have to delete. Nothing is required, there is no completeness meter, and the time zone is *detected* — a question you can answer for someone is one you shouldn't ask |
| 111 | Deleting an account takes **two gates, and the second is typed** | A confirmation dialog is a reflex; typing a phrase cannot be done by reflex, which is the only property that matters with no undo. Not a contradiction of ADR 0015 — the same rule at a stronger point on the scale, since Reset is undoable in principle and this removes rows the client cannot restore. Rows are deleted *before* sign-out, or RLS correctly refuses the deletes and the account looks deleted while not being |
| 112 | Sign-in is offered on onboarding's **first step, under the controls** | Every reference puts it on the welcome screen because those apps cannot do anything without an account. ember can do all of it, so leading with a wall claims a requirement that does not exist. It sits below the CTA where a returning user finds it and a new one is not stopped by it. **This is the shape that changes when plans land** — noted rather than pre-built |
| 113 | ember serves a **headline and a summary, and links out** | Not a gap the live feed fills — the answer. An article's text belongs to whoever wrote it, and Finnhub supplies headline, summary, source, timestamp and URL for the same reason. So the detail pane earns itself with the one thing a news app doesn't have: the instruments the story touches, priced, with a way through to the engine's read — shown *beside* the story and never derived from it |
| 114 | The open story is **local state**, where the settings tab is a URL | They look like the same problem and aren't. A settings section is a destination that gets linked to; a story is a selection inside a list whose filters are already local, and putting it in the URL means the filters have to go too or the link resolves to a story that isn't in the list it opens |
| 115 | Each document sync **fails on its own** | They were awaited in a chain, so a project with migration 0001 applied and 0002 not — which is the state a real project was found in — threw on the profile's `select` and took preferences and watchlist down with it, reporting a total failure of a sync that had already written the ledger. A partial sync is a normal condition during a migration window |
| 116 | Live data is **four upstreams behind one provider** ([ADR 0033](docs/decisions/0033-live-data-is-four-providers-and-one-of-them-is-a-problem.md)) | No single free source covers equities, crypto and FX, so `LiveProvider` is a router: Yahoo for equity bars, CoinGecko for crypto, the ECB for exchange rates, Finnhub for filed accounts, news, search and earnings. ADR 0007's promise held exactly — it landed without touching a component, a route, a store or an engine module |
| 117 | Every endpoint was **probed against the real key** before a line was written | Finnhub's pricing page and Finnhub's free tier disagree. `/quote`, `/stock/financials-reported`, `/company-news`, `/search` and `/calendar/earnings` all work; **every candle endpoint is 403**, as are `/forex/rates` and `/calendar/economic`. That table, not the documentation, is what decided the architecture |
| 118 | **Yahoo is used for equity history, and it is a pre-revenue blocker** | It is undocumented and unlicensed for programmatic use. There is no licensed free alternative: Finnhub's candles are 403, Alpha Vantage allows 25 requests a day against 110 instruments, Stooq is behind a bot check, and Polygon and Tiingo need keys nobody supplied. Leaving equities generated would make "live data" cover 38 of 110. So it ships, default on, isolated to one file, and recorded in §7 beside Stripe and Vercel Hobby — the two other things that must change before ember charges |
| 119 | Fundamentals are the **filed 10-K**, not `/stock/metric`'s 133 ratios | The ratios would have been a tenth of the code. ember's claim is that its arithmetic traces to a published method, and a P/E somebody else computed is a number it cannot show its working for. `/stock/financials-reported` is the parsed EDGAR filing ADR 0006 planned for, without ember having to read XBRL |
| 120 | The share count is **derived from diluted EPS** where it isn't filed | Almost nobody puts a share count on the face of the balance sheet — it is on the cover page, which Finnhub does not parse. Net income over diluted EPS *is* the diluted share count: the definition rearranged, not an estimate. This one line took fundamentals coverage from **32 of 72 to 49** |
| 121 | 23 equities have **no computable fundamentals, and that is the method's own scope** | Banks file unclassified balance sheets — no current assets, no gross profit, no operating income — so Piotroski and the Magic Formula are undefined for them, and Greenblatt excludes financials and utilities by design. Integrated oil reports no gross margin at all. The strategies abstain, which already costs coverage rather than confidence (decision 011). The mock had been generating a fake balance sheet for JPMorgan |
| 122 | News is matched on **full company names**, never tickers and never stems | Tickers were ruled out first: fourteen equities have one- or two-letter symbols, so scanning prose for `SO` tags every story containing "so" as Southern Company. Taking the *first word* of a name was the same mistake one level up and it shipped before being measured — `Bank of America` became `\bBank\b` and put "bank" top of the trending strip attributed to Intel and BlackRock, and `NEAR Protocol` matched the English word *near* in a story about Berkshire |
| 123 | `markets` and `companies` are **not topics** | Every item in the feed is a market story about a company, so tagging them that way put two chips at the top of trending on every refresh — measured at 100 and 88 mentions against `disney` at 4. A chip that is always first is not a measurement of what is being written about, which is the strip's entire claim (decision 081) |
| 124 | Crypto's `changePct` is **derived, never taken from the API** | CoinGecko computes the absolute and the percentage change from different snapshots and they disagree — measured on BTC, `+66.65` came back beside `−0.50%`. Rendered faithfully that is a green figure and a red one on the same row, which reads as a bug in ember |
| 125 | **MATIC left the universe; POL replaced it** | Polygon migrated its native token in 2024. CoinGecko still answers for the legacy contract — with 87 days of daily history against POL's 365, a third of what the engine needs before it will speak. The row was renamed rather than pointed at a successor under the old ticker: silently repricing a held symbol against a different asset's series is how a cost basis becomes fiction |
| 126 | The gate is **pinned to generated data** | `verify.mjs` forces `EMBER_DATA_PROVIDER=mock` for the build and the server. Otherwise every number in §8 is a fact about the market on the day it ran — layout shift moves with the day's finding count, and a quiet news day empties a screen the capture exists to prove |
| 127 | Settings is **one horizontal tab row**, not a sidebar | The desktop sidebar was the macOS/console instinct applied to eight short labels with nothing nested under them. That pattern earns a column when sections are deep; these fit across a page. It also removes the heading that had to be hidden on mobile because the chips said it and shown on desktop because the sidebar was too far away |
| 128 | The desktop rail is set at the **settings tab row's scale** | It shipped at `text-body` with 22px icons in 48px rows — the same size as the copy on the page beside it, so four destinations read as loudly as the thing they lead to. Navigation is chrome. One size across both navigations rather than two |
| 129 | News and Signals **take the full width** | News is the one screen that is genuinely two columns of *content* rather than a column and a companion, and `narrow` was squeezing a master–detail layout into two thirds of the page. Signals pairs its cards past `xl` rather than running one 760px card down the middle of 1600px |

| 130 | The news cache key was **rotating, which defeated the cache entirely** | `finnhub.news()` keyed on `Math.floor(at / 600_000)`, so every ten minutes produced a cache *miss* rather than a stale hit — stale-while-revalidate never applied and somebody paid the full 20s, forever. The namespace held eight slot keys with ages spread over days, which is the bug written down. Constant key, rotation moved inside the loader: **20.0s → 1.4s cold** |
| 131 | `cached()` hands the loader **what is already stored** | The rotation had to move inside the loader, and a loader that replaces the value would lose the previous slice on every refresh. Passing `previous` lets the news pool *accumulate* — which is what the old comment claimed and the old code could not do. Every other caller ignores it: a day of AAPL bars replaces a day of AAPL bars |
| 132 | A reader always sees the pool **as of the previous refresh** | Consequence of stale-while-revalidate, and counter-intuitive enough to be worth a test of its own: the append triggered by your request lands for the *next* reader. Two drafts of that test raced their own fixture and read like a cache bug. It is the property that makes a 10-minute TTL over a 20-second upstream cost nobody anything |
| 133 | **Two caches over one feed was one too many** | `getNews()` had its own five-minute TTL above the provider's ten-minute one, so the provider was not asked at all for five of those minutes and the refresh that accumulates company news kept being deferred. Measured: three requests twenty seconds apart returned a byte-identical payload while the pool underneath never grew. Now only `trendingFrom` is memoised here, keyed on the array's identity |
| 134 | **A cold universe load reports a subset rather than blocking** ([`LOAD_DEADLINE_MS`](src/lib/signals/context.ts)) | The free tiers are the wall: 72 Yahoo calls plus 24 CoinGecko coins at 30 requests a minute is over a minute of upstream time no concurrency shortens. `loadUniverse` now takes what arrived in 8s and reports the rest. **Nothing is wasted** — every abandoned fetch still resolves into the provider cache, so the work this deadline gives up is what the next request finds done. Measured: **105s blocking → 8.0s, converging to 94 of 110 within 25 seconds** |
| 135 | `pending` is **reported on both screens, never hidden** | "12 of 86 clear your bar" is a different claim from "12 of 110". Both queries poll every 15s while it is non-zero and stop when it clears, and a partial universe gets a 5-second cache rather than the full minute — holding it longer would throw away exactly the fetches the deadline was betting on |
| 136 | Pending is **distinct from absent** | A crypto row with no provider mapping returns an empty series and is permanently gone; a timed-out one is on its way. `withDeadline` resolves `null` rather than a fallback so the two can be told apart — a screen that says "still loading 12" forever about instruments that are never coming is worse than one that says nothing |
| 137 | News is paged **in the browser, and the server is not asked for a page** | `/api/news?page=` looks obvious and quietly breaks both filters: "Yours" and the trending strip are computed client-side against the whole feed precisely so the symbols a user holds never reach that route (ADR 0025). Paginate server-side and "Yours" can only find holdings on whichever page loaded. So the payload stays whole — bounded by a 200-item pool, ~110 KB — and the rendering pages at 20 |
| 138 | **A button, not infinite scroll** | This is a master–detail list: a reader opens a story and comes back expecting the list where they left it. Auto-loading on scroll moves that ground, and it removes the one thing a long list needs — an end |
| 139 | **Crypto news is a category, not a feature** | Finnhub's `/news?category=crypto` was already available and maps onto the `crypto` `NewsCategory` the filter and trending strip already handle. Measured 28 of 62 items on the cold path. `forex` and `merger` also work and are deliberately not added — every extra general call is on the blocking path |

| 140 | **An exchange is a first-class thing**, not a label ([ADR 0034](docs/decisions/0034-an-exchange-is-a-first-class-thing.md)) | `liquidityAt()` hard-coded `America/New_York` and 09:30–16:00 for every equity — right while all seventy-two were American, wrong the moment one was not. Sixteen venues now carry a zone, hours, a lunch break where there is one, a currency and a minor-unit divisor. Verified live: Tokyo's window opens 13:17 JST, London's 12:17 BST, Taipei's 09:17 CST, Cairo's 13:17 EET |
| 141 | The intraday liquidity curve is **fractions of a session**, not clock times | Expressed that way, one documented U-shape describes a 4.5-hour Taipei day and an 8.5-hour London one. It keeps its deviation — the open scores *low*, because heavy volume with wide spreads is not good execution — and gains a real one: a lunch break is liquidity **zero**, not "thin". Tokyo and Hong Kong halt for an hour, and a window opening into it could not fill |
| 142 | **The same instrument literal was hand-written in four places, and three dropped `exchange`** | `listInstruments` in both providers, `buildContext`, and the asset route. Nothing failed — every equity on earth simply had its window computed against New York hours, measured on a live server as Toyota, Shell and Naspers all returning 14:15–20:00 UTC. One `toInstrument()` now, exhaustive over `Instrument` with a compile-time check, so a field added to the type cannot be silently dropped on its way to a screen |
| 143 | **London quotes pence and Johannesburg quotes cents**, and the divisor is applied once | Probed, not assumed: Yahoo returns Shell at 3313.825 with a currency of `GBp` and Naspers at 79770 with `ZAc`. Taken at face value a holding is wrong by a factor of a hundred — cost basis, weight, the concentration warning, everything downstream. Divided at the single point candles are built, so nothing above the provider ever sees a minor unit, and asserted in a test in both directions |
| 144 | Currency and precision come from the **venue**, not the row | Shell is pence in London and dollars in New York; won and yen are whole units. Ninety-two rows each declaring their own currency is ninety-two chances to disagree with the exchange they trade on |
| 145 | **Every ticker was probed before it was written down** | 93 candidates, 92 with 1,214–1,280 daily bars. Roche was dropped because Yahoo does not answer for `ROG.SW` — and a row that cannot be priced vanishes silently, which is exactly what the mapping test exists to prevent |
| 146 | Sixteen currencies, and **the naira is finally live** | The ECB publishes thirty, covering all the FX legs and five of the new quote currencies. It does **not** publish TWD, EGP or NGN, so those three come from Yahoo (`USDNGN=X`, measured ₦1,357.32). §8 flagged the compiled naira rate for two phases as the author's own currency; it is real now, and it deepens the unlicensed dependency, which is in §7 |
| 147 | **Fundamentals are US-only, and the check is the venue rather than a 403** | Measured: `/stock/financials-reported` returns an empty array for ASML and 403 for `SAP.DE`; sampled across twelve international listings, zero resolve. The endpoint is EDGAR-derived. So Piotroski and the Magic Formula abstain for all ninety-two international rows — coverage, not confidence (decision 011) — and returning early keeps ninety-two pointless calls off a cold load |
| 148 | The NGX gets a **collector**, not a compromise ([ADR 0034](docs/decisions/0034-an-exchange-is-a-first-class-thing.md)) | Its API serves today and only today: no history endpoint, no honoured date parameter, and Yahoo does not list the exchange. Four options — pay, list prices with no view forever, skip Nigeria, or start collecting. `scripts/collect-ngx.mjs` stores one session a day and the engine speaks after two hundred, about ten months out |
| 149 | `dataState: "collecting"` exists because **a wait is not a judgement** | A priced instrument with no signal is indistinguishable from one the engine considered and declined, and presenting the first as the second is the more damaging way round. The asset page says ember is building the history and why; the watchlist shows an untinted `Collecting` chip — a status, not a direction (decision 077) |
| 150 | The collector lives in `scripts/`, and `ngx_daily` has **no write policy at all** | It needs the service-role key, and that key never appearing under `src/` is one of the few absolute rules here. RLS on with a `select` policy and no `insert` means every client is refused and one scheduled script is the only thing on earth that can add a bar |
| 151 | The NGX board is paginated at **50**, because larger pages 502 | Measured: 5, 20 and 50 return data; 100 and above answer 502 with an HTML error page. The endpoint also went down mid-session during this phase and came back — which is its own argument for storing history rather than depending on it live |
| 152 | A two-letter name is matched **case-sensitively**, not dropped | `BP` fell under the news matcher's three-character floor, so it could never have been tagged — silently. Matched as `\bBP\b` in exact case it is precise, where a case-insensitive two-letter pattern is the same mistake as scanning prose for `SO`. Forty-five aliases now carry the international names a headline actually uses |
| 153 | **Six more rules, and all of them price-only** ([ADR 0035](docs/decisions/0035-six-more-rules-and-the-three-defects-they-exposed.md)) | Phase 23 measured filed accounts at zero of twelve international listings, so anything reading accounts is silently a US-only feature. Betting against beta, residual momentum, the 52-week anchor, short-term reversal, industry momentum and currency momentum read prices and policy rates only, and each carries a peer-reviewed source |
| 154 | **`defensive` is its own family**, not a kind of value | It is the only family whose edge *improves* when the market falls — the published mechanism, not a coincidence — so it is the one place a stressed regime raises a weight rather than cutting one. Conservative weights it 1.35, the strongest preference either profile expresses; aggressive weights it 0.6 rather than 0, because taking more risk on purpose is not the same as pretending the evidence is absent |
| 155 | **A cross-section is a property of a market on a date**, not of the instrument being assessed | Five of the six additions are cross-sectional. Computed inside each rule that is one 176-name sweep per rule per subject per date; computed once per market per date it is one sweep, shared by every subject on that bar. It is also what made the phase net *faster* than the engine it started from |
| 156 | **Two of ten rules were one rule, measured at 1.00** | `dual-momentum`'s score was `min(absoluteStrength, relative)` and `absoluteStrength` was character-identical to `ts-momentum`'s entire score, so the `min` almost always picked it. Because `assess()` raises blended confidence when rules agree, the duplication made ember *more* confident rather than announcing itself. Fixed by the more faithful reading — Antonacci's rule is a switch, so the absolute leg decides the sign and the peer ranking carries the strength |
| 157 | **The most expensive thing in the engine was a loop that should not have existed** | `clenow` read `closesOf(peer.candles).slice(-WINDOW)` — converting 420 bars of every peer to produce ninety numbers, the exact mistake `annualisedVol`'s own comment warns about — and recomputed a market-wide quantity once per subject. 1,726ms against 257ms for the rest of the engine combined. Moved into the snapshot: 20,416 sweeps per backtest profile became 579, and all three profiles went **50.7s → 24.9s** with byte-identical output at every step |
| 158 | Once no equity rule read a peer's bars, the peer slice went **behind a memoised getter** | 74,000 element copies on every context built, ~20,000 times per profile, for data nothing was reading. `buildContext` fell from 693ms to 185ms per 1,760 contexts. A getter rather than a signature change, so `PeerSeries.candles` stays a plain array to the FX rules that genuinely need it |
| 159 | The collinearity gate is a **duplication detector plus a named list**, not a threshold chosen to pass | 0.98 is calibrated on an actual duplicate. Setting it just under the worst surviving pair would be decision 092's lie of arrangement, so the three genuinely-overlapping pairs are listed by name and a fourth joining them fails the build |
| 160 | **Adding rules lowers confidence, and that is the ensemble working** | It penalises disagreement and abstention both, so more voices on one instrument produce a lower blend. Balanced calls fell 1,357 → 774 and conservative 427 → 131. More evidence, more visible disagreement, fewer calls clearing the bar — but it moves every figure in §8, which is why they are all restated |
| 161 | **No FX real-yield rule.** Currency momentum instead | The plan asked for real-yield deviations; a real yield is a nominal rate less an inflation rate and no free source ember has serves a CPI series (Finnhub's economic calendar is 403, measured in phase 21). The choice was a formula with an invented inflation number inside it or a different rule, and a fabricated input is worse than a missing formula because the output looks exactly as calculated as a real one |
| 162 | Industry momentum scores **the sector**, so every name in it reads the same | Ranking a name *within* its sector is the obvious reading of "sector-relative" and it removes exactly the signal Moskowitz & Grinblatt say is doing the work — their finding is that the industry is the effect. Capped low: an industry tailwind is a reason to prefer a name, never on its own a reason to buy one |
| 163 | `FAMILIES` in `/api/strategies` is **derived from the registry** | It was a hand-written list of seven, and adding `defensive` left it behind — so the regime table would have gone on describing an engine with one fewer family in it, silently. That is the exact drift ADR 0012 built this route to prevent, in the route itself |
| 164 | Two confidence caps are **asserted in tests**, not left in prose | `short-reversal` at 0.45 because its published edge lives largely inside a bid-ask spread ember does not model; `bab` at 0.5 because a premium measured over decades says nothing about this week. A cap in a comment is a cap until someone reaches past it — the same reason `MONEY_WORDS` became a test (decision 086) |
| 165 | The window horizon is **per-market and derived** ([ADR 0036](docs/decisions/0036-the-window-engine-and-two-inert-levers.md)) | 72 was one constant for three markets, and the number was never wrong — it was the wrong *kind* of number, with nothing saying what it was for. Derived from "long enough to hold the next crest", the binding constraint turns out to be the weekend, so equity and FX both land on 72h and only crypto (36h) can be shorter. Two of three agreeing is the finding, not a failure to differentiate |
| 166 | **Dissent narrows the window, and the obvious mechanism was inert** | Shortening the effective half-life is the elegant story and it moved no boundary by a single hour: the blended half-life is 24–75 days for every call the engine makes, so decay across the horizon is a 4% tilt against a liquidity term spanning 0→1. Dissent raises `WINDOW_THRESHOLD` instead — from half the crest to 80% of it — which says something stronger: for a contested call, "good enough to fill in" means better. Measured: an equity window goes 6.0h → 1.0h across the dissent range |
| 167 | The backtest was **entering at a close it could not have traded** | It computed the assessment from bar *k*'s close and then entered at bar *k*'s close. Not lookahead in the signal — `buildContext` truncates correctly — but lookahead in the *fill*, which is the half of "executing does not verify the fill" a backtest can actually measure. Entries are the next bar's open now, and every trade carries `signalPrice`, `entryLagBars` and `actionGap` |
| 168 | The stop stays where **ember put it**, not where the delayed fill implies | The card gives an absolute price. If the delay moved the market against you your risk is genuinely larger than the card said, and re-deriving the stop from the fill would erase exactly the cost decision 167 exists to publish |
| 169 | The profile's **horizon axis was built, measured and removed** | The plan asked for it — Conservative should see no short-window calls at all. Built as `minHorizonDays` plus a `suitsProfile()` predicate, it filtered **nothing**: 17→17, 78→78, 143→143. A fast rule has to out-weigh fifteen slow ones to lead a call and the two fast rules cannot, because their own confidence caps stop them — mean-reversion led 6 of 143 calls on Aggressive and 0 of 78 on Balanced. Machinery for a case that does not arise, removed rather than shipped inert: a filter that never fires is a claim the product does not keep, which is decision 047's objection to a disabled switch |
| 170 | `halfLifeDays` is **exposed on the `Assessment`** | It shapes the execution window and nothing outside `assess()` could read it. A band whose steepness comes from a number the rest of the app cannot see is a band nobody can check — and it is what made decision 166 measurable |
| 171 | Delivery is a **script the scheduler runs**, never an authenticated route ([ADR 0037](docs/decisions/0037-the-server-reaches-you-and-the-key-stays-out.md)) | The plan asked for a cron against an authenticated route, and that is the wrong shape: any route that can read every user's watchlist needs the service-role key, so it just moves the forbidden credential into `src/` and puts a shared secret in front of it. A script needs no secret — possession of the key *is* the authentication. It also keeps the engine where it is: the sender asks the app for advice over HTTP rather than importing `lib/signals` |
| 172 | Unsubscribe works signed out through a **`security definer` function**, not a key | An unsubscribe link that asks you to log in first is not an unsubscribe link. `unsubscribe_digest(token)` is granted to `anon` and can flip one boolean on one row chosen by a token the caller already holds. `search_path` pinned, because a definer function resolving names through the caller's path is an escalation waiting to happen |
| 173 | **Push and email are not symmetrical, and both surfaces say why** | Push carries everything including a warning about a position; email cannot, because loss prevention needs holdings and holdings never persist on the server (ADR 0025). A digest is watchlist-scoped. Stated in the settings panel and the email footer rather than left to be discovered by trusting an email to do what it structurally cannot |
| 174 | The push cron runs **every two hours because the floor is two hours** | The delivery floor is the derivation, not the schedule. A tighter cron cannot send anything a looser one misses — it can only burn runner minutes proving it. Same for email at 20 hours daily / 6 days weekly, both deliberately *under* the nominal period so a runner starting a minute late does not turn a daily digest into an alternate-day one |
| 175 | **No email address is stored anywhere** | `email_prefs` keys on `user_id` and the sender resolves the address from `auth.users` at send time. A second copy of everyone's email in a public-schema table is a liability with no upside |
| 176 | `auth_secret`, not `auth`, on `push_subscriptions` | The web-push spec calls it `auth`, and `auth` is also the schema `auth.uid()` lives in — a column of that name on a table whose RLS policy calls `auth.uid()` is an ambiguity waiting for the planner to resolve it the wrong way |
| 177 | **Subscribing is the preference**; there is no push switch of its own | A setting that can disagree with the browser's own permission is a setting that lies half the time. Decision 046's reasoning, and decision 047's objection to a disabled control |
| 178 | The scheduler is a **GitHub Actions workflow**, not a Vercel or `pg_cron` job | §7 says the host has to change before ember charges anybody; tying the schedule to it would make that migration drag the scheduler along. A workflow in the repository moves when the repository does |
| 179 | The warm store was **deferred a second time, for a different reason** | Phase 22 deferred it because nothing was scheduled to fill it; the scheduler now exists, so that reason expired. The real obstacle is a shape mismatch: `cache.ts` is generic over its value type and the only process allowed to write the store runs outside the app, so filling it means duplicating provider logic, exposing a cache-dump route over an unlicensed upstream, or 214 round trips at load. The migration was written and then **deleted** — an unused table in a migration is worse than none, because the next reader takes it for something that works |
| 180 | Entitlements are **their own select-only table**, not a `plan` column on `profiles` ([ADR 0038](docs/decisions/0038-what-a-free-tier-is-allowed-to-withhold.md)) | A hole rather than a preference: `profiles` has an RLS policy letting a user update their own row, and **RLS is row-level, not column-level** — so a `plan` column there lets any signed-in browser run `update profiles set plan = 'pro'` and be believed. Column privileges and a trigger are both workarounds to keep right beside a policy that already says "you may write this row". A select-only table has no such ambiguity in one sentence |
| 181 | **A gate needs a reason that survives being said out loud** to the person hitting it | Two kinds qualify: it costs ember something per use (email, push), or it is more of the same thing with free still getting the *best* answer (the findings cap, applied after ranking). Anything free to serve and restricted only to create pressure is manufactured scarcity, which is the register the brief exists to rule out |
| 182 | The planned **watchlist size cap was rejected**, twice over | No cost behind it — the engine assesses all 214 instruments regardless of who watches what, so a cap saves ember nothing. And it is incoherent with decision 023: the watchlist defaults to a "following everything" sentinel, so a capped free user would be following 214 while being told they may follow 25, and fixing *that* means materialising the sentinel — the exact bug 023 exists to prevent |
| 183 | **In-app alerts are not capped on any plan**; push is | A local notification costs ember nothing, so capping it would fail decision 181's own test. Push costs a service quota and runner minutes, which is a sentence a reader can check. It would have been the easy version of the feature and the dishonest one |
| 184 | The findings cap is applied **after ranking, never before** | `findings.ts` sorts by urgency across both kinds, so the three a free reader sees are the three ember would put first for anybody — the cap shortens the answer without worsening it. Applied before the sort, or by sampling, it would be a different product sold to people who had not paid |
| 185 | A lapse **takes nothing away** | `period_end` is read as a grace boundary rather than a kill switch, in `planFrom` and identically in the sender. A ledger somebody typed by hand is theirs whether or not they are currently a customer, and the function that could break that rule is the one that states it |
| 186 | The plan gate is enforced **in the sender**, not only in the UI | A row can say `digest_enabled` because the user was Pro and lapsed, so only `scripts/send-digests.mjs` is in a position to refuse. A client-side cap on something a server sends is decoration |
| 187 | Ads are **first-party or they do not exist** | No third-party script, iframe, pixel or remote origin. A network tag would learn which instruments a reader looks at — for a finance app, a list of what somebody is thinking of doing with their money — learned by the one product claiming not to watch them. The cost is that ember cannot report an impression count, which is in §8 rather than solved with the pixel that would solve it |
| 188 | The plan table in settings is **generated from `PLAN_RULES`** | Same rule as the methodology page being derived from the strategy registry (ADR 0012). A pricing table transcribed by hand is a document that was true once, and on a product arguing "you can check this", a stale limit is worse than no table |
| 189 | **Adding `/unsubscribe` to the audit immediately found two defects on it** | The route shipped in phase 26 and the gate never visited it, because `audit.mjs` walks a hand-written route list. First run: **12 violations** — the screen rendered its own `<main>` inside the shell's, which is two `main` landmarks. Making it a bare route (it is reached from an email by somebody who may have no session; a bottom nav there is a sales pitch on the way out) left **4** — the root layout's skip link targets `#main`, this screen's `<main>` had no id, so the link pointed at nothing *and* axe stopped exempting it under `region`. A screen outside the route list is a screen nobody has checked, and this is the evidence |
| 190 | **`is_admin` is its own select-only table, not a column on `profiles`** ([ADR 0039](docs/decisions/0039-the-admin-screen-and-the-word-ban.md)) | The v3 plan asked for the column, and it is decision 180's hole a second time: `profiles` carries a `for all` policy on `auth.uid() = id`, and **RLS is row-level, not column-level**, so `update profiles set is_admin = true` would be accepted — and the account that ran it could broadcast to every user. Recorded rather than quietly fixed because the instinct to put a fact about a user on the user's row produced the same bug twice in one plan |
| 191 | The admin **writes as a signed-in user**, and the service-role key stays out | Every other privileged job is a script (ADR 0037), because a route that reads every user's rows needs the key. Broadcasting is the one case where that shape is wrong — it is a person writing prose with a preview in front of them, and a script would mean composing a message to every user in SQL with no preview at all. So `is_admin()` gates three tables in RLS and the browser holds nothing but the anon key |
| 192 | **`/admin` has no redirect, and the screen is not the permission** | Hiding it from a non-admin is a courtesy; the refusal happens in Postgres. A redirect would make the route answer differently for an admin than for everybody else, which tells an unauthenticated prober that it matters. It answers the same short sentence to everyone who is not one |
| 193 | **"Ban" is a lie in this product**, so the control is "Suspend sync and delivery" | ember works fully with no account (ADR 0031) — local-first ledger, anonymous engine, public methodology and track record — so there is no server-side state whose removal stops somebody using it. A suspension does exactly three things and the panel lists both what it stops and what it cannot touch |
| 194 | A suspension is **enforced in RLS *and* in the sender** | Splitting the three synced tables' policies stops sync. It does not stop delivery: `scripts/send-digests.mjs` authenticates with the service role, so RLS does not apply to it, and a suspension living only in RLS would suspend half of what it names |
| 195 | **The suspended user is told, with the reason** | Their writes are refused by RLS, which on the device is indistinguishable from sync being broken — somebody would reasonably spend a day believing that. The row is readable by its owner precisely so ember can say so, as a standing warning that also names what still works, which for a local-first app is nearly everything |
| 196 | **There is no directory of users**; an account is suspended by pasting its id | A list means an admin-wide select over `profiles` — a blanket read of every user's name and time zone, granted to solve a problem ember does not have. A wrong id is caught by the foreign key, so the database can answer "no such account" without this screen ever being able to ask "which accounts exist" |
| 197 | The composer's preview is **the same `NoticeRow` the inbox renders** | Which is why that component moved out of `notifications-screen.tsx`. An admin about to message every user should see the message as every user will see it. A preview built from lookalike markup is right until one of the two changes, and the change that breaks it will not announce itself — ADR 0012's argument, one screen over |
| 198 | `admin_log` is **append-only, and it is on the screen** | Select and insert policies, no update, no delete: a log an admin can tidy is not a log. Rendered rather than left in the database because an audit trail nobody reads is decoration — the value is that the person about to act can see the last ten. The append is not atomic with the action, deliberately: it is written *after* success, so the possible failure is a missing line rather than a line for something that never happened |
| 199 | **Dismissing a banner is not reading it** | The notice stays in the notification centre, unread, still counted by the badge — closing a banner is "not now, and not here". Dismissals are per id, and they survive Clear, which empties the alert *history*: resetting them together would republish every pinned broadcast ember has ever sent to anybody who tidied their inbox |
| 200 | The banner is **one at a time, above the greeting, and nothing is reserved** | A pin is the loudest thing ember does to somebody who opened the app to look at a balance, so it earns exactly one slot, and it goes above the greeting rather than between it and the balance — the greeting is the app addressing *you* and an announcement dropped into the middle breaks one thought in half. Reserving space for it would cost an empty band at the top of Home on every ordinary day to avoid a settle on the rare one |
| 201 | **The broadcasts query never ran, from phase 19 until the first real broadcast** | `initialData` with no `initialDataUpdatedAt` is stamped as fetched *now*, so a ten-minute `staleTime` made the query fresh on arrival and it refused to fetch on mount — `/api/notices` was never called on a normal page load. Nothing caught it for nine phases because the `notices` table had never had a row: the seeded answer and the real one were identical, so a query that never ran was indistinguishable from one that did. `initialDataUpdatedAt: 0` keeps the first paint and makes it stale immediately |
| 202 | **A broadcast links to a destination from a list, never a typed path** | The first broadcast ever published pointed at `/announcements/first-ever` and every reader who followed it got a 404 from the product telling them something mattered. The only check was `startsWith("/")`, which catches an external URL and nothing else — and nothing in a browser can ask Next.js whether a route resolves, so any regex would only agree with itself. `/api/notices` also drops an unresolvable `href` on the way out, which repairs rows already sent |
| 203 | **A banner's height must not be authored copy** ([ADR 0039](docs/decisions/0039-the-admin-screen-and-the-word-ban.md)) | Reasoning gave "~76px"; measuring gave **0.253 of layout shift on Home** — two and a half times the gate — because the first real broadcast ran to 230 characters and the banner came out ~450px tall on a phone. Title and body are clamped to two lines each, which is the right design anyway: **a pin is a summons, not the message**, and the full text is one tap away in the notification centre where it is not competing with a balance |
| 204 | The notification centre **reads its broadcasts on the server** | Same defect one screen over, and it only appeared once decision 201 was fixed: stored rows arriving a round trip after paint grew the history by two notices mid-page, 0.103 against a gate of 0.1 on a screen that had measured 0.002. The page wrapper reads them so they are in the HTML. The cost is that the route is no longer prerendered, which is cheap for a destination somebody navigates to deliberately |
| 205 | **Shrinking an insert is not the same as removing one**, and the cookie is how you remove it | Clamping took Home from 0.253 to **0.157** — better, still over a gate of 0.1, and no further trimming was going to reach zero while the banner arrived after hydration. Dismissals moved into `ember_pins` so the server can resolve which pin to draw and paint it with the page: **0.0000 measured with a live pin on screen**, and Home's Lighthouse CLS *fell* from 0.092 to 0.041 because the banner absorbs part of the empty-book settle. ADR 0014's pattern, and §9 had been carrying it as the answer for the app's remaining shift since phase 17 |
| 206 | **The admin composer reads `notices` directly, never through the cached route** | Home resolves the banner on every request, so that read is memoised for 30s — which would mean an admin publishing something and watching it not appear, the exact symptom that made this bug so hard to read. Querying the table directly also shows them rows whose `published_at` is in the future, which the public policy correctly hides and the person scheduling them needs to see |
| 207 | **A broadcast has a placement, not a pin** | `pinned` was a boolean and stopped being one the moment there were two kinds of pin. A boolean plus a style column admits "not pinned, as a bar", which is not a state; `placement` — `inbox` / `card` / `bar` — cannot. Neither pin replaces the inbox copy: both are *extra* places to catch somebody who has not opened the bell |
| 208 | **The bar reserves its height with an inline script, not a cookie** | The card banner is resolved server-side against `ember_pins`, and that is not available to something living in the root shell: reading a cookie there makes **every** route dynamic, including 214 prerendered asset pages and the static public argument pages. So the *presence* of a bar is cached in `localStorage` and a blocking inline script sets `--bar-h` before paint. Measured: **0.0000** with a live bar, 40px reserved against 40px of content. The honest cost is one 40px shift on the first load after a bar is published, on that device only |
| 209 | The slot is **`min-height`, not `height`** | The first cut clipped the slot to `--bar-h` with `overflow-hidden`, and the bar was invisible on the very first load — the frame where the hint does not exist yet is exactly the frame the bar needs to appear in. The reservation is a floor; the content sets the height. Found by rendering one, not by review |
| 210 | The whole bar is the link, and the action label is **desktop-only** | Built the other way round the label was `shrink-0` and ate the width at 375px, truncating "Announcements can now reach every screen" to "Announcements c…" — the message losing to the button pointing at it. Now the title takes what is left and the tap target is the full width of a phone |
| 211 | **`0007` leaves `pinned` in place and the reader falls back to it** | Dropping the column would break any deployment still running the previous build the moment the migration lands, and reading a missing `placement` as `inbox` would silently un-pin every live banner mid-deploy. A pinned row was pinned *as a card*, because a card was the only pin that existed |
| 212 | **A settings tab had grown back into the thing tabs were meant to fix** | Decision 109 split settings because one column was ~2,400px on a phone. Measured 2026-08-18, the Account tab alone was **4,512px on desktop**: the page title, then an eyebrow repeating it verbatim, then a row label, then a two-line paragraph — four text blocks before the first control — and a Sign in CTA duplicated 1,800px further down. It is **3,133px** now, and the eyebrow, the duplicate CTA and the essays are gone |
| 213 | **`max-w-prose` is not a measure, it is 65ch** | Which at `text-caption` measures **666px** — about 85 characters a line, well past the 60–70 a reader tracks. Every setting description used it, which is a large part of why the pane read as a wall. 48ch, ~490px |
| 214 | The first block on a settings tab **has no header** | The tab title is its header. `ACCOUNT · optional, and off by default` sat 60px under a page title reading `Account`, which is the same word twice and one more thing to read before reaching a control |
| 215 | The side panel is **`100dvh` minus the bar**, not `100dvh` | It is a sibling *below* the announcement slot, so a full-viewport height pushed its footer — the profile control and the theme toggle — off the bottom of the screen the moment a bar was published. The column inside already adapted; the container did not |
| 216 | **Plan and Admin are their own settings tabs** | Account was carrying a sign-in row, a four-row plan table with its own comparison modal, three name fields, two location fields and an email row. Plan is a subject, not a footnote to identity, and Admin is a different job entirely. Admin renders only for an account with an `admins` row — a courtesy, not a permission, since RLS refuses every control inside regardless (ADR 0039) |
| 217 | Settings tabs are **underlined, not pilled** | The pill was borrowed from the main navigation (decision 035), where it is right because the nav is the only thing on its own surface. Eight filled capsules across the top of a settings pane read as eight buttons competing with the content. A hairline under the whole row with the active segment lit says "these are views of one thing" — and the main nav keeping its pill is what makes the two legible as different kinds of navigation |
| 218 | **`/admin` redirects to `/settings?tab=admin`** | It was a route for one phase. The redirect answers everybody identically, which is the property ADR 0039 wanted from the route in the first place — nothing in the reply tells a prober whether the caller is an admin — and a non-admin landing on `?tab=admin` simply gets Account, because the tab is not one of theirs |
| 219 | **Two push tests, because two different things break** | The in-app button draws a notification through the service worker and never touches the network: it proves permission, the worker and the OS. `npm run push:test` signs a payload with the VAPID private key and posts it to the push service, which is the part involving a stored subscription, a key pair and an endpoint that can expire. A single "test passed" covering only the first half would be worse than no test, and the copy on the button says which half it is |
| 220 | The push test **ignores the delivery floor and the plan caps** | Both are correct for a digest and wrong for a diagnostic. A test that silently stands down because you ran it twice teaches you nothing about why push is not arriving |
| 221 | **A constant a server component needs cannot live in a `"use client"` file** | `BAR_HINT_KEY` did, so the server component emitting the pre-paint script imported a *client reference* rather than the string and shipped `localStorage.getItem(undefined)`. It never matched, the reservation never applied, and the bar shifted the page on every load exactly as if the mechanism were absent. Nothing failed; the gate simply reported an unmoved 0.123. It lives in `lib/notifications/pinned.ts` now, which both sides can read |
| 222 | **The reservation is held until the answer is real, not until the first render** | `useBroadcasts` starts with the release notes compiled into the build and none of them is a bar, so acting on that seed made every load reserve 40px, immediately collapse it, and then put it back when the fetch landed — two shifts from the mechanism that exists to prevent one. Gated on `isFetched`. The cost is an empty band for the length of one request, on a device that has seen a bar before, exactly where the bar is about to be |
| 223 | **`allowedDevOrigins` is derived from this machine's own interfaces**, never written down | Next 16 refuses `/_next/*` to any origin that is not localhost, with a bare 403 and nothing in the terminal — so a phone on the same wifi got the server-rendered HTML and **every chunk 403'd**. Measured: eleven blocked chunks. Nothing hydrates, so the app looks alive and every control is dead, and on `/onboarding` the symptom is "stuck on the splash" because the splash *is* the prerendered fallback (decision 094). A hard-coded `192.168.x.x` is wrong the next time the router hands out a lease, and wrong in a way whose symptom is a blank-looking app; `os.networkInterfaces()` cannot go stale. `EMBER_DEV_ORIGINS` adds a tunnel hostname |
| 224 | **`DataSourceChip` was failing hydration on every screen in the app** | Found while verifying decision 223, and it is the more serious of the two. Every caller passes `instrumentsQuery.data?.synthetic ?? true`; the server has no data so it always rendered `Generated prices`, and on a live feed the client's copy of that query resolves in **4ms warm** — regularly before React 19's asynchronous hydration reaches the header. React found `Live prices` where the HTML said `Generated prices` and **regenerated the whole tree on the client**, which means every handler in the app attaches late. That is what "the buttons don't work" looks like from outside, and why it read as intermittent: it is a race between a cached API response and the hydration pass, which a fast phone loses more often than a laptop. The chip renders the server's answer until `useHydrated()` — decision 017's rule, applied to a value nobody had noticed the server could not know. **It appeared in none of the 64 page audits**, because axe measures the settled DOM and a regenerated tree settles correctly |
| 225 | The mobile **FAB is a header action moved, never a second one** | A page header is at the top of a scroller and leaves the screen within one flick; the thumb that would press it is at the other end of the phone. So `Log trade` is a FAB below `md` and the header button is `hidden md:inline-flex` — one control, two presentations. Two live copies would be decision 212's duplicate CTA in a different costume. It hides on the same scroll signal as the bottom nav, because a FAB that stays while the bar under it slides away reads as something that came loose, and its geometry is derived from the nav's rather than a `bottom-24` that silently stops matching |
| 226 | Wrapping is **two base rules, and `break-word` not `anywhere`** | An email, a URL and a wallet address are single unbreakable words, and the default answer to one that does not fit is to overflow — which this app fails a build over (320→1920). `anywhere` would fix it and quietly break something else: it lets the browser count the broken token when measuring *intrinsic* width, collapsing flex and grid columns sized to their content. `break-word` breaks only when the alternative is overflow. Separately, `text-pretty` on prose is what stops a paragraph ending on one orphaned word — which is the version of "it wrapped for no reason" a reader actually notices |
| 227 | The rail's Pro card is the **one upsell not tied to a limit**, and it is in chrome for that reason | ADR 0038's rule is "at most one per screen, and only where a limit actually bit", and this deliberately sits outside it. The argument that makes it defensible is that the rail is not a screen: it interrupts nothing, it sits where accounts already live, and it says the same sentence on the first day and the thousandth. What it does not get is the pattern's usual costume — no black slab, no crown, no `Upgrade plan` button, because **there is no checkout** and a button labelled Upgrade that opens an explainer is a dark pattern in miniature. It says `What Pro includes`, and it is absent on Pro, absent before hydration and absent on the collapsed rail |
| 228 | Sign out is a **`control`, not `children`** | As a child it dropped into its own full-width band *below* the address at every width, so a 600px settings pane spent three stacked rows on a label, a short email and a 96px button with the right two thirds empty. As a control it sits beside the address where there is room and beneath it on a phone, which is what `SettingRow`'s `responsive` layout is for — and the row's text carries `min-w-0` while the control carries `shrink-0`, so the concession order is right: a sentence can take another line, `Sign out` cannot |
| 229 | **Push had a state that hung the control instead of refusing it** | `subscribeToPush` awaited `navigator.serviceWorker.ready`, and with nothing registered that promise does not reject — it **never settles**. The caller's `finally` never ran, `pushBusy` stayed true, and the switch was left permanently disabled behind a not-allowed cursor with no toast, no error and no console line. Reported exactly as "the cursor changes to the stop icon and does nothing", which is the worst shape a failure can take: a control that looks broken rather than unavailable. Guarded by `getRegistration()` *before* `ready` — and before the permission prompt, because browsers do not offer a second one and spending it on a subscription that cannot be created wastes the only chance ember has to ask |
| 230 | **"Unavailable" was three different answers wearing one word** | No `PushManager` at all, an insecure origin, and a missing service worker are not the same news — the middle one is fixable in thirty seconds and the reader was being told it was not. `insecure` and `no-worker` are their own states with their own sentences, each naming the fix rather than the rule ("open ember over https://", not "requires a secure context"). Decision 046's rule — `denied` is a state with its own copy — applied to the states nobody wrote copy for, **which are precisely the states only a developer ever sees.** That is how they went three phases unnoticed |
| 231 | The **service worker can register in `next dev`, behind a flag** | It is skipped outside production because a cached shell makes hot reload lie, and that default is right — but push needs a registered worker, so it also made push impossible to try without `build && start`, which is the one configuration you cannot edit in. `NEXT_PUBLIC_EMBER_SW_IN_DEV=1` opts in and hands the cache problem back to whoever asked for it. A `NEXT_PUBLIC_` flag on purpose: the expression is replaced with a literal, so the branch is gone from any production bundle that does not set it |
| 232 | **A never-settling promise is tested by stubbing one** | `push.test.ts` gives `serviceWorker.ready` a promise that never resolves. If decision 229's guard is ever removed the test does not fail an assertion — it **hangs**, which is the defect itself, reproduced, with a two-second timeout so it reads as a failure rather than a slow suite. The only honest way to test the absence of a hang |
| 233 | **A device's data belongs to one account, and a different one is asked, not merged** | Sign-out deliberately keeps the ledger (ADR 0031) and nothing recorded whose it was, so the next account to sign in on the same device reconciled it like any local change — every trade uploaded into the second account, the first person's name with them, on every device the second person owns. `lib/sync/owner.ts` records the account; a different one holds sync and the Account tab asks: *use this account's data* or *add it to this account*. Replacing drops the device's book only **after** the account's rows have been read, so a replace that fails on the network has not already thrown anything away, and ownership is claimed only once every document landed. Reset everything and deleting an account with its local copy clear the owner, since there is then nothing to protect |
| 234 | **A sample book never syncs** | ADR 0008's label is a local flag, so uploading the sample put fabricated trades into a real account and every other device pulled them as ordinary rows. Worse, the post-sync write-back called `replaceAll(…, false)`, which cleared the flag *on this device too*. Skipped in both directions — pulling a real ledger into a sample book produces a book that is neither — until the user logs a trade of their own, which already clears the flag |
| 235 | **Applying synced data is not editing it** | The ledger write-back went through `replaceAll`, which re-stamps every row as edited now (right for undo, whose restored state must win). So a device that merely *pulled* a trade stamped it newer than the edit it pulled, pushed it back, and a genuinely later edit made offline elsewhere lost to that reflection. The single-row documents had the same fault through `stampOnChange`. `applySynced` writes rows as settled, and a pulled document's stamp is set to the server's `updated_at` |
| 236 | **Whether prices are generated is read from the layout, not from a query** | Every screen took `someQuery.data?.synthetic ?? true`. That was the app-wide hydration failure in decision 224, and on a live build it was also a false disclosure: "Generated prices" until the query landed — eight seconds cold on Signals, the screen people act from, and a standing "Prices are generated" warning in the inbox. It is `EMBER_DATA_PROVIDER` plus two keys, fixed for the process, so the root layout computes it (`servesGeneratedData()`) and `useSynthetic()` hands it down. Supersedes decision 224's hydration gate |
| 237 | **`profiles` stamps like every other synced table** | 0001 kept an arrival-time trigger on `profiles` because nothing merged it; phase 20 started merging it through `pickNewer` and the trigger stayed, so a device that synced late always won however old its edit — decision 103's failure on the one table still exposed to it. The client sends `updated_at`; `0008` drops the trigger |
| 238 | **One sync runner** | `useSync()` was also called by the Account row to read its status, and a hook that syncs does so wherever it is called — two runners with two run guards reconciled the same ledger at once on the settings screen, which is how an older pull lands over a newer one. `AppShell` runs it; `useSyncStatus()` reads `use-sync-state` |
| 239 | **A plan is answered only for the account it was read for** | `usePlan` held a bare `Plan` and never cleared it, and the signed-out branch returned `entitled ?? "free"` — so signing out of Pro left Pro on until reload, and a second account inherited the first's plan for the length of its own read, reported as `ready`. Keyed by user id now. The findings inbox also waits for `ready`: without it a Pro reader saw the free cap and an upsell, then the rest of their list pushed the page down |
| 240 | **A push subscription and its row fail together** | A failed write returned `"off"` and left the browser subscribed, and `pushState()` reads the browser — so the switch showed on for a device the server had never recorded. `subscribeToPush` now unsubscribes before reporting; `pushState` re-records a subscribed browser on each visit, repairing a missing row. `togglePush` had no `catch` and was fired with `void`, so a refused `pushManager.subscribe` said nothing; it toasts the reason. And the row opens on "Checking…" rather than "This browser doesn't support push" |
| 241 | **The edge session refresh is bounded and skipped without a session** | `getUser()` is a Supabase round trip on every navigation by a signed-in reader (757ms measured in development), and a paused project hangs rather than refusing — undoing ADR 0031 for everybody who had signed in. Now skipped when no `sb-*-auth-token` cookie exists and raced against 1.5s. The first-run redirect also dropped the refreshed cookies it had just computed; they are copied onto it |
| 242 | **"Answered", not "fetched"** | `isFetched` is true after a *failure* too, when `data` is still the compiled release notes — so one failed `/api/notices` made the notification centre discard the stored rows the server had rendered, and the bar collapse its slot and forget its hint. `useBroadcasts` exposes `answered` (`dataUpdatedAt > 0`, meaningful because `initialDataUpdatedAt` is 0) and returns only `data` and `answered`, since spreading a query result subscribes to every field |
| 243 | **The announcement bar is sticky** | It scrolled away while the side panel stayed sticky at `100dvh − 40px`, so decision 215's fix was right at the top of the page and left a 40px strip under the panel's footer everywhere else. The panel could be right at one scroll position, never both. A bar is for outages and is dismissible, so staying put while it exists is the behaviour to want; the panel, the page header and the two `lg:sticky` asides offset by `--bar-h`. Measured with a bar live: panel and header at 40px, flush to the viewport bottom, identical at the top and 1,500px down |
| 244 | **Horizons and counts are never literals in copy** | Five places said "three days" or "72-hour" a phase after crypto's horizon became 36 hours, and two said "Ten strategies" when there are sixteen — while `describeSpan` sat private in `window.ts`, where no component could reach it. It lives in `lib/market/format.ts` beside `describeHorizon(window)`; the methodology page reads `horizonHours` from `/api/strategies`; onboarding and settings describe the kind. `horizon-copy.test.ts` fails on the phrasings, and was checked to catch one reintroduced |
| 245 | **Developer instructions are gated to development** | The push row named `npm run dev:https` and `NEXT_PUBLIC_EMBER_SW_IN_DEV` to anyone whose worker failed to register, which in production is a real reader in a private window being told to edit a config file |
| 246 | **The settings tab row scrolls to the active tab and fades where it continues** | Ten tabs do not fit a phone, so `?tab=about` or the `/admin` redirect landed with the active tab off-screen and nothing looking selected. Scrolled by hand rather than with `scrollIntoView`, which also scrolls the page. The edge fade is written to a data attribute rather than state — it changes on every scroll event and only CSS reads it |
| 247 | **Smaller corrections found in the same audit** | The rail card and the Plan tab opened a modal titled "See every finding" (the interstitial now takes an optional feature and titles itself "What Pro includes"). The FAB rendered disabled at 50% for up to eight seconds while instruments loaded; it now appears when it can act. A release notice's only action linked to the page it is read on. The Account row read "Account" under a tab titled Account while checking. Every sign-in surface said sync stores "your ledger, risk profile and watchlist — nothing else" while it also stores names, country, time zone and the full settings blob; five places corrected |
| 248 | **In development the service worker caches nothing** | Decision 231 let the worker register in `next dev` so push could be tried, and it brought its caching with it. `/_next/static/` is cache-first, which is sound only because a production build content-hashes every filename; the dev server rebuilds `[root-of-the-server]__….css` under one name all day. So the worker pinned a morning's stylesheet in the user's Chrome and served it through every later edit — the `top-[var(--bar-h,0px)]` class from decision 243 never reached the page, `top` computed to `auto`, and the side panel scrolled away. No error anywhere, and **the in-app browser could not reproduce it because it never registers a worker**; it was found by measuring the user's own Chrome through the extension (54 stale entries in `ember-v1-shell`). Development now registers `/sw.js?mode=dev`: no fetch handling, no install-time caching, and activation deletes every cache, so the worker exists only for push and notification clicks. Production is unchanged |
| 249 | **The news pool dedupes by id as well as by headline, and fresh rows win** | The merge in `finnhub.news()` collapsed syndicated copies by normalised headline only, with the stored pool first. Finnhub re-issues a story under the *same* id with an edited headline, so both versions survived — measured at **14 duplicate ids in 200**, which React reported as duplicate keys on the News list, where it may drop or double a row. Rows are now skipped on a repeated id, and the fresh fetch is merged before `previous` so the edited copy replaces the stored one rather than losing to it |

---

## 7. Ruled out — do not relitigate

| Rejected | Why |
|---|---|
| Wise's actual visual language (forest + acid green) | User clarified Wise is a **UX** reference only, not a visual one |
| Tailwind default gray ramps | Loudest AI-built tell; we use a custom warm ramp |
| Candlestick charts, red/green fills | Casino signalling; brief rules out that feeling |
| Mono numerals for prices | Reads as a themed template; Archivo tabular figures instead |
| Stock-to-flow (crypto) | Broke badly out of sample; not defensible |
| Sentiment scraping, chart patterns without statistical support | Not citable, not verifiable |
| Confidence donuts / gauge rings | Category cliché, low information density |
| Hardcoded track-record numbers | The entire point is that the record is computed and honest |
| `next-pwa` | Unreliable on recent Next majors; hand-rolled manifest + SW instead |
| Storing a separate holdings table | Desynchronises from transactions |
| Stripe for subscriptions | **No payouts to Nigeria.** Merchant-of-record (Paddle / Polar / Lemon Squeezy) is the realistic route, and absorbs VAT compliance. Paystack/Flutterwave for local. Settle before the billing phase. |
| Vercel Hobby at launch | Hobby forbids commercial use — migrate to Cloudflare Workers or Vercel Pro before charging |
| **Yahoo's chart endpoint, once ember charges** | It is the equity price history today and it is undocumented and unlicensed for programmatic use. Fine for a personal build, not fine in a paid product. Replace with a licensed feed — Finnhub's paid tier, Polygon or Tiingo — and it is one file (`providers/live/yahoo.ts`). **Third item on the pre-revenue list, beside Stripe and Vercel Hobby.** ADR 0033 |
| Finnhub `/stock/metric` for fundamentals | 133 ready-made ratios, a tenth of the code, and rejected: a P/E ember didn't calculate is one it can't show its working for. Filed statements from `/stock/financials-reported` instead |
| Falling back to generated data when a live source fails | A real quote over a modelled price path is indistinguishable from the honest version, which makes it the worst thing this app could render. A failed instrument is simply absent |
| **Listing NGX with prices and no view, permanently** | Considered and rejected in favour of collecting. A venue that can never be assessed is a second-class row that stays second class, and the one exchange the author's own currency trades on is the wrong place to accept that. Ten months of waiting is worse than nothing only if nothing is the alternative — it is not, the collector runs today |
| **Sniffing Yahoo's `currency` field to decide the minor-unit divisor** | `GBp` versus `GBP` is evidence *for* the divisor, not a thing to branch on. Read from the exchange, a venue that changed its convention is caught by a test; sniffed at runtime, it silently changes every price |
| **Splitting crypto's OHLC refinement onto the asset page** | Planned for phase 22 as a way to halve cold crypto cost, and abandoned once written down: the range refinement feeds ATR, ATR sets every stop, so the feed and the asset page would show *different stops for the same instrument*. Two screens contradicting each other is worse than a slow cold start, and the load deadline solved the actual problem instead. Crypto still costs two CoinGecko calls per coin |
| **An FX rule on real-yield deviations** | Planned for phase 24 and abandoned once written down. Real yield needs a CPI series; nothing free serves one, and Finnhub's economic calendar is 403. Inventing an inflation number to complete the formula is exactly what §5 forbids — the output would look as calculated as a real one. Currency momentum (Menkhoff et al. 2012) uses only the spot path and the policy rates ember already has, and measures −0.07 against `fx-carry`. Decision 161 |
| **Sector-*neutral* momentum** | Considered as the "sector-relative variant of `xs-momentum`" the plan named, and rejected: ranking a name within its own sector removes the industry effect, which is the thing Moskowitz & Grinblatt found. Industry momentum scores the sector instead |
| **Raising `CONTEXT_BARS` so residual momentum gets a longer estimation window** | It would help — Blitz et al. get a 3× ratio of estimation to measurement window where ember gets 1.8×, so the signal arrives attenuated. And it would let a live evaluation see more history than a backtest evaluation at the same bar, which is the one gap that would stop the track record describing the live engine. The attenuation is documented instead |
| **Correlation-aware ensemble weighting, in this phase** | The right fix for the 0.88–0.94 cluster among the three long-horizon return rules, and far too large to fold into a phase about adding rules — it changes every number in the app. Recorded in §8 with a guard test that stops the cluster growing |
| **A risk-profile horizon axis** | Built in phase 25 exactly as planned and removed after measuring: it filtered nothing (17→17, 78→78, 143→143), because a fast rule cannot lead a call in a sixteen-rule blend when its own confidence is capped. Machinery for a case that does not arise. Revisit only if the *blend* changes so a fast rule can lead — which is a question about weighting, not about profiles. ADR 0036 |
| **Narrowing the window by shortening the half-life** | The elegant version of dissent-narrows-the-window, measured to move no boundary by a single hour: the blended half-life is 24–75 days, so the decay term across the horizon varies 0.92–0.96 against a liquidity term spanning 0→1. Dissent raises the window threshold instead |
| **A tighter window threshold for crypto** | At zero dissent crypto's window fills its whole 36-hour horizon, which is a weak claim. Rejected anyway: the threshold means one thing — "at least half as good as the best moment" — and crypto's window is wide because crypto has no bad hour to exclude, not because the model is failing. The crest is carried by `peakAt` and the band's intensity ramp, which is what the ramp is for. Recalibrating the signature component across the app to tidy one market's number is the wrong trade |
| **An authenticated cron route for delivery** | What the plan asked for. Any route that can read every user's watchlist needs the service-role key, so a shared secret in front of it is not the same as not having the key. Scripts instead, and possession of the key is the authentication. ADR 0037 |
| **Vercel cron or Supabase `pg_cron`** | Both tie the schedule to infrastructure §7 says has to change. A GitHub Actions workflow moves with the repository |
| **A tracking pixel in the digest** | Never. A mail that phones home about whether you opened it is not this product's register, and the one thing an ad-free finance app has is that it isn't watching you |
| **Storing the risk profile on the push subscription** | Would save the sender a read of `preferences` and put the profile in two places, where only one of them syncs. It would go stale the first time someone changed it on another device |
| **A watchlist size cap on the free plan** | Listed in the v3 plan and rejected: no cost behind it, and incoherent with decision 023's "following everything" sentinel. Decision 182 |
| **Capping how many markets a free user can watch** | Same objection — no marginal cost, and it makes the product worse in a way that teaches nothing about what Pro is for |
| **Gating the per-strategy breakdown on the track record** | Looks "advanced", is evidence about whether ember works. That category cannot be sold |
| **Degrading free confidence, or widening free windows** | Two engines is two products, and telling a user something ember does not believe in order to sell them something is disqualifying |
| **A blurred countdown showing what Pro users did** | The phase 14–16 review's suggestion, permanently out. Manufactured anxiety pointed at ember's own users |
| **A "join the waitlist" email field on the upsell** | There is no checkout and nothing to do with an address yet. Collecting one would be doing something with it |
| **Server-side pagination for `/api/news`** | Would require the "Yours" filter to move server-side, which means sending a user's held and watched symbols to a route that has no business knowing them. Client-side paging keeps the filter correct and the route ignorant. Decision 137 |
| **`is_admin` as a column on `profiles`** | What the v3 plan asked for, and it is a self-grantable administrator flag: `profiles` has a `for all` policy on `auth.uid() = id` and RLS is row-level, not column-level. The account that ran `update profiles set is_admin = true` could then broadcast to every user. Decision 190, and it is decision 180's hole a second time in one plan |
| **An admin-wide select policy over `profiles`** | The obvious way to list accounts so an admin can pick one to suspend. It is the largest privacy grant in the schema — every user's name and time zone — bought for a nicer form field. Suspension takes a pasted uuid instead, and a wrong one is caught by the foreign key |
| **The word "Ban" anywhere in the admin screen** | ember works fully with no account, so nothing in the schema stops somebody using it. A control labelled Ban that cannot ban is worse than an honest one; it is "Suspend sync and delivery", and the panel lists what it cannot touch beside what it can |
| **An authenticated cron route or a service-role key for the admin screen** | ADR 0037's argument, one screen over, and stronger here: the thing being protected is the ability to message every user, and a shared secret in front of the service-role key is not the same as not having it. RLS gates it and the browser holds the ordinary anon key |
| **A drafts table and a scheduling control for broadcasts** | `published_at` defaults to `now()` and the select policy already admits only rows whose timestamp has passed, so a scheduled broadcast is a row rather than a job. A drafts table is a second thing to maintain for a screen with one user, and withdrawing — one press, immediate — is the affordance that actually matters |
| **An undo on withdrawing a broadcast** | Everywhere else an undo beats a dialog (ADR 0015). Here it would misdescribe what happened: whoever had the app open has already read it, and putting the row back does not unsend it. The toast says that instead |
| **Reserving space for the pinned banner** | A pin is rare by design. Holding an empty band at the top of Home on every ordinary day, to avoid a settle on the rare one, is a worse trade every single time |

---

## 8. Known gaps — be honest about these

*(Maintain rigorously. Anything mocked, stubbed, or knowingly incomplete goes here the moment it's introduced.)*

- **Every screen is real; nothing links to a stub.**
- **Plans exist, and there is no checkout.** `lib/plan.ts` is the only place a gate
  is decided, `entitlements` is a select-only table, and every account is `free`
  because the only way a Pro row lands today is somebody typing it into the
  Supabase dashboard. That is the intended state: phase 27 built the gate, not the
  till. §7's three pre-revenue blockers are unresolved — no merchant of record with
  Nigerian payouts, a host that forbids commercial use, and an unlicensed price
  feed — and the upsell says so plainly rather than offering a waitlist.
- **The free findings cap is the one gate a reader will feel, and it has the weakest
  cost argument.** Email and push cost ember a quota per send; showing a fourth
  finding costs nothing. It is included on the "more of the same" ground and it is
  worth revisiting with real users: if the top three turn out to be all anyone
  reads, the cap is selling nothing and should go.
- **A sponsor row has no impression or click tracking, so ember cannot tell a
  sponsor how many people saw it.** That will be a commercial problem the first time
  somebody asks. The answer is aggregate server-side counting, not a pixel, and it
  needs designing rather than reaching for — recorded rather than solved, because
  the pixel is the ten-minute version and it is the one thing ADR 0038 rules out.
- **`/admin` has now run, and using it once found three defects nothing else
  would have.** `0006` is applied, two broadcasts have been published by a real
  admin and the log has lines in it. What that first use exposed: the broadcasts
  query had never fetched since phase 19 (decision 201), the composer shipped a
  404 to every reader (decision 202), and the banner's height was authored copy
  worth 0.253 of layout shift (decision 203). **All three were invisible to 64
  page audits, 62 screenshots and 362 tests**, because every one of them needed a
  row in a table the gate cannot write. The composer, the suspension panel and the
  log are still unseen by every machine check — the gate reaches only the sentence
  `/admin` gives a stranger.
- **The banner costs zero layout shift, and getting there took the cookie §9 has
  been carrying since phase 17.** The reasoned figure was "~76px"; the first real
  broadcast measured **0.253 on Home**, because the body was 230 characters of
  authored copy and nothing clamped it. Clamping to two lines took it to 0.157 —
  still over the gate, and the lesson: the size of the insert was never the
  problem, the insert was. Dismissals mirror into `ember_pins` now (ADR 0014's
  pattern, `lib/notifications/pinned.ts`), the server resolves which pin to draw,
  and it arrives in the HTML. Measured in the browser with a live pin on screen:
  **0.0000**, and Home's Lighthouse CLS *fell* from 0.092 to 0.041 because the
  banner absorbs part of the empty-book settle. **The cost is that `/` is no
  longer prerendered** — it reads a cookie — and a 30s module-scope memo keeps the
  notices read off the critical path.
- **The cookie can fail, and then the old behaviour returns for that reader
  alone.** `document.cookie =` is a silent no-op under restricted storage, so the
  server draws a banner that device already closed and the client removes it at
  hydration. The store is still the source of truth; the cookie is a cache of it,
  exactly as `ember_onboarded` is a cache of `hasOnboarded`.
- **The dismissal cookie is capped at twelve ids.** It rides on every request to
  the origin, so an unbounded list would be permanent upload. Dropping the oldest
  can only re-show a banner from long ago, and the store — uncapped — filters it
  out at hydration.
- **`next dev` could not serve a phone on the same wifi, and the symptom was a
  dead app rather than an error.** Next 16 refuses `/_next/*` to non-localhost
  origins with a 403; measured on the LAN address, eleven chunks blocked, so the
  server HTML arrived and nothing hydrated. `allowedDevOrigins` is now derived
  from `os.networkInterfaces()` (decision 223). **This was one of two causes of
  "the buttons don't work on my phone"** — a report §8 has carried since phase 18
  as *could not be reproduced*, because every attempt to reproduce it was made
  over localhost, which was never affected.
- **The other cause was `DataSourceChip`, and it was app-wide.** It failed
  hydration on every screen with a header, so React regenerated the whole tree
  client-side and every handler attached late (decision 224). Fixed and verified
  in the browser: the Next devtools issue count goes from 1 to 0 on Home,
  Portfolio and Settings. **The phase-18 entry below is now superseded** — the
  onboarding controls were never the problem, and the sticky bar removed in
  decision 098 was a reasonable fix for something that was not broken.
- **Neither of those two defects was visible to any machine check in this
  repository**, and that is the part worth keeping. The gate builds a production
  bundle and drives it over localhost, so the dev-origin refusal is outside what
  it can see by construction; and axe measures a settled DOM, which a regenerated
  tree reaches correctly — it is only *late*. **Nothing here measures time to
  interactive, or asserts that hydration succeeded.** A check that fails the build
  on a hydration error would have caught the second one on the day it landed, and
  it does not exist. That is the largest gap in the gate right now.
- **`npm run verify` now reads the live `notices` table, and that makes it less
  reproducible than decision 126 intended.** The provider is pinned to generated
  data so prices cannot move the numbers; Supabase is not pinned, so a row
  somebody adds to `notices` changes Home's screenshots and its layout shift, and
  a pinned broadcast can fail the build. That is how the 0.253 above was caught,
  which is an argument for leaving it — but it means two runs on different days
  are not necessarily comparable. Isolating it is a decision to take deliberately,
  the same shape as decision 126, and it is on the §9 list rather than patched.
- **The bar has never rendered from a real broadcast, and the gate cannot make
  it.** Verified by hand against a temporary `bar` release notice: it renders on
  every screen above the chrome, reserves 40px against 40px of content, measures
  **0.0000** on a second load, and collapses cleanly on dismissal. What the gate
  sees is a fresh browser with no `localStorage`, so even with a live bar it would
  measure the *first-load* case — the one 40px shift — rather than the steady
  state. Same class of gap as the upsell interstitial and the command menu: a
  piece of the app a route list cannot reach.
- **The Supabase project paused after a week idle and was restored on
  2026-09-28.** While it was down its hostname stopped resolving, and the app
  degraded exactly as ADR 0031 intended — release notes only, everybody free, the
  ledger local. Probed after restoring: `notices.placement` answers, so **`0007` is
  applied**, and anonymous reads of `profiles` and `admins` still return `[]`.
  **`0008` is applied**, run through the dashboard's SQL editor (no database
  credential exists on this machine) and verified on 2026-09-29 by writing a
  profile's own `updated_at` back unchanged with the service role: it came back
  byte-identical, where the trigger would have replaced it with `now()`. A free project
  that sits idle will pause again; anything scheduled against it (§9 item 2) is
  also what keeps it awake.
- **A suspension is enforced in two places and observed in neither.** RLS stops
  the writes; `send-digests.mjs` drops the recipient, because it holds the service
  role and RLS does not apply to it. Both are code, both need `0006` and a real
  account, and nothing in the gate can drive either.
- **`useSuspension` costs a read per page for a signed-in user.** One primary-key
  lookup wherever the bell renders, degrading to "not suspended" when the table
  does not exist. It buys the ability to say *why* sync stopped instead of letting
  it look broken, which is worth one row — but it is a cost and it is real.
- **`/admin` is audited and captured but not measured for layout shift.**
  `perf.mjs` walks a shorter list of fourteen routes and phase 28 did not extend
  it, because the screen the gate can reach is four lines of static text with
  nothing to shift. The composer — a form, a live preview and two lists that
  arrive from three separate queries — is the part that would need measuring, and
  it is exactly the part no machine here can open.
- **A new screen must be added to `audit.mjs` and `capture.mjs` in the same commit,
  and phase 27 is why.** `/unsubscribe` shipped in phase 26 outside both lists and
  was consequently unchecked; the first audit that included it reported twelve
  violations, then four, before passing. Both were real — a duplicated `main`
  landmark and a skip link pointing at an element that did not exist. Neither was
  visible in review.
- **The upsell interstitial has no accessibility check.** `audit.mjs` audits page
  loads, and that modal only opens on a deliberate press — so like the command menu
  before it (decision 052), it is a piece of the app a route list can never reach.
  `capture.mjs` was extended once to drive the command menu; the same treatment
  would cover this. Until then the chip, the card and the sponsor row *are* audited,
  because they render inline, and only the modal is unseen.
- **The client bundle carries no third-party origin, measured.** Every remote host
  in `.next/static` is `supabase.com` plus the project URL, and four documentation
  links Next.js and React compile in (`nextjs.org`, `react.dev`, `github.com`,
  `w3.org`). No ad network, no analytics, no tag manager, no pixel — searched for
  Google Tag Manager, Analytics, DoubleClick, AdSense, Facebook, Segment, Mixpanel,
  Amplitude, Hotjar, Plausible and PostHog. The one hit was React's own
  `onDoubleClick` handler. Same sweep confirms no Finnhub or CoinGecko key, no
  service-role key, no VAPID private key, no Resend key, and no engine internals
  (`piotroski`, `BETA_SHRINK`, `residualMomentumOf` — 0 files each).
- **Nothing has been sold, and no sponsor row has ever rendered.** `0005` *is*
  applied — corrected by probing, see the migration entry below — and both
  `entitlements` and `sponsors` return `[]`. Every account is therefore free
  because nobody has typed a row in, which is the intended state rather than a
  missing table. The upsell components and the gate are exercised only by the free
  path.
- **The engine is sixteen rules across eight families.** Thirteen apply to
  equities (eleven internationally, since Piotroski and the Magic Formula have no
  accounts to read), nine to crypto, five to FX. Every one carries a
  peer-reviewed or published source, and the methodology page is derived from the
  registry rather than transcribed (ADR 0012), so it cannot drift from that list.
- **Three of those sixteen are near-collinear, and it is measured rather than
  suspected.** `ts-momentum`, `xs-momentum` and `dual-momentum` correlate at
  0.88–0.94 across the equity universe, because all three are transforms of one
  trailing twelve-month return. Since `assess()` raises blended confidence when
  rules agree, part of the agreement those three supply is arithmetic rather than
  evidence — sixteen rules is not sixteen opinions. `collinearity.test.ts` prints
  the whole matrix, fails outright at 0.98, and holds the three pairs above 0.85
  as an exact named list so a fourth cannot join quietly. **The fix is
  correlation-aware weighting**, which moves every number in the app and is on the
  §9 list rather than folded into a phase about adding rules. A worse version of
  this defect was live for the engine's whole life: `dual-momentum`'s score was
  character-identical to `ts-momentum`'s and the two measured **1.00** (ADR 0035).
- **Confidence is not comparable across ensemble sizes, and that is a real design
  problem.** `assess()` cuts confidence for disagreement (`1 − dispersion`) and
  for abstention (`coverage` divides by every applicable rule), and both grow with
  the *number* of rules whether or not the new rules are informative. Going from
  ten rules to sixteen moved the whole distribution down — mean 26, median 25,
  maximum 54 — and on the previous floors the Conservative profile surfaced **4 of
  214**, which is not a cautious setting but a broken one. The floors were
  re-derived from the new distribution (37 / 28 / 23, restoring 20 / 77 / 143 of
  214 against 20 / 78 / 136 before). **This is the second time a fixed floor has
  quietly become the only filter** — ADR 0013 was the first — so every future phase
  that adds or removes a rule has to re-measure it until confidence stops
  depending on rule count. That is an ensemble change, and it is in §9.
- **Peers were being compared across different dates until phase 24.**
  `buildContext` cut every peer at the *subject's* array index, with a comment
  asserting that was sound because instruments in one market share a trading-day
  grid. True while all 72 equities were American; false from phase 23, where Yahoo
  returns 1,214 bars for one listing and 1,280 for another — so index 1,254 was
  today for the long series and three months ago for the short one, and every
  cross-sectional rule ranked a Tokyo name's return-to-February against a New York
  name's return-to-today. Nothing failed. Peers are cut by UTC day now, which
  works because all sixteen venues open between 00:00Z and 08:00Z; a venue further
  east than Tokyo would need a real session-date field on the bar.
- **Residual momentum departs from its paper in two stated ways.** Blitz et al.
  regress on Fama–French three factors; ember regresses on one equal-weight
  market, because SMB and HML need book values and market caps that 92 of 164
  listings do not have and a three-factor version would silently be US-only. And
  they estimate over 36 months of monthly data where ember uses its 420-bar daily
  ceiling — a 1.8× ratio of estimation to measurement window against their 3×, so
  the signal arrives attenuated. Raising the ceiling is ruled out in §7: it would
  let a live evaluation see more history than a backtest evaluation at the same
  bar, which is the one gap that would stop the track record describing the live
  engine.
- **The market factor is equal-weight, not capitalisation-weight.** Betting
  against beta and residual momentum both need a market proxy, and ember has no
  share count for 92 of 164 listings — an index weighted by whichever companies
  file with the SEC is a US proxy wearing a global label. Frazzini & Pedersen
  report both weightings.
- **Policy rates are still modelled, and currency momentum now depends on them.**
  The carry term in that rule is `POLICY_RATES`, which is maintained by hand
  because no free API serves central-bank targets. So one of the sixteen rules has
  a modelled input even when `EMBER_DATA_PROVIDER=live`, which is stated on the
  methodology page along with the other three modelled things.
- **The universe is 214 instruments across sixteen venues.** 164 equities (72
  New York, 80 across London, Xetra, Paris, Amsterdam, Milan, Zurich, Tokyo,
  Taipei, Hong Kong, Seoul, Mumbai, Singapore, Johannesburg and Cairo, plus 12
  Lagos), 24 crypto, 14 FX. Every international ticker was probed before it was
  written down — 1,214 to 1,280 daily bars each — and all 164 equities return
  ≥700 bars through the provider.
- **Twelve NGX listings are priced and not assessed, and will be for about ten
  months.** The exchange publishes today's board and no history; ember stores a
  session a day into `ngx_daily` and the engine forms a view at 200. They carry
  `dataState: "collecting"` and both the asset page and the watchlist say which
  silence it is. **The collector has to actually be scheduled** — nothing runs
  it automatically yet, which lands with the cron in phase 26. Until then the
  clock has not started.
- **The NGX endpoint is not reliable.** It answered, then 502'd for several
  minutes mid-session, then recovered — and it 502s outright for any page
  larger than 50 rows. Another argument for storing rather than depending.
- **Fundamentals are US-only: 49 of 72, and 0 of 92 internationally.** Measured,
  not assumed — Finnhub's filings endpoint is EDGAR-derived, so it returns an
  empty array for ASML and 403 for `SAP.DE`. Piotroski and the Magic Formula
  abstain for every international listing, which costs coverage rather than
  confidence (decision 011) and is why phase 24's additions must be price-only.
- **All sixteen currencies are live, including the naira.** The ECB covers
  thirty; TWD, EGP and NGN come from Yahoo. Measured: ₦1,357.32, E£50.15,
  NT$31.81 to the dollar. This closes a §8 entry that stood for two phases —
  and it extends the unlicensed dependency past prices into exchange rates,
  which is recorded in §7 rather than passed over.
- **Live data is on, and it is a mixture — here is exactly which parts.**
  `EMBER_DATA_PROVIDER=live` with both keys present. Measured 2026-08-14 by
  driving a production server:

  | | prices | history | fundamentals | news |
  |---|---|---|---|---|
  | equity, US (72) | Yahoo | Yahoo, ~1,255 bars | Finnhub, filed 10-K | Finnhub |
  | equity, intl (80) | Yahoo | Yahoo, 1,214–1,280 | **none** | Finnhub |
  | equity, NGX (12) | NGX itself | ember's own, collecting | none | Finnhub |
  | crypto (24) | CoinGecko | CoinGecko, 365 bars | — | Finnhub |
  | fx (14) | ECB via Frankfurter | ECB, ~1,282 bars | — | Finnhub |

  **202 of 214 instruments carry a usable history**, the twelve exceptions being
  the NGX rows that are still collecting. `/api/advice` assessed 202 on a warm
  server; `/api/findings` returns real stop breaches and concentration
  warnings. Warm responses are ~3ms.

  Still modelled even when live, and each says so where it appears: **policy
  rates** (no free API serves central-bank targets, and Finnhub's economic
  calendar is 403 — now sixteen currencies of them rather than nine), **the
  macro release calendar** (CPI, FOMC, payrolls — earnings are real, and only
  for US listings), and **a coin's realised capitalisation** (chain-level data
  no free API serves; still a 200-bar EMA of market cap over a real price path
  and a real supply).
- **Crypto history is capped at 365 days and that is an asymmetry, not a
  rounding.** It is CoinGecko's demo-plan ceiling. The engine needs 200 bars of
  warm-up, so a coin has about 165 backtestable days against an equity's 1,050.
  The track record counts what it actually walked, so this shows up as a
  smaller crypto sample rather than as a wrong number.
- **Fundamentals resolve for 49 of 72 equities, and the 23 are the method's own
  scope.** Not a parsing failure. Banks file unclassified balance sheets — no
  `AssetsCurrent`, no `GrossProfit`, no `OperatingIncomeLoss` — so Piotroski
  and the Magic Formula are undefined for them, and Greenblatt excludes
  financials and utilities from the Magic Formula by design. Integrated oil
  reports no gross margin at all. Missing: the twelve financials, NEE, DUK,
  XOM, LIN, NEM, PLD, UPS, MCD, SBUX, ORCL, CMCSA. They abstain, which costs
  coverage rather than confidence (decision 011). **The mock had been
  generating a full balance sheet for JPMorgan**, which is the more troubling
  half of this entry.
- **Equity price history comes from an unlicensed endpoint.** Yahoo's
  `v8/finance/chart`, undocumented, terms do not permit programmatic use. It is
  in §7 as a pre-revenue blocker beside Stripe and Vercel Hobby, isolated to
  `providers/live/yahoo.ts`, and it is the only such dependency. ADR 0033
  records the alternatives that were weighed and why each failed.
- **Historical FX rates are now possible and still not used.** Realised P&L is
  converted at today's rate (see below); Frankfurter serves rates by date, so
  the blocker is no longer the data — it is that `derive.ts` is a pure
  client-side function with no rate history to read. A real piece of work, not
  a flag.
- **`/api/news` costs 1.4 seconds cold, down from 20.** Two general calls
  (general and crypto). Company news is fetched only on a background *refresh*,
  twelve symbols at a time, and **accumulates** into a pool capped at 200 items
  — so the first reader waits for two calls and the pool fills toward full
  coverage behind them over roughly an hour of an open tab. Consequence worth
  knowing: a cold feed is thinner. Measured 62 items with 15 symbol-tagged
  against 188 and 94 once warm.
- **A cold universe load is 8.0 seconds and returns a subset.** It was ~105
  seconds of blocking. `loadUniverse` reports `pending`, both screens say so,
  and both queries poll until it clears — measured converging to 94 of 110
  within 25 seconds. `npm run warm` fills it ahead of a reader if you would
  rather. **Zero on generated data**, so none of this affects the gate.
- **The disk cache is the local answer, not the deployed one.** `.cache/market/`
  survives a restart, which is what makes a cold start survivable against these
  quotas. On a serverless platform it is inert — a fresh container has no
  `.cache/` — and the memory tier still works per instance. ADR 0008 names
  Upstash; swapping it in is `cache.ts` and nothing else.
- **When live, news is real — this entry describes the generated path, which
  is what the gate still measures.** With `EMBER_DATA_PROVIDER=live` every
  headline, source and URL belongs to a publisher who wrote it (measured:
  Reuters, CNBC, Bloomberg, Yahoo, Benzinga, SeekingAlpha, ChartMill), which
  is the only condition under which ember prints a real publisher's name.
  Below is the mock, unchanged.
- **News is generated, and its outlets are invented.** Everything else in the
  mock invents numbers; headlines would invent *words attributed to an
  organisation*, and a fabricated Reuters story about a real company is a fake
  news story with a real byline on it. The sources do not exist until Finnhub
  supplies real attribution — and that should be the only moment ember ever
  puts a real publisher's name on a headline. Every template is procedural on
  purpose; none of them are directional. ADR 0027.
- **News never enters the ensemble, and it is enforced.** A test walks every
  file under `lib/signals` and fails if one imports a news module; a second
  reads `NewsItem` and fails if a `sentiment`, `relevance`, `score` or `weight`
  field appears on it. Prose alone would erode the first time someone reached
  for "just a relevance nudge". ADR 0027 amends ADR 0005 explicitly rather than
  quietly.
- **The screenshot set is current** — 62 captures, regenerated 2026-08-18 over
  15 routes × 2 viewports × 2 themes, plus the command menu on desktop, which
  is the one piece of the app a route list can never reach (⌘K is mounted on
  desktop only, decision 052). `capture.mjs` empties the directory first, so a
  renamed route can no longer leave a two-redesigns-old PNG sitting beside a
  current one.
- **A Supabase project now exists, and half the unverified list is closed.** `.env.local` carries real credentials and `0001_init.sql` has been applied — verified directly against the REST API: all five tables answer, an anonymous read of `profiles`, `transactions`, `preferences` and `watchlist` returns `[]` rather than rows, and an anonymous write is refused with a 401. **RLS is doing its job.** `notices` is readable, as its policy intends.
- **Migrations 0001–0006 are all applied.** Probed against the live REST API on
  2026-08-17 rather than taken from this file: `push_subscriptions` returns 200
  (0004), `entitlements` and `sponsors` return `[]` (0005), and `admins`,
  `suspensions`, `admin_log` and `notices.pinned` all answer (0006). Earlier the
  same day this section claimed 0004 and 0005 were outstanding and both had in
  fact been applied — the second phase
  running where measuring the project found the document wrong about exactly this,
  after the same thing happened to 0002 in phase 26. Assume nothing here without a
  probe. Each sync document still fails on its own (decision 115) rather than
  taking the others down.
- **Adding a column to a select is not free, and PostgREST is why.** Naming
  `pinned` in `/api/notices`'s select answers **400** against a project without
  `0006` — a missing column is a refusal, not an omission — so the route would have
  failed outright on the live project. It selects `*` and maps to an explicit shape
  instead, which is safe on `notices` alone because every column of that table is
  public broadcast copy. Found by probing, not by review.
- **What is still unobserved is the half that needs a human**: the magic-link round trip, the edge session refresh, and two devices converging. Nothing in the gate can drive those — signing in requires receiving an email and clicking a link. What *is* tested is the part that can destroy data: `lib/sync/merge.ts` has 20 tests over conflicts, deletions, tombstone settlement, convergence and idempotency. The first thing to check after a real sign-in is that a second device converges rather than duplicating.
- **One edit can lose.** The same trade edited on two devices between syncs resolves to the later write and the earlier one is gone. Accepted cost of last-write-wins on a single-user table; the alternative that avoids it is a CRDT, which is enormous machinery for one person on two devices. ADR 0031.
- **Sync covers the ledger, preferences, the watchlist and the profile's five fields. Nothing else.** No holdings table (they are derived — ADR 0004), no positions, no realised P&L, no assessments, no findings, no alert history. `sidebarCollapsed` and `hasOnboarded` are also excluded on purpose: they are facts about a *device*, and syncing `hasOnboarded` would skip setup on a device that has never run it, including the cookie write setup exists to perform (ADR 0014).
- **Broadcasts are authored in the build until a project exists.** `RELEASE_NOTICES` ships compiled in and `/api/notices` returns the `notices` table *plus* those, so a fresh project shows something rather than an empty screen. They are real messages about real changes — just ones that can only change when the app does.
- **The notification history only records what was delivered.** ember's watcher runs while the app is open, so an inbox that re-derived "what would be due now" would list interruptions that were never made. Consequence: alerts that would have fired while ember was closed are absent from the history as well as undelivered, which is honest and is the same limit the screen states.
- **The findings request is the one thing that leaves the device**, and it is
  the only privacy claim in the app with an exception attached. Four derived
  numbers per open position: symbol, quantity, average cost, opened-at. Not the
  ledger, not fees, not accounts, not closed positions, not realised P&L, not
  the base currency. Nothing is persisted server-side. It fires whenever Home
  loads and while the alert watcher is running — **not** only when alerts are
  on, so any copy claiming the switches control it would be false. ADR 0025.
- **Risk findings only exist for instruments you hold.** A "risk" on something
  you have never owned is a sell signal with nobody to address it to, and it
  already appears in the feed. Watched-but-unheld instruments get opportunities
  only, with a small urgency nudge — and only once the user has actually
  curated a list, since while the watchlist holds its "everything" sentinel a
  bonus applied to all of them is a bonus applied to none.
- **Thesis decay is coarser without an entry read.** Reconstructing the read at
  the opening bar needs 200+ bars of history before it, so a position opened
  before the available series simply has no entry to compare against. It falls
  back to "today's read is a qualifying sell on something you hold", which is
  the same finding stated less precisely — withholding risk signals from the
  oldest positions would be exactly the wrong failure mode.
- **Drawdown bands (8 / 12 / 18% by profile) are judgement calls, not fitted
  parameters**, the same status as `PROFILE_WEIGHTS` and `regimeWeight()`.
  Stated in the source so they can be argued with; never present as estimated.
- **"Onboarding buttons don't work on mobile" is solved, and it was never the
  buttons.** Two causes, both found in phase 29 and both above: the dev server
  refused every JavaScript chunk to a LAN origin (decision 223), and
  `DataSourceChip` failed hydration app-wide (decision 224). Verified over the
  real LAN address at 375px — setup now advances step to step. What follows is
  the phase-18 investigation, kept because its conclusion was right and its
  method is why this took three phases to find: **it was only ever reproduced
  over localhost.** Driven
  end to end in Chromium at 375px under touch emulation (`pointer: coarse`,
  five touch points), every control fires and "Explore with sample data" lands
  on `/portfolio` with the sample book and the cookie written. Hit-testing at
  each button's centre returns the button itself, so nothing is covering them.
  What phase 18 did instead was **remove the structural suspect**: the sticky
  control bar is gone (decision 098), which was the last `position: sticky` on
  this screen and the same class of hazard as decision 055. That is a reasoned
  fix, not a confirmed one, and it needs a real device to close.
- **The iOS launch screens are portrait-only, iPad-less, and unverified.** Ten
  bitmaps covering the current iPhone lineup, generated with their `<link>`
  media queries by `generate-icons.mjs`. Landscape and iPad fall back to the
  white flash that Safari shows when no matching bitmap exists — the full
  matrix doubles the file count for a case that is a phone *launched* sideways.
  And `apple-touch-startup-image` only takes effect in a standalone installed
  PWA on real hardware, which no part of the gate can drive. ADR 0030.
- **The iOS hit-test fix is unverified by machine.** Removing `backdrop-blur`
  from sticky chrome (decision 055) addresses a WebKit compositing bug that
  cannot be reproduced in Chromium, so it was reasoned about and applied but
  not observed failing or observed fixed. It needs a real device.
- **The 44px floor covers `Button`, `Switch` and `Segmented` only.** Anything
  else interactive — a bare `<a>` in body copy, a chart affordance — still has
  no floor. Deliberately not chased speculatively; the phase 12 control ramp is
  where the visible sizes get fixed.
- **`scripts/audit.mjs` does not check target size.** axe's `target-size` rule
  is WCAG 2.2 AA and the audit is configured for 2.1. Worth enabling when the
  control ramp changes.
- **Push-while-closed exists as of phase 26, and none of it has been observed
  working.** The code is complete: a VAPID subscription written straight to
  Postgres, `scripts/send-digests.mjs` posting to it, and the `push` handler in
  `public/sw.js` that has been unreachable since phase 9 — which did not have to
  change, five phases later. What has *not* happened is a single delivery. It needs
  a deployed app, a project with `0004` applied, a VAPID keypair in the workflow's
  secrets, and real hardware; nothing in `npm run verify` can drive any of it. Until
  then the honest statement is unchanged from phase 9 — **alerts fire while ember is
  open** — with the machinery now sitting behind it untested.
- **Push cannot be tried over `npm run dev` on a phone, and now says so instead
  of failing silently.** Two hard requirements neither the code nor the UI used
  to name: a registered service worker (skipped outside production, now
  `NEXT_PUBLIC_EMBER_SW_IN_DEV=1`) and a **secure context** — and localhost is one
  by specification while a LAN address is not, so `http://192.168.x.x:3000` can
  never register a worker in any build. **`npm run dev:https` does not fix that
  for a phone** — its certificate is self-signed and a browser will not register
  a worker behind a certificate the device does not trust. Testing push on real
  hardware means a tunnel with a real certificate, or a deployment. Decisions
  229–231.
- **Service-worker registration is unverified by machine here.** The in-app
  browser this project is driven from refuses `register()` with "an unknown error
  occurred when fetching the script" while `/sw.js` returns 200 with the right
  content type and parses cleanly — the same class of limit as the notification
  constructor it already blocks. So the flag, the registration and the
  subscription path are reasoned and unit-tested but never observed working;
  what *is* observed is that the flag inlines and the branch compiles in.
- **The email digest is written, unsent, and watchlist-scoped by construction.**
  Resend, `email_prefs`, RFC 8058 one-click unsubscribe, a `security definer`
  function so the link works signed out, and a batching floor. It **cannot carry a
  loss-prevention warning**, because those need holdings and holdings never persist
  server-side (ADR 0025) — stated in the settings panel and in the email footer
  rather than left to be discovered. Also unsent: no verified sending domain, no
  `RESEND_API_KEY`, and the sender refuses rather than pretending.
- **The digest goes out at a fixed UTC hour, not in the recipient's morning.** The
  time zone is already synced (decision 110 detects it), so per-timezone delivery
  needs an hourly cron and a filter rather than new data — 24 runs a day against a
  free tier's 2,000 minutes a month, which is a cost to take deliberately.
- **The NGX clock has started, for half the Lagos rows.** The workflow runs from
  the private repository `theebuka/ember`; the first run (2026-09-29, by hand)
  stored six bars for the 2026-09-28 session. **The other six never get a close
  from this endpoint**: AIRTELAFRI, BUACEMENT, DANGCEM, MTNN, NESTLE and SEPLAT are
  Premium Board listings, and the board returns `ClosePrice`, `HighPrice` and
  `LowPrice` as `null` for them — with volume and trade counts present — hours
  after the close. 64 of 146 listings that traded that day had no close. The
  collector refuses them, correctly: `OpeningPrice` there equals the previous
  close, so storing it would be fabricating a bar. Not yet known whether the
  fields fill in during the session; check a run at 14:00 UTC before looking for
  another source.
- **The warm store is deferred a second time, and the reason has changed.** Phase 22
  deferred it because nothing was scheduled to fill it; the scheduler exists now, so
  that excuse is spent. The actual obstacle is a shape mismatch:
  `providers/live/cache.ts` is generic over its value type — `yahoo-daily` holds
  `{ candles, meta }`, `coingecko-daily` holds `Candle[]`, `frankfurter-history`
  holds one rate table for every pair at once — while the only process allowed to
  write the store runs *outside* the app. So filling it means the writer duplicating
  provider logic, or a route that dumps the in-memory cache (a new endpoint whose
  whole job is exporting data from an upstream §7 records as unlicensed), or a
  per-symbol read tier at 214 round trips per load. The migration was written and
  then deleted, because an unused table in a migration reads as something that
  works. `LOAD_DEADLINE_MS` is what keeps this safe to defer: a cold container is 8
  seconds and honest about it. ADR 0037.
- **Price levels still don't exist** and show a `Not yet` chip rather than a switch, because nothing in the app can set a level. The daily summary wore the same chip until phase 26 built the server behind it — which is the chip pattern working as designed: it names what has to exist first, and then it goes away.
- **Nothing prunes the alert log.** Same as `handled` — entries stop suppressing on read and are overwritten in place, one per `kind:symbol`, so it can't outgrow twice the universe.
- **Nothing prunes expired `handled` entries.** They stop suppressing on read, which is enough at this scale; a sweep belongs with server-side storage.
- **Executing does not verify the fill — but the *timing* half of that gap is now measured.** Phase 25 moved the backtest's entry to the first bar after the call, so the track record reports what the delay costs (`actionGap`) instead of pretending you could trade the close you were shown. What remains unverified is the *user's* fill: the form is pre-filled from ember's sizing and the user can change anything; the ledger records what they entered, not what ember suggested. The `note` field stamps which call it came from, which is what the track record will later use to tell followed calls from the user's own ideas.
- **`/asset/[symbol]` does not offer Execute or Dismiss.** The card there shows ember's read in full but points at the feed to act, because handling is tracked per call and the feed is where that state lives. Its Execute button opens the plain transaction form instead.
- **No nav tab lights up on an asset page.** It sits outside the five sections and is reachable from three of them, so highlighting one would be a guess. The header's back control is how you leave.
- **Asset metrics are generated on the mock path and mostly real on the live one.** Fundamentals are filed statements when live; on-chain market cap and supply are real while realised capitalisation stays derived; policy rates stay compiled in either way. Each group on the page says which it is.
- **Sorting by "strongest signal" can rank a muted read above a tinted one.** Correct and intended — it ranks raw conviction × confidence, while the tint marks what clears the profile's bar. Worth re-reading if the sort ever starts looking wrong.
- **`ui/form.tsx` is ours, not shadcn's.** The registry entry is empty (decision 020). If a future `shadcn` release fixes it, the file can be replaced wholesale — the API is the documented one.
- **`ui/command.tsx` is patched in two places**, both registry defects rather than ours: `CommandDialog` rendered its children without the `Command` provider, so the palette threw on first open, and it rendered the sr-only `DialogHeader` *outside* `DialogContent`, emitting it into the page body on every screen. Both are marked with `ember:` comments. Re-running `shadcn add command` would undo them.
- **The importer accepts a shortfall.** If a CSV sells more than the merged ledger holds, the preview warns and imports anyway — refusing a whole file over something fixable in-app afterwards is worse. `derive.ts` clamps, so figures stay coherent, but the ledger is knowingly inconsistent until the user adds the missing buy.
- **The backtest was run once over live prices, and it is not the figure quoted below.** Measured 2026-08-14 against a production server on `EMBER_DATA_PROVIDER=live`, Balanced: **979 calls, 35.96% hit rate, +1.84% average return, 6.69% max drawdown**, 4.6s cold. That is real walk-forward output over real prices and it is the first time ember has had one. It is recorded here rather than in the table below because the table is what `npm run verify` reproduces, and the gate runs on generated data by design (decision 126) — a documented figure nobody can re-derive is exactly what §8 exists to prevent. Publishing live figures properly needs `measure.mjs` to take a provider flag and a note on the page saying which run it was.
- **The mock's completed history doesn't evolve day to day.** `generateReturns` is seeded by symbol alone and `generateDaily` rescales so the *last* bar equals `anchorPrice`, so each day the identical 1,000-bar path is simply re-dated one day earlier. Consequence: outside a live session, AAPL closes at exactly $241.80 every single day. Only the intraday bar moves. Fixing it means indexing returns by calendar day from a fixed epoch and anchoring at a fixed *date* rather than at the last bar — contained in `mock/series.ts`, but it changes every generated price and therefore invalidates the backtest figures quoted below, so it should be done deliberately with a re-measurement, not folded into a screen.
- **Realized P&L is converted at today's FX rate, not the trade-date rate.** Only the JPY, CHF and CAD crosses are quoted in anything but USD, so this is exact for 101 of 110 instruments. The live feed *does* serve historical rates now — Frankfurter answers by date — so the remaining blocker is that `derive.ts` is a pure client-side function with no rate history to read, which is a real change rather than a flag.
- **Advice is cached 60s in module scope** (`lib/api/server.ts`), or **5s while the universe is still filling** — holding a partial result for the full minute would discard exactly the fetches the load deadline was betting on. Per server instance, evaporates on redeploy.
- **There is still no shared cache, and on serverless the disk tier is inert.** `.cache/market/` survives a restart locally, which is what makes cold survivable against these quotas, but a fresh container has no `.cache/`. Phase 22 planned a Supabase `series_cache` tier and it was **deliberately deferred to phase 26**: a store with nothing scheduled to fill it is half a feature, and the cron that would fill it lands there. The load deadline is what makes that deferral safe — a cold container is now 8 seconds and honest about it rather than a minute of nothing.
- **Cost basis is average-cost, not FIFO.** The two only diverge on a partial sell of a position built in tranches. The lot detail is all in the transaction log, so FIFO is a settings toggle and a recomputation, never a migration.
- **`/api/track-record` still costs about 19 seconds cold, and phase 24 bought the
  six new rules for nothing.** It was 400ms at thirteen instruments, 2–5s at 110,
  and 18.5s at 214. Adding six rules took the walk-forward to **50.7s**; three fixes
  found by profiling took it back to **24.9s** at the engine level, and the route
  measures ~19s for the two profiles it runs cold. All three fixes were
  behaviour-neutral — identical call counts, hit rates and drawdowns at every step —
  which is the only thing that makes a performance change safe to ship beside a
  behavioural one. The fixes, in order of size: `clenow`'s peer sweep moved into the
  per-date snapshot (1,726ms → 22ms per 1,760 contexts), `xs-momentum` and
  `dual-momentum` followed, and once no equity rule read a peer's bars the 420-bar
  peer slice went behind a memoised getter (`buildContext` 693ms → 185ms). ADR 0035.
  Cached per UTC day in module scope, so one visitor a day pays it behind a
  skeleton — but nineteen seconds is still past the point where "accepted rather
  than fixed" is the honest description. **Precomputing at build time is the
  answer** and it is on the §9 list; sampling the universe is still not, because a
  page that says "computed over everything we watch" has to mean it.
- **The cross-section snapshot costs memory during a backtest, and it is a real
  number.** A walk-forward run touches ~1,700 distinct market-days, each holding
  176 rows plus seven distribution arrays — roughly **80 MB held for the twelve
  seconds the backtest runs**, then released with the universe. It is a `WeakMap`
  on the universe rather than a bounded LRU on purpose: the backtest walks one
  symbol all the way to the present before starting the next, so an eviction
  policy would discard exactly the entries the other 213 symbols are about to ask
  for. Fine on a laptop; worth knowing before this runs on a small serverless
  container, and moot once the track record is precomputed at build time (§9).
- **The three profiles each load their own universe, so the snapshot is not shared
  between them.** `/api/track-record` calls `loadUniverse` directly rather than
  going through `server.ts`'s `cachedUniverse`, so a visitor cycling profiles pays
  the cross-section sweep three times. Sharing it would be a small change and it
  trades that time for holding ~80 MB across a 60-second TTL, which is the wrong
  trade on a container. Superseded by precomputing at build time rather than fixed.
- **Per-strategy hit rates credit every driver of a call.** A call driven by four rules counts for all four, so the counts sum to more than the total. It measures which rules were present when things went well, not which one was responsible — the page says so.
- **`measure.mjs` reports 176 equities**, which is 72 US plus 92 international plus 12 NGX. Only 164 of them have a fetchable history; the twelve Lagos rows are collecting.
- **Payload sizes, measured, and the next lever is now the obvious one.**
  `/api/advice` is **236 KB** for a ranked page of 20 (78 of 214 actionable on
  Balanced); `/api/findings` is **157 KB** for a page of 12. Both are bounded by a page limit rather than by the size of the
  universe, which was the point. **Both grew by roughly a third in phase 24 and the
  cause is entirely the citations**: an assessment now carries up to sixteen
  contributions instead of ten, each with its own full `Citation` object, and the
  same sixteen citations are re-serialised on all 20 assessments. Deduplicating
  them into a per-response map would cut both by close to half — it was worth doing
  deliberately before and it is close to overdue now. It means renegotiating
  decision 028 (citations travel on `Contribution` so components never have to look
  one up), which is why it is a decision rather than a tidy-up.
- **The window's decay term is dormant for every call the engine actually makes.**
  `computeWindow` multiplies liquidity, an event mask and signal decay — and the
  third of those is doing almost nothing. Measured: the blended half-life lands
  between 24 and 75 days across all three profiles, so `exp(−ln2 · 3 / halfLife)`
  over a 72-hour horizon sits between 0.92 and 0.96, against a liquidity term that
  swings 0→1 inside one session. It would matter for a half-life of a few days; the
  blend does not produce one. **This also means §5's claim that `connors-rsi2`
  "produces the tightest execution windows in the app" is not true in practice** —
  the windows are set by liquidity and, since phase 25, by dissent.
- **The ensemble structurally cannot produce a short-horizon call.** A fast rule has
  to out-weigh fifteen slower ones to lead, and the two fast rules cannot: their own
  confidence caps stop them (`short-reversal` at 0.45 because its published edge
  lives inside a spread ember does not model). Measured over every qualifying call,
  the leading agreeing driver was mean-reversion in **6 of 143 on Aggressive, 0 of
  78 on Balanced and 0 of 17 on Conservative**, and the blended holding period's
  10th percentile is 61 days. This is why the planned profile horizon axis was
  removed (§7) — and it is a finding about the blend, not about the profiles.
- **On daily bars the execution window cannot change the backtest's fill.** The lag
  from call to entry is exactly 1.00 bars for every trade in every profile, because
  `opensAt` always falls inside the next bar. The "or later if the window opens
  later" branch is real code a daily-bar backtest never exercises. The window is a
  live-trading affordance; pricing it needs intraday bars ember does not have.
- **The action gap measures ~0 on generated data, and that says nothing.** Next
  open against previous close is symmetric noise on a random walk and averages out
  over 1,500 trades. What the change fixed is real regardless: the backtest used to
  enter at the very close the assessment was computed from, which is a fill nobody
  could get. On live prices the gap will be non-zero, because overnight moves run
  with the signal.
- **Liquidity curves in `lib/market/sessions.ts` are still modelled, even on live data.** The shapes are the documented ones (a U-shaped equity session, the London/NY overlap in FX, weekend crypto thinning) but the control points are judgement, and none of the free tiers serves intraday spread or depth. This one did *not* close when live data landed, contrary to what §9 predicted through v2 — a quote endpoint gives a price, not a book. What *did* change in phase 23 is that the equity curve is now expressed as fractions of a session and mapped onto each venue's real hours, so it is modelled in the right place at the right time rather than modelled in New York for everyone. **Exchange holidays are not modelled at all** — every venue is assumed open Monday to Friday, so a window can open into Golden Week or Christmas. Visible, wrong, and not yet fixed.
- **Company fundamentals are filed when live.** Finnhub's `/stock/financials-reported` is the parsed 10-K, which is the SEC EDGAR data ADR 0006 planned for without ember having to read XBRL — so this gap is closed rather than deferred. On the generated path they are still invented, and the methodology page reads which is running rather than asserting it.
- **On-chain metrics are derived from the generated price path**, not from a chain. Realised cap is approximated by a 200-bar EMA of market cap.
- **`PROFILE_WEIGHTS` and `regimeWeight()` are reasoned judgement calls, not fitted parameters.** Stated openly in the source so they can be argued with; never present them as estimated.
- **Backtest results on mock data are near chance, and that is correct.** Generated prices are a random walk with clustered volatility — there is no structure to find. Measured 2026-08-17 by `scripts/measure.mjs`, walk-forward over all 214 instruments on the sixteen-rule ensemble, **entering at the first bar after each call rather than at the close it was computed from** (decision 167):

  | Profile | Calls | Hit rate | Avg return | Median | Max drawdown | Stopped out |
  |---|---|---|---|---|---|---|
  | Conservative | 479 | 41.3% | +1.2% | −1.7% | 2.4% | 49.1% |
  | Balanced | 1574 | 42.0% | +0.3% | −1.9% | 10.8% | 46.7% |
  | Aggressive | 2514 | 41.3% | +0.4% | −2.5% | 24.0% | 49.4% |

  All three are freshly measured, and **every one of them moved for four reasons across two phases**, which is why they should not be read as the engine getting better or worse: six rules were added, `dual-momentum` was rescored (it was a duplicate of `ts-momentum` — ADR 0035), the confidence floors were re-derived, and phase 25 moved every entry a bar later and onto an open rather than a close (ADR 0036). Against phase 23 the shape of the change is consistent: slightly lower hit rates (42.6/43.8/42.8 → 41.4/41.7/41.2), **materially lower drawdowns** (3.0/12.8/25.6 → 2.7/10.2/22.8), and lower average returns. **Balanced's mean is now +0.1%, which is zero.** On a random walk that is the honest outcome and it is worth saying rather than rounding past: more rules disagreeing produces a book that trades more often for less, and there is no edge in this data for the diversification to find. The one thing that would be evidence is the drawdown falling while the median held, which is what happened.

  Before reading any shift here as a change in the engine, note that `generateReturns` is seeded by *symbol* — the MATIC → POL rename in phase 23 (decision 125) moved the Balanced count by eight trades on its own.

Otherwise **they drift by about one trade over the course of a session**: the series the backtest walks ends on today's live intraday bar, so a marginal call near the end can flip. Two runs twenty minutes apart put Conservative at 37.7% and then 37.2%, which is one trade of 247; a phase-24 pair put it at 40.5% and 42.0% on 131 calls, which is two. Anything larger than that between runs is a real change, not noise. A hit rate near 40% with a positive mean and a negative median is the trend-following payoff shape (many small losses, a few large wins, stops doing the cutting), not evidence of an edge. The first caveat on the track-record page must keep saying so. **Every figure moved when the universe went global**, and not only because there are more instruments: the international listings are a genuinely different sample — different sessions, different currencies, no fundamentals — so the hit rate rising from ~40% to ~43% is a change in *what is being measured*, not evidence that the engine improved. The Aggressive drawdown nearly doubling to 25.6% is the same story pointing the other way. Neither is a finding about the strategies. **The same caution applies to phase 24's figures** — six new rules, a rescored `dual-momentum` and three re-derived floors all landed together, so no single number in that table can be attributed to any one of them.

**The v1 figures were replaced entirely**: the universe grew 8×, the mock's variance recursion changed (ADR 0026, every price is different), and the backtest moved from the combined actionability predicate to `qualifies()` (ADR 0025). Three independent reasons the old numbers describe nothing that still exists.
- **Confidence lands in roughly 10–55 in practice**, not 0–100, because it is a product of four sub-unit terms. Measured on the sixteen-rule ensemble: mean 26, median 25, maximum 54. Labels are calibrated to that (`Low` <35, `Moderate` 35–55, `High` ≥55) and **`High` is very nearly unreachable**, which is a pre-existing wart rather than a new one. The floor a call must clear moves with the risk profile — **37 / 28 / 23**, re-derived in phase 24 from the new distribution (ADR 0013 set the original 45 / 35 / 28) — so **all three profiles now surface calls badged `Low`**, more of them the more aggressive the profile. The label describes the evidence and the floor describes what a profile asked to be shown; they are deliberately no longer the same number. On the current universe the three clear **20 / 77 / 143 of 214**, which is the settings screen's measured preview, against 20 / 78 / 136 before this phase and 10 / 34 / 64 on the 110-instrument universe.
- **Service worker registers in production builds only** (a cached shell makes hot reload lie), unless `NEXT_PUBLIC_EMBER_SW_IN_DEV=1` — and then as `/sw.js?mode=dev`, which caches nothing (decision 248). **A browser that ran the dev worker before 2026-09-29 holds a stale cache** and needs its registration and caches cleared once (DevTools → Application → Storage → Clear site data). Verify offline behaviour against `npm run build && npm run start`, not `dev`.
- **Sidebar collapse flashes expanded on first paint** for users who collapsed it, because `localStorage` isn't readable server-side. A cookie-backed read in the server layout would fix it; deferred as low-impact.
- **`offline.html` duplicates the palette** as literal hex, because it is served when the stylesheet can't be fetched. If the palette changes, update that file too — it's the one place the one-file colour rule can't hold.
- **The type scale is registered twice**, in `globals.css` (`@theme`) and in `lib/utils.ts` (tailwind-merge). Adding a size to one without the other means the class is silently dropped whenever a colour sits beside it — ADR 0016, and there is a test that reads the CSS and fails if the two drift.
- **The onboarding cookie is a mirror, not a source.** `hasOnboarded` in the store is authoritative; `ember_onboarded` exists so `proxy.ts` can decide before render. They self-heal when they disagree (ADR 0014), but anything that sets one must set the other.
- **`/api/risk-preview` runs the ensemble three times, and got *faster* in phase 24 — 400ms → ~200ms** — despite six more rules, because the cross-sectional measures moved into a per-date snapshot the three profile runs now share. Memoised per profile for 60s over one shared universe load; a cold settings visit still pays for all three at once.
- **Layout shift is not zero, and there are now two screens carrying it.** Measured 2026-08-17 by `scripts/perf.mjs` on a seeded ledger: **asset detail is 0.066 mobile** and **Settings — account is 0.065**; every other screen sits under 0.025 — including Home with a live pinned broadcast on it, which measures 0.000 because the banner is resolved on the server. The settings figure is the one to look at next — §8 previously claimed the phase-21 tab refactor had removed it and that claim no longer holds, with the suspect named in §9's carried-forward list. Settings was 0.077 before phase 21, when a sidebar that only existed above `lg` reflowed the pane beneath it; that cause is genuinely gone, so this is a different one. That remainder is `Your position` being inserted the moment `localStorage` becomes readable, because the server cannot know there is a book. Phase 17 moved it from four seconds in to hydration (decision 090) — which does not change the score but changes it from "the thing you were reading moved" to "the page settled" — and fixed everything around it: the hero skeleton was 68px short (ADR 0019's own pattern, missed in the one place the sweep after it didn't reach), the price row was a fragment collecting a 36px `space-y` gap where its `mt-3` asks for 12, and the trending strip wrapped to two rows where the real one wraps to three. Removing the last of it means mirroring the ledger's existence into a cookie (ADR 0014's pattern) — **and phase 28 took exactly that step for the pinned banner**, `ember_pins`, after clamping the copy got Home only from 0.253 to 0.157. The same move works here, and the precedent now exists twice. **The gate is 0.1**, Google's threshold, for the same reason — decision 092.
- **The empty-book state has a shift of its own, and it is larger.** Lighthouse carries no `localStorage`, so its runs see a first visit: Home measures 0.092 mobile there against ~0.002 seeded. Same cause, opposite direction — the empty-book block is shorter than the hero-plus-chart skeleton it replaces, so everything below it moves up. Worth fixing only alongside the cookie above, because it is the same missing piece of server-side knowledge.
- **Mobile Lighthouse performance is 68–82**, on the throttled profile (simulated slow 4G, 4× CPU), with LCP 4.5–6.6s and TBT 63–124ms. Desktop is 99–100, LCP under 1s, TBT 0ms. **The signals feed is the floor at 68** — it is the screen that renders the largest payload, and that payload grew a third in phase 24 as contributions went from ten to sixteen per assessment. **Asset detail's mobile figure is the least stable in the gate**: three consecutive runs on effectively the same page measured LCP at 6.6s, 8.9s and 4.7s, and the score at 77, 75 and 83. It loads the whole universe to rank peers, and 214 instruments of JSON on a throttled connection sits exactly where Lighthouse's simulated throttling is most sensitive. Treat it as "several seconds and too slow", never as a number to compare run to run. Desktop Signals holds 100 with a CLS of 0.027 from its two-column grid, well inside the 0.1 gate. **This is down from v1's 82–87 and the cause is the universe** — 110 instruments instead of 13 is more JSON to parse and more rows to lay out, and the throttled profile is where that lands. There is no image to blame; the critical path is the stylesheet and the app's own JavaScript, and there is no easy win left without splitting the bundle.
- **Lighthouse and the seeded CLS run disagree about the signals feed** — 0.182 against 0.000, and it is not reconciled. Lighthouse's throttling and viewport aren't reproducible through a CDP emulation (an unseeded, hand-throttled Playwright run measures 0.0002), so one harness is seeing something the other isn't. Both figures are published rather than the flattering one being chosen; resolving it needs a Lighthouse trace read properly.
- **No horizontal overflow at any width**, 320→1920 across all 16 routes — but that only became true in phase 17. At 320px an ordinary six-figure balance in the value hero pushed the document 36px wide on four screens, and had done since the v2 type scale landed. The fix is a `max-[374px]:` step down, decision 091.
- **The accessibility pass is automated only.** 0 axe violations across 64 page audits — and since phase 15 the audit seeds a real book with two stopped-out positions, so the risk rows and the tinted severity badge are actually measured rather than never rendered. But axe cannot judge whether the keyboard path makes sense, whether focus lands somewhere useful, or whether a screen reader's rendering of a finding is comprehensible. Those were walked by hand, not tested by machine.
- **The profile holds five fields and refuses the rest** — no date of birth, no address, no income bracket, no phone number. ember issues nothing, holds no money and executes no trade, so it has no KYC obligation and every extra field would be pure cost. Nothing is required, there is no completeness meter, and the time zone is detected rather than asked. ADR 0032.
- **The greeting block will not mention money, and that is enforced.** `greeting.ts` exports `MONEY_WORDS` and a test fails on any prompt template matching it. The rule was already in the file's header comment; phase 17 turned it into something a build can fail on, because the pool's natural register is exactly the line it cannot have and a comment does not survive the first person who reaches past it. Decision 086. The daypart prompt ("How are we feeling this morning?") appears on roughly one visit in fifteen — it is filtered out whenever the greeting above already used the word, which is most mornings.
- **The trending skeleton's chip widths are approximated, not derived.** Its *heights* come from the type scale like every other skeleton, but how many topics clear the two-mention floor and how long their labels are is not knowable before the response lands. The six widths are the median case and wrap to three rows at 375px like the real strip; a quiet news day produces fewer chips and the strip collapses upward. Only a fixed-height strip could prevent that, and reserving three rows of whitespace on a slow day is a worse screen than a small settle.
- **`notifications.dailyDigest` and `notifications.priceAlerts` are stored and unread.**
- **Export and reset are client-side only.** Export builds a Blob in the browser; reset clears `localStorage` and a cookie. Nothing survives the device. Alerts are client-side too, but they are now driven by `/api/findings`, which is the one call that sends — see the entry at the top of this section.
- **An alert can be up to two minutes late by design.** The timer is capped and re-armed rather than set once to `opensAt`, because a single long `setTimeout` dies silently on a sleeping laptop or a throttled tab. ADR 0017.
- **Alert delivery is verified against a stubbed `Notification`.** The scheduling rules have real tests; the browser check drove the whole flow with the constructor replaced, since the in-app browser blocks notifications by default. The `granted` path on a real OS is untested by machine.

---

## 9. Next up

**v2 is complete, it runs on real market data, and as of phase 24 the engine is
sixteen citable rules across eight families.** The product does the thing it was
built for: it watches 214 instruments across sixteen venues and what you own,
comes to you with opportunities and with warnings about positions that have
turned, and carries the news beside them without ever letting it near the engine.
Everything ships behind one gate (`npm run verify`) that builds, serves and
measures itself: 362 tests, 0 axe violations over 64 page audits, no horizontal
overflow at any width from 320 to 1920, and layout shift inside Google's 0.1 on
every screen — worst 0.057, asset detail on mobile.

**Phase 26 gave ember a server that works while you are away, and phase 28 gave
it a voice — and neither has run.** Push, email digests, the NGX collector,
broadcasts, the pinned banner and every suspension control are complete and
entirely unobserved. `0001`–`0006` were probed applied on 2026-08-17; `0007` and
`0007` and `0008` were verified applied on 2026-09-28/29 after the project was
restored from a pause, so every migration in the repository is now live. The remaining blockers are a deployment and eight repository secrets,
every one of them a human step. The code is written; the capability is unverified.
§8 says exactly which parts.

**The admin surface is deliberately smaller than the word suggests, and ADR 0039
is the argument.** ember works fully with no account, so nothing in the schema can
ban anybody — a suspension stops sync, email and push, the control is named after
those three things, and the panel says out loud what it cannot touch. There is no
directory of users, because building one means a blanket read over every profile
to solve a problem this product does not have.

**Accounts landed in phase 19 and are switched off.** The code is complete and
optional: create a Supabase project, run `supabase/migrations/0001_init.sql`,
set the two `NEXT_PUBLIC_SUPABASE_*` variables, and sign-in, cross-device sync
and server-stored broadcasts turn on with no code change. Until then the app
behaves exactly as it did — see §8 for what that leaves unverified.

Next, in order of what unblocks the most:

1. **Sign in on a second device and check it converges.** Now the oldest
   unobserved thing here by some distance — every migration is applied (0001–0006,
   probed 2026-08-17) and `lib/sync/merge.ts` has 20 tests over the part that can
   destroy data, but no two real devices have ever met. Check for duplication
   rather than for loss: the merge is last-write-wins per row, so the failure that
   looks like a bug is a trade appearing twice.
2. **Finish turning the scheduler on.** The workflow is live on the private
   repository `theebuka/ember` with seven secrets set, on Node 24, and the NGX
   collector has run. Push and both digests are still blocked: they need a
   deployed app for `EMBER_APP_URL`, and the digest needs a From address on a
   domain verified in Resend (a free-mail address is refused). Until then those
   jobs fail on their schedule. Keep the VAPID keypair in `.env.local` — a second
   pair invalidates every stored subscription.
3. **Deliver one push to a closed app and one email to a real inbox.** The only way
   to verify phase 26 at all; nothing in the gate can drive either. Check in this
   order: that a watchlist still on the "everything" sentinel receives *nothing*
   rather than 214 instruments, that unsubscribe works signed out, and that a
   second run inside the floor stands down instead of sending twice.
4. **Verify the admin surface against a real signed-in non-admin.** Still open,
   and now the check that matters: an *anonymous* insert into `notices` is refused
   with `42501` (measured before `0006`, when there was no write policy at all),
   but the real question is whether `is_admin()` refuses a signed-in account that
   is not in `admins`. Different statement, and the one the plan asked for. Check
   the suspension in both halves too: that a suspended account's sync writes fail,
   and that `send-digests.mjs` drops it — RLS does not apply to the sender.
5. **Decide whether the gate should read the live `notices` table.** Decision 126
   pins the data *provider* so §8's numbers are reproducible; Supabase is not
   pinned, so a broadcast somebody publishes changes Home's screenshots and its
   layout shift, and a pinned one can fail the build. That is exactly how the
   0.253 was caught, which is a real argument for leaving it — but two runs on
   different days are then not comparable, which is the property decision 126
   exists to protect. Same shape of decision, and it wants making rather than
   drifting.
6. **Precompute the track record at build time.** It costs ~19 seconds cold —
   phase 24 added six rules and paid for them with three profiling fixes, but the
   figure it returned to is still past the point where a skeleton excuses it.
   Never by sampling the universe — a page claiming "computed over everything we
   watch" has to mean it.
7. **Make confidence independent of how many rules are in the room.** The most
   consequential thing phase 24 found. `assess()` cuts confidence for
   disagreement and for abstention, and both grow with the *rule count* whether
   or not the added rules are informative — so going from ten rules to sixteen
   moved the whole distribution down and the Conservative profile fell to 4 of
   214 on unchanged floors. The floors were re-derived (37 / 28 / 23) which
   restores the behaviour, and that is the **second** time a fixed floor has
   quietly become the only filter. Two changes, and they are the same change:
   divide `coverage` by the rules that could plausibly speak rather than by all
   of them, and make dispersion sample-size aware. Do it together with
   **correlation-aware weighting** — three of the sixteen rules correlate at
   0.88–0.94, so agreement between them is partly arithmetic. Both move every
   number in the app, so they want their own phase and one re-measurement.
8. **Make the live figures reproducible.** `measure.mjs` takes no provider
   flag, so the live backtest above was run by hand and cannot be regenerated —
   which is the one thing §8 is supposed to make impossible. Teach the script a
   `--live` mode that writes a separately-labelled report, and have the track
   record page name which run it is showing.
9. **Payments.** The gate landed in phase 27 — `lib/plan.ts`, `entitlements`, the
   upsell vocabulary and the sponsor slot — and there is deliberately no checkout.
   Note the plan's own description of this item was wrong and is corrected in ADR
   0038: **the track record and methodology are never gated**, on any plan, with or
   without an account. **Three things must be settled before a single charge:** the
   merchant of record (Stripe has no payouts to Nigeria), the host (Vercel Hobby
   forbids commercial use), and the equity price feed (Yahoo is unlicensed — ADR
   0033). All three are in §7, and all three are decisions rather than code.
10. **Referrals.** Push and the digest landed in phase 26; this is what is left of that group.
11. **Decide whether a fast rule should ever be able to lead a call.** Phase 25's
   leftover, and the one that would make the window's decay axis mean something.
   Today `connors-rsi2` and `short-reversal` are capped so low they never carry a
   call, so the "tight window, act today" case the product was built to express
   essentially never fires. Either that is correct — the caps encode real
   transaction-cost limits — and §5's claim about tight windows should be struck, or
   the blend should let a well-evidenced fast rule lead and the caps need
   re-deriving. It is the same question as item 5's correlation-aware weighting and
   wants the same phase.
12. **Build the warm store, or decide it is not wanted.** Deferred twice now, and
   §8 records the three options and why none is small. `LOAD_DEADLINE_MS` makes a
   cold container survivable, so this is an optimisation rather than a fix — which
   is itself an argument for deciding rather than deferring a third time.

Carried forward, all recorded in §8 with their reasoning:

- The mock's completed history doesn't evolve day to day. Fixing it invalidates the backtest figures again, so it needs a `measure.mjs` re-run in the same change.
- Citations are re-serialised per contribution, which is most of the remaining payload — and phase 24 made it worse by taking contributions from ten to sixteen, so `/api/advice` went 172 KB → 235 KB. Halving it means renegotiating decision 028.
- Cost basis is average-cost. FIFO is a settings toggle and a recomputation, never a migration.
- The remaining layout shift is the hydration class (ADR 0019), on the asset page and on the empty-book Home. One cookie mirroring the ledger's existence closes both; tighten the CLS gate below 0.1 the day it exists.
- Lighthouse and the seeded CLS harness disagree about the signals feed (0.182 vs 0.000). Unresolved; needs a trace read properly.
- Mobile Lighthouse is 68–82, down from v1's 82–87, and the cause is the 214-instrument universe rather than any one screen. The signals feed is the floor at 68.
- Settings — account measures 0.065 of layout shift on mobile, second only to the asset page. §8 used to claim every non-asset screen sat under 0.02 and that is no longer true. Not yet diagnosed: the suspect is the risk-comparison skeleton, whose row headers reserve invisible placeholder words rather than the real labels, so they may wrap to fewer lines than the settled table does — which would be ADR 0019's own mechanism defeated by using stand-in strings. Needs measuring in the browser, not reasoning about.
- **Sync's account-switch hold (decision 233) has never met two real accounts.**
  It needs a signed-in session, which needs the project back. Check both answers
  on a real device: that *use this account's data* leaves exactly the account's
  rows, and that nothing syncs at all while the question is open.
- **Nothing in the gate fails on a hydration error**, and a live one went
  unnoticed across every screen until it was found by hand (decision 224). Both
  `audit.mjs` and `perf.mjs` already drive a real browser with a console
  attached; failing the run on a React hydration error is a small change to a
  harness that is otherwise the most valuable thing in this repository.
- Exchange holidays are not modelled — every venue is assumed open Monday to Friday, so a window can open into Golden Week or Christmas.

**ADR 0001 is closed.** Next.js stays on 16, confirmed by the user at the start of v2.

---

## 10. Case-study asset checklist

The user is writing a design/engineering case study to senior-design-engineer standard. Produce these as a by-product of the work, never retrofitted.

- [x] Decision records with alternatives considered — `docs/decisions/0001`–`0038`
- [x] Design system documentation — tokens, type scale, component rules (`docs/design-system.md`)
- [x] Methodology page content with citations (`docs/methodology.md`, and shipped as a live page derived from the engine)
- [x] Architecture diagram — `docs/case-study/architecture.svg`
- [x] Signature component study — `docs/case-study/window-band.md`
- [x] Logo rationale — the ember point as both brand mark and product primitive (`docs/design-system.md`, "The ember point")
- [x] Screenshots: every screen, mobile + desktop, light + dark — 62 PNGs in `docs/case-study/screens/`, regenerated by `scripts/capture.mjs`, which empties the directory first so the set is never part-current
- [ ] Before/after shots where a design changed and why — the nav redesign, the type-scale fix and the CLS work all have a genuine "before", but no screenshots were taken of the earlier state. The ADRs carry the reasoning; the images would have to be reconstructed from git history
- [x] Performance and accessibility numbers — `docs/case-study/performance.md` and `accessibility.md`, both regenerated per run; summarised in `docs/case-study/README.md`. axe 0 violations over 64 page audits, Lighthouse 99–100 desktop / 68–82 mobile, CLS under 0.03 on thirteen of fifteen routes, worst 0.057
