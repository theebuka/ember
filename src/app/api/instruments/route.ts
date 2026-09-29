import { NextResponse } from "next/server";
import { getProvider } from "@/lib/market/providers";

export const dynamic = "force-dynamic";

/**
 * The tradeable universe.
 *
 * `synthetic` travels with it deliberately. Every screen that shows a price
 * has to be able to say where it came from, and burying that in a build flag
 * would make "these are generated prices" something the UI could forget to
 * mention. See CLAUDE.md §8.
 */
export async function GET() {
  const provider = getProvider();

  return NextResponse.json({
    instruments: provider.listInstruments(),
    synthetic: provider.synthetic,
    providerId: provider.id,
  });
}
