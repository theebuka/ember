import type { Candle } from "@/lib/api/types";
import { ema } from "@/lib/signals/indicators/moving-averages";
import { latest, stdev } from "@/lib/signals/indicators/stats";
import type { InstrumentSpec } from "@/lib/market/universe";
import type { OnChainMetrics } from "../types";

/**
 * On-chain valuation metrics, derived from the generated price path.
 *
 * Realised capitalisation prices every coin at the moment it last moved,
 * which makes it a proxy for the aggregate cost basis of everyone holding.
 * A long exponential average of market cap is a reasonable stand-in for that
 * with price data alone: it weights recent prices more heavily, exactly as
 * realised cap does, because recently-moved coins dominate the average.
 *
 * The Z-score is then the published construction — the market/realised spread
 * normalised by the standard deviation of market cap.
 *
 * A real feed replaces this with Glassnode or an equivalent. The shape is
 * right; the values are downstream of a synthetic price path.
 */
export function generateOnChain(
  spec: InstrumentSpec,
  candles: readonly Candle[],
): OnChainMetrics | null {
  if (spec.market !== "crypto" || !spec.supply) return null;
  if (candles.length < 260) return null;

  const marketCaps = candles.map((c) => c.c * spec.supply!);

  const realizedCap = latest(ema(marketCaps, 200));
  if (realizedCap === null) return null;

  const marketCap = marketCaps[marketCaps.length - 1];

  const dispersion = stdev(marketCaps.slice(-365));
  const mvrvZ = dispersion && dispersion > 0 ? (marketCap - realizedCap) / dispersion : 0;

  return { marketCap, realizedCap, mvrvZ };
}
