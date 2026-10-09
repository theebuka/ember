import { NextResponse, type NextRequest } from "next/server";
import { getSeries, parseRange, parseSymbols } from "@/lib/api/server";
import type { Series } from "@/lib/api/types";
import { getProvider } from "@/lib/market/providers";
import { requestPlan } from "@/lib/api/plan-server";
import { rangeAllowed } from "@/lib/plan";

export const dynamic = "force-dynamic";

/**
 * `?symbols=AAPL,BTC&range=1M`
 *
 * Plural by design. The dashboard's value chart needs every held symbol at
 * once, and a request per symbol would mean the chart renders in pieces as
 * each lands — the layout shift the UX bar rules out.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const range = parseRange(params.get("range"));
  const requested = parseSymbols(params.get("symbols"));

  if (!requested) {
    return NextResponse.json(
      { error: "Pass at least one symbol: /api/series?symbols=AAPL&range=1M" },
      { status: 400 },
    );
  }

  // Free charts a month (PLAN_RULES). Refused here rather than only locked on
  // screen, so a longer range isn't one request away.
  if (!rangeAllowed(range, await requestPlan())) {
    return NextResponse.json({ error: "Pro charts this range.", locked: true }, { status: 403 });
  }

  const provider = getProvider();
  const bySymbol = new Map(provider.listInstruments().map((i) => [i.symbol, i]));

  const known = requested.filter((symbol) => bySymbol.has(symbol));
  if (known.length === 0) {
    return NextResponse.json(
      { error: `Unknown symbol${requested.length > 1 ? "s" : ""}: ${requested.join(", ")}` },
      { status: 404 },
    );
  }

  const series: Series[] = await Promise.all(
    known.map(async (symbol) => ({
      symbol,
      range,
      candles: await getSeries(symbol, range, bySymbol.get(symbol)!.market),
    })),
  );

  return NextResponse.json({ series, at: Date.now(), synthetic: provider.synthetic });
}
