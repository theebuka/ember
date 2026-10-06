import { NextResponse, type NextRequest } from "next/server";
import { AUTH_CONFIGURED, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

/**
 * One-click unsubscribe (RFC 8058), for the mail client's own button.
 *
 * The digest's `List-Unsubscribe` header points here with
 * `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, so Gmail, Apple Mail and
 * Outlook show an unsubscribe control beside the sender and POST to this URL
 * when it is pressed. It pointed at the `/unsubscribe` *page* before, and a page
 * cannot answer a POST — so the header promised a one-click unsubscribe that
 * did nothing, which large providers now penalise as well as being untrue.
 *
 * Same privilege as the page: `unsubscribe_digest(token)`, the `security
 * definer` function granted to `anon` (0004). No session, no service-role key,
 * and the answer never says whether the token existed.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!AUTH_CONFIGURED || !UUID.test(token)) {
    return new NextResponse(null, { status: 400 });
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/unsubscribe_digest`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ token }),
    cache: "no-store",
  }).catch(() => null);

  return new NextResponse(null, { status: response?.ok ? 200 : 502 });
}

/** A person who opens the header's link in a browser gets the page. */
export function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/unsubscribe";
  return NextResponse.redirect(url, 303);
}
