import { NextResponse, type NextRequest } from "next/server";
import { ONBOARDED_COOKIE } from "@/lib/onboarding";
import { refreshSession } from "@/lib/supabase/proxy";

/**
 * First run goes to setup, before anything paints.
 *
 * The alternative — a `useEffect` that redirects once the persisted store has
 * hydrated — renders the dashboard, gets it wrong, and takes it back. On a
 * deep link it's worse still. Reading a cookie at the edge means the very
 * first byte the browser gets is already the right page.
 *
 * The intended destination rides along in `?next=`, so a shared link to an
 * asset page survives setup instead of dumping the user on the home screen
 * having forgotten what they came for. See `lib/onboarding.ts` for why the
 * cookie is a mirror of the store rather than the source of truth.
 *
 * Lives in `proxy.ts`, not `middleware.ts` — Next 16 renamed the convention
 * and warns on the old filename.
 */
/**
 * Pages a stranger is allowed to read without setting anything up.
 *
 * The methodology and the track record are ember's public argument: every
 * rule, every citation, and the computed record of whether any of it worked.
 * They contain nothing personal, they are the pages you would send someone,
 * and sending a reader to a three-step setup flow instead is both a bad
 * welcome and — found by Lighthouse in phase 10 — the reason a crawler
 * couldn't reach a single page of the app.
 */
const PUBLIC_PATHS = [
  "/signals/methodology",
  "/signals/track-record",
  /**
   * Unsubscribe, and it has to be the most exempt route in the app.
   *
   * The person clicking it may have no cookie, no session and no intention of
   * ever opening ember again — that is rather the point. A link that answered
   * with a setup flow would be an unsubscribe link that does not unsubscribe,
   * which is the kind of thing regulators and mail providers both take a dim
   * view of, and which is dishonest regardless of who is watching.
   */
  "/unsubscribe",
];

/**
 * Routes the first-run gate must not swallow.
 *
 * `/auth` is where the magic link lands, and it arrives with a one-time code
 * in the query string. Redirecting it to `/onboarding?next=…` would consume
 * that code — the link is single-use — so the user would follow a valid link
 * and be told it had expired, with no way to tell that from a real expiry.
 */
const AUTH_PREFIX = "/auth";

/**
 * The post-sign-in personalisation flow.
 *
 * Someone reaches it by creating an account *from* onboarding, so they do not
 * have the first-run cookie yet — and without this exemption the gate would
 * redirect them to `/onboarding?next=/welcome`, which is the screen they just
 * left, immediately after the one action that proves they are not a stranger.
 * The flow writes the cookie itself when it finishes or is skipped.
 */
const WELCOME_PREFIX = "/welcome";

export default async function proxy(request: NextRequest) {
  /**
   * Session first, gate second, and the order matters.
   *
   * The refresh has to happen on every request that reaches a page, including
   * the ones this function is about to redirect — a user whose token expired
   * while they were away would otherwise be bounced to setup and only *then*
   * refreshed, having already rendered as a stranger.
   */
  const refreshed = await refreshSession(request);
  const passthrough = () => refreshed ?? NextResponse.next();

  if (request.nextUrl.pathname.startsWith(AUTH_PREFIX)) return passthrough();
  if (request.nextUrl.pathname.startsWith(WELCOME_PREFIX)) return passthrough();
  if (request.cookies.has(ONBOARDED_COOKIE)) return passthrough();
  if (PUBLIC_PATHS.includes(request.nextUrl.pathname)) return passthrough();

  const url = request.nextUrl.clone();
  const intended = `${url.pathname}${url.search}`;

  url.pathname = "/onboarding";
  url.search = intended === "/" ? "" : `?next=${encodeURIComponent(intended)}`;

  /**
   * The refresh above only matters if its cookies reach the browser, and a
   * fresh redirect response carries none. They were being dropped here — the
   * one path the comment at the top of this function says the refresh exists
   * for — so a rotated token was computed and thrown away.
   */
  const redirect = NextResponse.redirect(url);
  for (const cookie of refreshed?.cookies.getAll() ?? []) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export const config = {
  /**
   * Pages only.
   *
   * API routes are excluded because a JSON fetch answered with a 307 to an
   * HTML page is a parse error rather than a redirect, and `/onboarding`
   * itself is excluded for the obvious reason. The static assets listed are
   * the ones served from `public/` — the service worker and the offline shell
   * especially, since they are fetched when there is no session to speak of.
   */
  matcher: [
    // `robots.txt` and `sitemap.xml` are excluded for the same reason as the
    // API: a crawler answered with a 307 to a setup page learns nothing, and
    // an unreachable robots.txt is a validation failure in its own right.
    //
    // `splash/` is the iOS launch bitmaps. iOS fetches them *before* the app
    // has a session of any kind, so a first-run redirect on that path means
    // the launch screen this app went to some trouble to add would 307 to
    // `/onboarding` and never render.
    "/((?!api/|_next/|icons/|splash/|onboarding|manifest\\.webmanifest|sw\\.js|offline\\.html|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
  ],
};
