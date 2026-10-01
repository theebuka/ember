"use client";

import { supabaseBrowser } from "@/lib/supabase/client";
import { PUSH_CONFIGURED, VAPID_PUBLIC_KEY } from "@/lib/supabase/config";
import { isIos, isStandalone, notificationState } from "./permission";

/**
 * Server-sent notifications — the half of "autonomous" that was missing.
 *
 * Every alert ember has fired since phase 9 came from a timer in an open tab, so
 * a window that opened overnight was recorded in the inbox and never delivered.
 * §8 has carried that as a stated limit for five phases. A push subscription is
 * what closes it: the browser hands ember an endpoint it can post to later, and
 * `public/sw.js` has had the `push` handler waiting — unreachable, and written
 * anyway so the payload shape would only ever be decided once.
 *
 * **The subscription is written straight to Postgres, not through a route.** It
 * is the user's own row and RLS already permits exactly that, the same way the
 * ledger syncs. An API route in between would add a hop that could only re-check
 * what the database is already checking.
 *
 * **Subscribing *is* the preference.** There is no separate "push enabled"
 * switch, because a switch that can disagree with the browser's own permission
 * is a setting that lies half the time — the same reasoning as decision 046,
 * where permission is asked from the control that needs it.
 */

export type PushState =
  /** No VAPID key configured, or this browser has no `PushManager`. */
  | "unavailable"
  /**
   * A page served over plain HTTP from something other than localhost.
   *
   * Its own state because it is the one a person actually hits, and because it
   * is *fixable* — which `unavailable` implies it is not. Service workers need a
   * secure context, so a phone opening `http://192.168.x.x:3000` has no
   * `navigator.serviceWorker` at all, and push cannot work there in any build.
   * The answer is HTTPS (`npm run dev:https`), and the screen says so rather
   * than showing a switch that quietly refuses.
   */
  | "insecure"
  /**
   * Secure and supported, but nothing has registered a service worker.
   *
   * Which in practice means a development build: `RegisterServiceWorker` skips
   * itself outside production, because a cached shell makes hot reload lie.
   * `NEXT_PUBLIC_EMBER_SW_IN_DEV=1` turns it on when you are working on push and
   * want the cache lying to be your problem rather than the alternative.
   */
  | "no-worker"
  /** Available, and this browser is not subscribed. */
  | "off"
  | "on"
  /** Notification permission is blocked, so a subscription cannot be created. */
  | "blocked";

/** Everything except `off`/`on`: the switch cannot act, and should say why. */
export function isPushBlocked(state: PushState): boolean {
  return state !== "off" && state !== "on";
}

/**
 * The browser needs the VAPID public key as bytes, and it arrives as base64url.
 *
 * `atob` handles standard base64 only, so the two URL-safe substitutions have to
 * be undone and the padding restored. Getting this wrong fails at
 * `pushManager.subscribe` with an opaque `InvalidCharacterError`, which is worth
 * a comment because the error names nothing useful.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  // Backed by an explicit `ArrayBuffer` rather than the inferred `ArrayBufferLike`:
  // `applicationServerKey` will not accept a view that might sit on a
  // `SharedArrayBuffer`, and the inferred type allows for one.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function supported(): boolean {
  return (
    PUSH_CONFIGURED &&
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

/**
 * Why push cannot be offered here, or null.
 *
 * Split out from `supported()` because "no" is not one answer. A reader on an
 * insecure origin and a reader on a browser with no `PushManager` are looking at
 * the same disabled switch for completely different reasons — one of which they
 * can fix in thirty seconds.
 *
 * `isSecureContext` rather than sniffing the protocol: localhost over plain HTTP
 * *is* a secure context by specification, which is exactly the case a protocol
 * check would get wrong and the case every developer is in.
 */
function unavailableBecause(): PushState | null {
  if (typeof window === "undefined") return "unavailable";
  if (!window.isSecureContext) return "insecure";
  if (!supported()) return "unavailable";
  return null;
}

export async function pushState(): Promise<PushState> {
  const blocked = unavailableBecause();
  if (blocked) return blocked;
  if (notificationState() === "denied") return "blocked";

  /**
   * **No registration is `no-worker`, not `unavailable`.**
   *
   * This distinction is load-bearing rather than cosmetic. `subscribeToPush`
   * awaits `navigator.serviceWorker.ready`, and `ready` is a promise that
   * resolves when a worker takes control — so with nothing registered it does
   * not reject, it simply **never settles**. The caller's `finally` never runs,
   * its busy flag stays true, and the switch is left permanently disabled
   * showing a not-allowed cursor. Reported exactly that way: "tapping it changes
   * the cursor to the stop icon and does nothing."
   *
   * That is the worst shape a failure can take here — no error, no toast, no
   * console line, and a control that looks broken rather than unavailable.
   */
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return "no-worker";

  const existing = await registration.pushManager.getSubscription();
  if (!existing) return "off";

  // Re-record on every visit, best effort. A subscribed browser whose row has
  // gone — written by a build before `subscribeToPush` rolled back its
  // failures, or removed server-side after a 410 — is repaired here, and a
  // network failure leaves the answer as the browser has it rather than
  // flipping a working switch off on the strength of a missed request.
  await recordSubscription(existing).catch(() => {});
  return "on";
}

/**
 * A short, human name for this device, for the settings list.
 *
 * Deliberately coarse. The full user agent string is a fingerprint, and the only
 * question this answers is "which of my devices is that" — a phone and a laptop
 * need to be distinguishable and nothing finer is anyone's business.
 */
function deviceLabel(): string {
  if (typeof navigator === "undefined") return "This device";
  if (isIos()) return isStandalone() ? "iPhone or iPad (installed)" : "iPhone or iPad";
  const ua = navigator.userAgent;
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "This device";
}

/**
 * Subscribe this browser, and record it.
 *
 * `userVisibleOnly: true` is not optional — Chrome refuses a subscription
 * without it, and it is also a promise ember means: every push this sends shows
 * a notification. A silent push is a background wake-up, and an app that quietly
 * runs code on your device because a server asked it to is not what was
 * consented to here.
 */
export async function subscribeToPush(): Promise<PushState> {
  const blocked = unavailableBecause();
  if (blocked) return blocked;

  /**
   * Checked **before** the permission prompt, and before `ready`.
   *
   * Before `ready` because that promise never settles without a registration
   * (see `pushState`). Before the prompt because asking the OS for a permission
   * that cannot be used is a question with no good answer: browsers do not offer
   * a second prompt, so a reader who granted it here and got nothing would have
   * spent the one chance ember has to ask.
   */
  const registered = await navigator.serviceWorker.getRegistration();
  if (!registered) return "no-worker";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";

  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  /**
   * **The browser subscription and the row are one fact, so they fail together.**
   *
   * This used to return `"off"` when the row could not be written and leave the
   * browser subscribed — and `pushState()` reads the *browser*, so on the next
   * visit the switch showed on for a device the server had never heard of.
   * Nothing would ever arrive and nothing on screen said so. Now a failed write
   * unsubscribes again before reporting. Permission is untouched by that: it
   * belongs to the origin, not to the subscription, so trying again asks nothing.
   */
  try {
    await recordSubscription(subscription);
  } catch (error) {
    await subscription.unsubscribe().catch(() => {});
    throw error;
  }
  return "on";
}

/** Why a subscription could not be completed, in a sentence the toast can show. */
export class PushError extends Error {}

/**
 * Write this browser's subscription against the signed-in account.
 *
 * Upserted on the endpoint, which *is* a subscription's identity: a browser
 * reissues the same endpoint for the same installation, so this is idempotent
 * — which is what lets `pushState` call it on every visit to repair a row that
 * went missing, rather than trusting that the two halves still agree.
 */
async function recordSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  const keys = json.keys ?? {};
  if (!json.endpoint || !keys.p256dh || !keys.auth) {
    throw new PushError("Your browser didn't finish setting up push. Try again.");
  }

  const supabase = supabaseBrowser();
  if (!supabase) throw new PushError("Accounts aren't available in this version of ember.");

  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new PushError("Sign in to turn on push.");

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      endpoint: json.endpoint,
      user_id: data.user.id,
      p256dh: keys.p256dh,
      // Not `auth`: that column name would collide with the `auth` schema
      // `auth.uid()` lives in. See the migration.
      auth_secret: keys.auth,
      label: deviceLabel(),
    },
    { onConflict: "endpoint" },
  );
  if (error) throw new PushError(`It couldn't be saved: ${error.message}`);
}

/**
 * Unsubscribe this browser, and forget it.
 *
 * Both halves, in that order. Dropping the row while leaving the browser
 * subscribed would leave an endpoint nobody sends to — harmless — but dropping
 * the browser's subscription while leaving the row would leave the sender posting
 * to a dead endpoint until it 410s, which is a slower and noisier way to reach
 * the same place.
 */
export async function unsubscribeFromPush(): Promise<PushState> {
  const blocked = unavailableBecause();
  if (blocked) return blocked;

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return "off";

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  const supabase = supabaseBrowser();
  if (supabase) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  }
  return "off";
}
