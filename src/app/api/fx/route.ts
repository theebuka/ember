import { NextResponse } from "next/server";
import { getProvider } from "@/lib/market/providers";

export const dynamic = "force-dynamic";

/** USD per one unit of each currency, for converting the book into its base. */
export async function GET() {
  const provider = getProvider();

  return NextResponse.json({
    rates: await provider.getConversionRates(),
    at: Date.now(),
    synthetic: provider.synthetic,
  });
}
