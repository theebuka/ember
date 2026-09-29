"use client";

/**
 * The browser's notification permission, as a thing the UI can reason about.
 *
 * Two rules shape everything here.
 *
 * **Ask in context, once.** `Notification.requestPermission()` may only be
 * called from a user gesture, and a browser that has been told "block" will
 * never show the prompt again — there is no second chance and no way to
 * un-deny from JavaScript. So ember asks from the switch the user just turned
 * on, never on load, and treats `denied` as a state to explain rather than a
 * failure to retry.
 *
 * **`unsupported` is not `denied`.** On iOS, `Notification` exists only inside
 * an installed PWA; in Safari proper it isn't there at all. Telling that user
 * "you've blocked notifications" would be false and would send them hunting
 * through settings that don't contain the answer. They need "add ember to your
 * home screen", which is a different sentence.
 */

export type PermissionState =
  /** No Notification API here at all — iOS Safari, or an old browser. */
  | "unsupported"
  /** Never asked. The prompt is still available. */
  | "default"
  | "granted"
  /** Blocked. The browser will not ask again; only the user can undo it. */
  | "denied";

export function notificationState(): PermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission as PermissionState;
}

/**
 * iOS, where "unsupported" has a fix the user can actually apply.
 *
 * Deliberately a hint, not a gate: the copy it selects is advice, and being
 * wrong about the platform costs a slightly odd sentence rather than a broken
 * flow. iPadOS reports itself as a Mac, hence the touch-point check.
 */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

/** True when the app is running from the home screen rather than in a tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    // Safari's own, non-standard flag.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Ask, from a user gesture.
 *
 * Returns the resulting state rather than a boolean so the caller can tell
 * "they said no" from "they dismissed the prompt" — Chrome reports the second
 * as `default`, and it is worth not treating a shrug as a refusal.
 */
export async function requestPermission(): Promise<PermissionState> {
  if (notificationState() === "unsupported") return "unsupported";
  try {
    return (await Notification.requestPermission()) as PermissionState;
  } catch {
    // Safari once took a callback rather than returning a promise. If the
    // request throws for any reason, report what we can still observe.
    return notificationState();
  }
}

/* ── Delivery ──────────────────────────────────────────────────────────── */

export interface AlertPayload {
  title: string;
  body: string;
  /** Replaces an earlier alert with the same tag instead of stacking. */
  tag: string;
  /** Where a click should land. */
  url: string;
}

/**
 * Show a notification, through the service worker where there is one.
 *
 * Android Chrome refuses `new Notification()` outright and requires
 * `registration.showNotification`, which is also what lets a click be handled
 * by `sw.js` and focus an already-open tab rather than opening a second copy
 * of the app. The constructor is the fallback for desktop Safari and for
 * development, where the worker is deliberately not registered.
 */
export async function showAlert(payload: AlertPayload): Promise<boolean> {
  if (notificationState() !== "granted") return false;

  const options: NotificationOptions & { renotify?: boolean } = {
    body: payload.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag,
    renotify: true,
    data: { url: payload.url },
  };

  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(payload.title, options);
      return true;
    }
  } catch {
    // Fall through to the constructor.
  }

  try {
    const notification = new Notification(payload.title, options);
    notification.onclick = () => {
      window.focus();
      window.location.assign(payload.url);
      notification.close();
    };
    return true;
  } catch {
    return false;
  }
}
