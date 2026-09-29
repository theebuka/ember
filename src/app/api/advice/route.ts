import { NextResponse, type NextRequest } from "next/server";
import { getAdvice, parseRiskProfile, trimAdvice } from "@/lib/api/server";

export const dynamic = "force-dynamic";

/**
 * `?profile=balanced`
 *
 * Every read the profile clears, plus the strongest of the rest — holds
 * included, because "we looked and there's nothing here" is only credible if
 * the user can go and see the looking.
 *
 * **The tail is trimmed.** At thirteen instruments this route returned the
 * whole universe in 82 KB, most of it the 72-point window curve carried on
 * each assessment; at a hundred that is well over half a megabyte for a screen
 * nobody scrolls to the end of. `trimAdvice` keeps the top of the ranking and
 * reports how many were assessed, so the feed's honesty about the size of the
 * search survives the trim. Anything clearing the bar is kept regardless of
 * where it lands in the ranking — a page limit that could hide a
 * recommendation would be a bug, not a budget.
 *
 * The asset page asks `/api/asset` for one symbol and is unaffected.
 */
export async function GET(request: NextRequest) {
  const riskProfile = parseRiskProfile(request.nextUrl.searchParams.get("profile"));
  return NextResponse.json(trimAdvice(await getAdvice(riskProfile)));
}
