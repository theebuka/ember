/**
 * Whether there is a backend at all.
 *
 * **Accounts are optional, and that is the same decision ADR 0007 made about
 * market data.** ember has always been fully usable with no API keys: the mock
 * provider means the whole product works before a single credential exists,
 * and turning on real data is a config change rather than a code change. Auth
 * gets the identical treatment — with no Supabase project configured the app
 * behaves exactly as it did before this existed, storing everything in
 * `localStorage`, and nothing anywhere renders a sign-in control for a service
 * that isn't there.
 *
 * That is not only about developer convenience. CLAUDE.md §7 rules out spend
 * before revenue, and a free-tier Supabase project sleeps; an app that hard
 * -requires one is an app that is down when the project is paused. Local-first
 * with optional sync degrades to "your ledger is on this device", which is
 * where it started and is a state the product already knows how to describe.
 *
 * Both values are safe in the browser bundle by design — the anon key is
 * public and is what row-level security exists to make safe. **The service
 * role key must never appear in this file or any file under `src/`**; nothing
 * in ember needs it, because every table is reached as the signed-in user.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Read at module scope, so it is inlined at build time and a bundle built
 * without credentials cannot be talked into thinking it has them.
 */
export const AUTH_CONFIGURED = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

/**
 * The one place that knows what a signed-in ember account is allowed to hold.
 *
 * Deliberately narrow, and it is the same list ADR 0025 spent a privacy
 * property on for `/api/findings` — plus the ledger itself, which is the whole
 * reason accounts exist. What is *not* here is as considered as what is:
 * no analytics, no device fingerprint, no derived P&L, no engine output. The
 * server stores what it needs to hand your book back to you on another
 * device, and works everything else out from scratch each time.
 */
export const STORED_TABLES = [
  "profiles",
  "transactions",
  "preferences",
  "watchlist",
  // Phase 26. Both are about *reaching* you rather than about your money, and
  // both are narrow on purpose: a push subscription is an endpoint and two
  // opaque keys, and `email_prefs` holds no address — the sender resolves that
  // from `auth.users` at send time rather than keeping a second copy of
  // everyone's email in a table.
  "push_subscriptions",
  "email_prefs",
] as const;

/**
 * The VAPID public key, for subscribing this browser to push.
 *
 * Public by design and by name: it is the identity a push service checks a
 * signed request against, and it is useless without the private half — which
 * lives only in the scheduler's secrets, never in this bundle and never under
 * `src/`. Same shape of claim as the anon key above.
 */
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/**
 * Read at module scope so it is inlined at build time.
 *
 * Push needs *both* halves of the stack — a key to subscribe with and an account
 * to attach the subscription to — so a project with auth and no VAPID key, or a
 * key and no project, offers nothing rather than a control that fails on press.
 */
export const PUSH_CONFIGURED = AUTH_CONFIGURED && VAPID_PUBLIC_KEY.length > 0;
