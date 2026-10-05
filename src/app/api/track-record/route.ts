import { NextResponse, type NextRequest } from "next/server";
import { parseRiskProfile } from "@/lib/api/server";
import type { RiskProfile } from "@/lib/api/types";
import { getProvider } from "@/lib/market/providers";
import { runBacktest, type BacktestResult } from "@/lib/signals/backtest";
import { loadUniverse } from "@/lib/signals/context";

export const dynamic = "force-dynamic";

/**
 * The track record — walk-forward output from the same engine the feed uses.
 *
 * Not authored, not stored, not adjusted. `runBacktest` re-runs `assess()` over
 * truncated history and reports what comes out, including the losers. If the
 * strategies are bad, this route says they are bad (CLAUDE.md §5).
 */

/**
 * A day-long cache.
 *
 * A full walk-forward run is ~400ms across the universe, which is fine once
 * and wasteful on every page view. The daily bar grid only rolls once a day,
 * so the answer genuinely cannot change more often than that — the cache key
 * is the UTC day rather than a duration.
 */
const DAY = 86_400_000;
const cache = new Map<string, BacktestResult>();

function backtestFor(riskProfile: RiskProfile, at: number): BacktestResult | null {
  return cache.get(`${riskProfile}:${Math.floor(at / DAY)}`) ?? null;
}

export async function GET(request: NextRequest) {
  const riskProfile = parseRiskProfile(request.nextUrl.searchParams.get("profile"));
  const symbol = request.nextUrl.searchParams.get("symbol");
  const at = Date.now();
  const key = `${riskProfile}:${Math.floor(at / DAY)}`;

  let result = backtestFor(riskProfile, at);

  if (!result) {
    const provider = getProvider();
    const universe = await loadUniverse(provider, at);
    result = runBacktest({ universe, riskProfile, synthetic: provider.synthetic });

    // Only today's runs are worth holding; the grid rolls and yesterday's key
    // can never be asked for again.
    if (cache.size > 6) cache.clear();
    cache.set(key, result);
  }

  // One instrument's past calls, for its asset page. The whole record is
  // ~1.2 MB of trades; the page needs the handful that are about it.
  if (symbol) {
    return NextResponse.json({
      trades: result.trades.filter((trade) => trade.symbol === symbol),
      riskProfile,
      at,
      synthetic: getProvider().synthetic,
    });
  }

  return NextResponse.json({
    ...result,
    riskProfile,
    at,
    synthetic: getProvider().synthetic,
  });
}
