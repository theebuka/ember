/**
 * Whether the user has been through setup — mirrored into a cookie.
 *
 * The authoritative flag is `hasOnboarded` in the preferences store, which
 * lives in `localStorage`. That's the right home for it: it belongs with every
 * other preference, and it moves to the account row when auth lands.
 *
 * But `localStorage` is unreadable on the server, so a first-run redirect
 * driven by it can only happen after hydration — which means rendering the
 * dashboard, then yanking it away. That flash is exactly the kind of seam the
 * app is trying not to have, and on a deep link it's worse: you'd watch the
 * page you asked for load and then vanish.
 *
 * So completion is *also* written to a cookie, and `middleware.ts` reads it
 * before anything renders. The cookie is a cache of the store's flag, never
 * the source of truth, which is what makes the divergence cases recoverable:
 *
 *   **Cookie missing, store says onboarded** — someone who set ember up before
 *   this existed, or whose cookie expired. Middleware sends them to
 *   `/onboarding`, which sees the store flag, rewrites the cookie and bounces
 *   them straight back. Self-healing, one frame.
 *
 *   **Cookie present, store cleared** — they wiped their data. "Reset
 *   everything" clears both, so the only way here is clearing site data
 *   partially, and the dashboard's empty state already handles a bare book.
 *
 *   **The cookie cannot be written at all** — the case that isn't recoverable,
 *   and the one that used to trap people. `document.cookie =` is a silent
 *   no-op under restricted storage: an in-app webview, iOS "Block all
 *   cookies", some managed profiles. The store still persists, so the
 *   self-heal above fires, redirects, gets bounced by the proxy, and fires
 *   again — a loop that survives reload and reads as every button being dead.
 *   That's why the write is now verified by reading it back, and why nothing
 *   navigates into the gate without proof it will be let through.
 */

export const ONBOARDED_COOKIE = "ember_onboarded";

/** A year. Long enough that expiry is a rounding error against churn. */
const MAX_AGE = 60 * 60 * 24 * 365;

/** Whether the gate cookie is present and readable right now. */
export function hasOnboardedCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((pair) => pair.trim() === `${ONBOARDED_COOKIE}=1`);
}

/**
 * Write the gate cookie, and report whether it stuck.
 *
 * The return value is the whole point. A caller that redirects on the strength
 * of an unverified write is redirecting into `proxy.ts`, which reads the real
 * cookie jar and will send them straight back here.
 */
export function writeOnboardedCookie(): boolean {
  if (typeof document === "undefined") return false;
  document.cookie = `${ONBOARDED_COOKIE}=1; path=/; max-age=${MAX_AGE}; samesite=lax`;
  return hasOnboardedCookie();
}

export function clearOnboardedCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${ONBOARDED_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/**
 * A `?next=` value that is safe to redirect to.
 *
 * Only same-origin absolute paths. `//evil.example` is a protocol-relative URL
 * that browsers happily treat as another host, and a redirect parameter that
 * accepts one is an open redirect — small surface, but a real one, and it
 * costs two characters to close.
 */
export function safeNext(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.startsWith("/onboarding")) return null;
  return value;
}
