# 0014 — The onboarding gate is a cookie read at the edge

**Status:** accepted · phase 8

## Context

First-time visitors should land on setup. Whether they've been through it is
`hasOnboarded` in the preferences store, which persists to `localStorage`.

`localStorage` is invisible to the server. A redirect driven by it can only
run after hydration, which means rendering the dashboard, discovering it was
the wrong page, and taking it away. On a shared link to an asset page it is
worse: the page you asked for loads, then vanishes.

## Decision

Completion is **mirrored into a cookie**, and `src/proxy.ts` reads it before
anything renders. The store stays the source of truth; the cookie is a cache
of one boolean.

```
no cookie → /onboarding?next=<the page they asked for>
```

The intended destination rides along, so a deep link survives setup instead of
dumping the user on the home screen having forgotten why they came.

Divergence between the two is expected and recoverable:

- **Cookie missing, store says onboarded** — someone set ember up before the
  cookie existed, or it expired. Proxy sends them to `/onboarding`; the screen
  sees the store flag, rewrites the cookie, and replaces the route with their
  destination. Self-healing, one frame, no interaction.
- **Cookie present, store cleared** — "Reset everything" clears both, so the
  only route here is partially cleared site data, and the dashboard's empty
  state already handles a bare book.

`?next=` is validated by `safeNext()`: same-origin absolute paths only.
`//evil.example` is a protocol-relative URL that browsers treat as another
host, and a redirect parameter accepting one is an open redirect. Tested.

## Alternatives considered

**Redirect in an effect once hydrated.** The flash described above, on every
first visit, including deep links.

**Render nothing until hydration.** Turns every route into a blank frame for
users who are already set up — a cost paid by everyone to fix a first-run
problem.

**Put `hasOnboarded` only in a cookie.** It would then be the one preference
not living with the other preferences, and it would not survive the migration
to an account row cleanly. It is also the flag most likely to be lost by
routine cookie clearing, and losing it means re-running setup on someone who
has been using the app for a month.

**Skip the gate; put "Set up ember" on the dashboard empty state.** Cheapest,
and it makes onboarding optional in a way that guarantees most people never
see the disclosure, which is on step one for a reason.

## Consequences

- The file is `src/proxy.ts`, not `middleware.ts` — Next 16 renamed the
  convention and warns on the old name.
- The matcher excludes `/api/*`: a JSON fetch answered with a 307 to an HTML
  page is a parse error, not a redirect. It also excludes the service worker
  and the offline shell, which are fetched when there is no session at all.
- Settings links to `/onboarding?replay=1`, which suppresses the self-heal so
  the flow can actually be re-read. The header control there says **Close**
  rather than *Skip setup*, so someone who opened it out of curiosity isn't
  three steps from the app they were already using.
- Every route now costs one cookie read at the edge. That is the cheapest
  thing the proxy could do, and it does nothing else.
