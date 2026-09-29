import { NextResponse } from "next/server";
import { getNews } from "@/lib/api/server";

export const dynamic = "force-dynamic";

/**
 * Headlines and the trending strip.
 *
 * No query parameters. The "your assets" filter is applied in the browser
 * against the same feed, because the alternative is sending the user's held
 * and watched symbols to a route that has no need for them — and phase 15
 * spent the only exception to that rule that this app gets (ADR 0025).
 * Filtering a page of headlines client-side costs nothing.
 */
export async function GET() {
  return NextResponse.json(await getNews());
}
