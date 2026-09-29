import { hashString, mulberry32 } from "@/lib/market/random";
import type { InstrumentSpec } from "@/lib/market/universe";
import type { Fundamentals } from "@/lib/signals/types";

/**
 * Synthetic company financials.
 *
 * These are **not** real filings. They exist so the Piotroski and Magic
 * Formula strategies have something structurally correct to chew on — the
 * methodology page says so plainly, and SEC EDGAR replaces this entirely
 * (free, official, unlimited) when live data goes on.
 *
 * The generator is built around a single seeded `quality` factor per company
 * rather than random numbers per field. That matters: F-Score tests are
 * correlated in reality — a company improving its margins is usually also
 * paying down debt and converting earnings to cash — and independently random
 * fields would give every company a score near 4.5 and make the strategy look
 * like it does nothing. One latent factor produces a realistic spread.
 */
export function generateFundamentals(spec: InstrumentSpec): Fundamentals | null {
  if (spec.market !== "equity") return null;

  const rng = mulberry32(hashString(`${spec.symbol}:fundamentals:v1`));

  /** The latent factor. Near 1 is a strengthening business, near 0 isn't. */
  const quality = rng();
  /** Centred so roughly half the "improving" tests pass across the universe. */
  const baseTrend = quality - 0.45;

  /**
   * The latent factor with idiosyncratic noise, drawn fresh per metric.
   *
   * Real companies improve on some measures while slipping on others, and
   * driving all nine tests from `quality` alone makes them perfectly
   * correlated — every company lands on 0 or 9.
   *
   * **The noise has to be large relative to the signal, or it does nothing.**
   * A first attempt used `baseTrend + (rng() - 0.5) * 0.45`, and because
   * `baseTrend` spans ±0.5 the jitter could never flip a test for any company
   * away from the middle of the quality range: four of six still scored a
   * clean sweep. Damping the latent shift and widening the jitter keeps the
   * correlation — good businesses still score well — while letting individual
   * tests genuinely disagree, which is what an F-Score distribution actually
   * looks like.
   */
  const trendFor = () => baseTrend * 0.6 + (rng() - 0.5) * 0.9;

  const revenue = 20e9 + rng() * 180e9;
  const revenueGrowth = -0.04 + quality * 0.24;
  const revenuePrior = revenue / (1 + revenueGrowth);

  const grossMargin = 0.3 + quality * 0.35;
  const grossProfit = revenue * grossMargin;
  const grossProfitPrior = revenuePrior * (grossMargin - trendFor() * 0.03);

  const netMargin = 0.04 + quality * 0.24;
  const netIncome = revenue * netMargin;
  const netIncomePrior = revenuePrior * (netMargin - trendFor() * 0.02);

  // Earnings quality: strong businesses convert profit to cash and then some;
  // weak ones report profit they haven't collected.
  const operatingCashFlow = netIncome * (0.95 + trendFor() * 0.6);

  const totalAssets = revenue * (0.9 + rng() * 1.4);
  const assetGrowth = 0.02 + rng() * 0.08;
  const totalAssetsPrior = totalAssets / (1 + assetGrowth);

  const leveragePrior = 0.12 + rng() * 0.28;
  const leverage = leveragePrior * (1 - trendFor() * 0.3);
  const longTermDebt = leverage * totalAssets;
  const longTermDebtPrior = leveragePrior * totalAssetsPrior;

  const currentLiabilities = totalAssets * 0.24;
  const currentLiabilitiesPrior = totalAssetsPrior * 0.24;
  const currentRatioPrior = 1 + rng() * 1.2;
  const currentRatio = currentRatioPrior * (1 + trendFor() * 0.25);
  const currentAssets = currentRatio * currentLiabilities;
  const currentAssetsPrior = currentRatioPrior * currentLiabilitiesPrior;

  // Strong businesses buy stock back; weak ones issue it to fund themselves.
  const sharesOutstandingPrior = 1e9 + rng() * 1.4e10;
  const sharesOutstanding = sharesOutstandingPrior * (1 - trendFor() * 0.05);

  const ebit = revenue * netMargin * 1.35;

  // Enterprise value and operating capital are derived backwards from target
  // ratios rather than built up from a balance sheet. The Magic Formula only
  // reads earnings yield and return on capital, and deriving them this way
  // guarantees both land in a realistic range and spread across the universe
  // — which is what the ranking needs to mean anything.
  const earningsYield = 0.03 + rng() * 0.08;
  const returnOnCapital = 0.1 + rng() * 0.45;

  const enterpriseValue = ebit / earningsYield;
  const capital = ebit / returnOnCapital;
  const netWorkingCapital = capital * (0.2 + rng() * 0.3);
  const netFixedAssets = capital - netWorkingCapital;

  return {
    netIncome,
    netIncomePrior,
    operatingCashFlow,
    totalAssets,
    totalAssetsPrior,
    longTermDebt,
    longTermDebtPrior,
    currentAssets,
    currentLiabilities,
    currentAssetsPrior,
    currentLiabilitiesPrior,
    sharesOutstanding,
    sharesOutstandingPrior,
    grossProfit,
    grossProfitPrior,
    revenue,
    revenuePrior,
    ebit,
    netWorkingCapital,
    netFixedAssets,
    enterpriseValue,
  };
}
