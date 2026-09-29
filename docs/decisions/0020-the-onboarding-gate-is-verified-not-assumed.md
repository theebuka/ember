# 0020 — The onboarding gate is verified, not assumed

**Status:** accepted · phase 11

## Context

Three buttons on the last step of setup did not work, and one of them could
trap a user permanently. Both causes were invisible to typecheck, lint and 192
unit tests, because neither is a wrong value — they are wrong *sequences*.

**The race.** `finish()` navigated, and then a second navigation overtook it:

```ts
useEffect(() => {
  if (!hydrated || replaying || !hasOnboarded) return;
  writeOnboardedCookie();
  router.replace(destination);          // destination is `/`
}, [hydrated, replaying, hasOnboarded, destination, router]);

const finish = (options = {}) => {
  if (options.withSample) loadSample(sampleTransactions());
  completeOnboarding();                 // flips `hasOnboarded`
  writeOnboardedCookie();
  router.replace(options.to ?? destination);   // asked for `/portfolio`
};
```

`hasOnboarded` is a subscribed selector, so `completeOnboarding()` changes the
effect's dependencies in the same commit. The effect re-runs and calls
`router.replace("/")`, which supersedes the `/portfolio` that was asked for.

"Explore with sample data" therefore loaded the sample book and dropped the
user on Home, where the sample book is not the subject. Nothing errored. It
read as the button doing nothing — and only to first-run users, because the
`replaying` guard exempts anyone arriving from settings, which is how it was
always tested.

**The trap.** `document.cookie = …` is specified to fail *silently* when
storage is restricted — an in-app webview, iOS "Block all cookies", a managed
profile. Nothing threw, so the app redirected into `proxy.ts`, which reads the
real cookie jar, found nothing, and sent the user back to `/onboarding`. The
self-heal effect above then fired — because `localStorage` had persisted
correctly — and started the cycle again. A loop that survives a reload, in
which *every* button appears dead.

ADR 0014 enumerated the two ways the cookie and the store can disagree. "The
cookie cannot be written at all" was not one of them, and the self-heal it
describes is precisely what turns that one-shot failure into a loop.

## Decision

**A navigation is claimed before it is started.** `leave()` sets a ref, and the
self-heal effect stands down when it sees it. A ref rather than state because
the flag has to be true *before* the render that schedules the effect — updates
inside an event handler are batched and flushed after the handler returns, so a
synchronous ref write lands first and a `setState` would not.

**The cookie write returns whether it stuck.** `writeOnboardedCookie()` reads
the jar back and reports a boolean. Nothing navigates into the gate without
proof the gate will open.

**"Cookies are blocked" is a state with its own screen.** It names the setting,
names the likeliest cause — being opened inside another app — and retries in
place rather than asking for a reload.

## Alternatives considered

**Accept a `?onboarded=1` escape hatch in `proxy.ts`.** Genuinely tempting: it
turns a dead end into a working app. But it survives exactly one navigation.
The next link click has no query string, the proxy bounces again, and the user
is back at setup having been told they were through it. A worse failure than
the honest one, because it looks like it worked.

**Drop the cookie and gate on the client after hydration.** This is what ADR
0014 rejected and the reasoning is unchanged: it renders the dashboard and then
takes it away, and on a deep link you watch the page you asked for vanish.

**Move the self-heal into `finish()` and delete the effect.** The effect exists
for people who never call `finish()` — an expired cookie, a setup that predates
the cookie. Deleting it re-opens the case it was written for.

**Keep one `router.replace` and make `destination` correct.** Would work for
the three start buttons and silently break the next time anything else
navigates. The bug is the unclaimed race, not the value.

## Consequences

- The gate now has a third divergence case, and it is the only unrecoverable
  one. It is documented in `lib/onboarding.ts` beside the other two.
- `writeOnboardedCookie()` returning `boolean` makes the failure impossible to
  ignore at a call site without deliberately discarding it.
- Verified end to end in the browser: each start button lands on its stated
  route, a `?next=` deep link survives setup, a stubbed no-op cookie jar
  produces the blocked screen instead of a loop, and retrying after restoring
  cookies completes normally. Unit tests cover the read-back, including a
  cookie whose name merely ends the same way.
- **The one thing not verified by machine** is the iOS Safari hit-test hazard
  that the same fix pass addressed (`sticky` + `backdrop-filter`, removed from
  the onboarding footer and the page header). That is a WebKit compositing bug;
  it cannot be reproduced in Chromium and needs a real device.
