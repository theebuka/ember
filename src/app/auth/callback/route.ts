import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { safeNext } from "@/lib/onboarding";

/**
 * Where the magic link lands.
 *
 * The link carries a one-time `code`; this exchanges it for a session and sets
 * the cookies. A route handler rather than a page because it is the one
 * context that can both read the query string and *write* cookies — a Server
 * Component can do the exchange and then silently fail to persist it, which
 * looks to the user like a link that did nothing.
 *
 * `safeNext` is the same guard `/onboarding` uses: the destination arrives in
 * a query parameter on a URL that was sent by email, so it is attacker-
 * controlled, and redirecting to whatever it says is an open redirect on a URL
 * users are told to trust.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next")) ?? "/settings";

  if (!code) {
    // Supabase sometimes reports a dead link in the query rather than the
    // fragment; pass its reason on so the page can say which it was.
    const reason = url.searchParams.get("error_code") ?? "missing-code";
    return NextResponse.redirect(
      new URL(`/auth?error=${encodeURIComponent(reason)}`, url.origin),
    );
  }

  const supabase = await supabaseServer();
  if (!supabase) {
    return NextResponse.redirect(new URL("/settings", url.origin));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // Expired, already used, or issued by a different project. All three are
    // the same sentence to the user, and the sign-in screen says it.
    return NextResponse.redirect(new URL("/auth?error=link", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
