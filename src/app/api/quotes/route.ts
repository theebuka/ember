import { NextResponse, type NextRequest } from "next/server";
import { parseSymbols } from "@/lib/api/server";
import { getProvider } from "@/lib/market/providers";

export const dynamic = "force-dynamic";

/** `?symbols=AAPL,BTC` — omit to quote the whole universe. */
export async function GET(request: NextRequest) {
  const provider = getProvider();
  const requested = parseSymbols(request.nextUrl.searchParams.get("symbols"));

  const symbols = requested ?? provider.listInstruments().map((i) => i.symbol);
  const at = Date.now();

  return NextResponse.json({
    quotes: await provider.getQuotes(symbols, at),
    at,
    synthetic: provider.synthetic,
  });
}
