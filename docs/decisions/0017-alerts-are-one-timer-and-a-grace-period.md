# 0017 — Window alerts are one re-armed timer, with a grace period

**Status:** accepted · phase 9

## Context

Every assessment already carries `window.opensAt`. Turning that into an alert
looks like two lines of `setTimeout`, and almost every way of writing those two
lines is wrong in a way that only shows up on someone else's machine.

Four failure modes drove the design:

1. **A timer per call.** Thirteen instruments means thirteen timers to cancel
   correctly on every refetch, every profile change and every toggle. The one
   that leaks is the one that fires after the user turned alerts off.
2. **One long `setTimeout`.** A window can be 72 hours out. A laptop that
   sleeps for six hours wakes with its timers wrong, background tabs are
   throttled to roughly a tick a minute, and a clock corrected mid-wait drifts
   silently. The alert simply never arrives, and nothing reports it.
3. **Firing on what's already open.** Opening ember at nine in the morning
   would produce a notification for every window that opened overnight — four
   interruptions announcing themselves as news, all of them hours old.
4. **Firing twice.** No stable assessment id exists (decision 026), the feed
   refetches every five minutes, and a page reload re-runs everything.

## Decision

**One timer, capped at two minutes, re-armed after every evaluation.** The
plan is recomputed from `Date.now()` each time. The worst case is an alert two
minutes late instead of one that never comes, and an idle tab costs one
comparison a minute.

**Three buckets, not two.** `planAlerts` sorts every actionable call into:

| Bucket | Condition | What happens |
|---|---|---|
| `upcoming` | opens later | the soonest one arms the timer |
| `due` | opened within the last 10 minutes | fires now |
| `stale` | opened longer ago | recorded as seen, never fired |

The grace period is what makes the design survive its own timer being late. A
throttled tab that wakes ninety seconds after a window opened still alerts;
one opened while the app was closed all night doesn't.

**A separate persisted log of what ember has said**, keyed symbol + action and
expiring with the window — the same discipline as `handled`, for the same
reason, but a different question: `handled` is what the *user* did, this is
what *ember* did, and a call nobody has touched can still be one we've already
interrupted them about.

**A visible tab gets a toast, not a system notification.** Interrupting the
operating system to tell someone about a screen they are looking at is the
behaviour that gets an app's notifications switched off. Same information,
different delivery.

## Alternatives considered

**`setTimeout` straight to `opensAt`.** Failure mode 2, silently.

**Poll every 30 seconds with no timer.** Simpler, and it wakes the tab 2,880
times a day to answer "not yet" 2,879 of them. The capped timer is the same
robustness at a fifteenth of the wakeups.

**Fire for anything currently open.** Failure mode 3. A notification's whole
claim is that it is telling you something now.

**Never fire for anything already open.** Loses the alert whenever the timer
is late, which is exactly the case the timer cap exists to handle — the two
decisions only work together.

**Reuse the `handled` store for the alert log.** Same key, same expiry, so it
was tempting. But `HandledCall` carries a `kind` of executed-or-dismissed and
there is no honest value to put in it for "we sent a notification", and
merging them would mean an alert could be mistaken for a user action by
anything reading the store later.

## Consequences

- The rules live in `lib/notifications/schedule.ts` as pure functions with 16
  tests, because timing bugs are otherwise only findable by waiting.
- **Alerts require the app to be open.** Push-while-closed needs a server
  holding a subscription and VAPID keys, and lands with accounts. Settings
  says this in as many words rather than leaving it to be discovered.
- The advice query is `enabled` on the same condition as the watcher, so a
  user with alerts off never pays for an 82 KB feed on a screen that doesn't
  show one.
- Permission is requested from the switch, never on load. A browser that has
  been told "block" will not prompt again and cannot be un-blocked from
  JavaScript, so `denied` is a state with its own copy rather than something
  to retry.
- On iOS, `Notification` doesn't exist outside an installed PWA. That's
  `unsupported`, not `denied`, and it gets the sentence that actually helps:
  add ember to the home screen.
