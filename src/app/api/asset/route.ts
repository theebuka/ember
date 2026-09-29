import { NextResponse, type NextRequest } from "next/server";
import { getAdvice, parseRiskProfile } from "@/lib/api/server";
import type { AssetMetricGroup, Candle } from "@/lib/api/types";
import { getProvider } from "@/lib/market/providers";
import {
  fxLegs,
  INSTRUMENT_BY_SYMBOL,
  periodsPerYearFor,
  POLICY_RATES,
  toInstrument,
} from "@/lib/market/universe";
import { realizedVolatility } from "@/lib/signals/indicators/volatility";
import { latest } from "@/lib/signals/indicators/stats";

export const dynamic = "force-dynamic";

/**
 * Everything the asset page needs, in one request.
 *
 * The metrics are deliberately **the inputs the strategies actually read**,
 * not a generic tile grid. On an equity they are the Piotroski and Magic
 * Formula terms; on a crypto they are the MVRV terms; on a pair they are the
 * two policy rates behind carry. That means a user who reads a rationale on
 * the advice card can come here and check the number it was derived from —
 * which is the whole argument of the product, applied to one screen.
 */

function trailing(candles: readonly Candle[], bars: number): Candle[] {
  return candles.slice(-bars);
}

function priceStats(candles: readonly Candle[], periodsPerYear: number) {
  const year = trailing(candles, periodsPerYear);
  const closes = candles.map((c) => c.c);
  const vol = latest(realizedVolatility(closes, 20, periodsPerYear));

  return {
    high: Math.max(...year.map((c) => c.h)),
    low: Math.min(...year.map((c) => c.l)),
    volatility: vol ?? 0,
    averageVolume:
      year.length === 0
        ? 0
        : year.reduce((acc, c) => acc + c.v, 0) / year.length,
  };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const symbol = (params.get("symbol") ?? "").toUpperCase();
  const riskProfile = parseRiskProfile(params.get("profile"));

  const spec = INSTRUMENT_BY_SYMBOL.get(symbol);
  if (!spec) {
    return NextResponse.json(
      { error: `ember doesn't follow ${symbol || "that symbol"}.` },
      { status: 404 },
    );
  }

  const provider = getProvider();
  const at = Date.now();

  const [quote, candles, fundamentals, onchain, advice] = await Promise.all([
    provider.getQuote(symbol, at),
    provider.getCandles(symbol),
    provider.getFundamentals(symbol),
    provider.getOnChain(symbol),
    // Reuses the feed's cached assessment rather than re-running the engine,
    // so the read shown here is character-for-character the one on the feed.
    getAdvice(riskProfile),
  ]);

  const periodsPerYear = periodsPerYearFor(spec.market);
  const stats = priceStats(candles, periodsPerYear);

  const groups: AssetMetricGroup[] = [
    {
      title: "Price",
      metrics: [
        { key: "high", label: "52-week high", value: stats.high, format: "price" },
        { key: "low", label: "52-week low", value: stats.low, format: "price" },
        {
          key: "vol",
          label: "Volatility",
          value: stats.volatility,
          format: "percent",
          hint: "annualised, 20-day",
        },
        ...(spec.baseVolume > 0
          ? [
              {
                key: "volume",
                label: "Average volume",
                value: stats.averageVolume,
                format: "compact" as const,
                hint: "past year",
              },
            ]
          : []),
      ],
    },
  ];

  if (fundamentals) {
    const f = fundamentals;
    groups.push({
      title: "Fundamentals",
      note: "The figures behind the Piotroski F-Score and the Magic Formula. Generated in this build, not filed — SEC EDGAR replaces them when live data goes on.",
      metrics: [
        { key: "revenue", label: "Revenue", value: f.revenue, format: "compactMoney" },
        {
          key: "revenue-growth",
          label: "Revenue growth",
          value: f.revenue / f.revenuePrior - 1,
          format: "percent",
          hint: "year on year",
        },
        {
          key: "gross-margin",
          label: "Gross margin",
          value: f.grossProfit / f.revenue,
          format: "percent",
        },
        {
          key: "net-margin",
          label: "Net margin",
          value: f.netIncome / f.revenue,
          format: "percent",
        },
        {
          key: "roa",
          label: "Return on assets",
          value: f.netIncome / f.totalAssets,
          format: "percent",
        },
        {
          key: "earnings-yield",
          label: "Earnings yield",
          value: f.ebit / f.enterpriseValue,
          format: "percent",
          hint: "EBIT / enterprise value",
        },
        {
          key: "roc",
          label: "Return on capital",
          value: f.ebit / (f.netWorkingCapital + f.netFixedAssets),
          format: "percent",
        },
        {
          key: "leverage",
          label: "Long-term debt",
          value: f.longTermDebt / f.totalAssets,
          format: "percent",
          hint: "of total assets",
        },
        {
          key: "current-ratio",
          label: "Current ratio",
          value: f.currentAssets / f.currentLiabilities,
          format: "ratio",
        },
        {
          key: "cash-conversion",
          label: "Cash conversion",
          value: f.operatingCashFlow / f.netIncome,
          format: "ratio",
          hint: "operating cash flow / net income",
        },
      ],
    });
  }

  if (onchain) {
    groups.push({
      title: "On-chain",
      note: "The terms behind the MVRV Z-score. Derived from the generated price path in this build, not read from a chain.",
      metrics: [
        {
          key: "market-cap",
          label: "Market cap",
          value: onchain.marketCap,
          format: "compactMoney",
        },
        {
          key: "realized-cap",
          label: "Realised cap",
          value: onchain.realizedCap,
          format: "compactMoney",
          hint: "holders' aggregate cost basis",
        },
        {
          key: "mvrv",
          label: "MVRV Z-score",
          value: onchain.mvrvZ,
          format: "ratio",
          hint: "standard deviations from realised cap",
        },
        ...(spec.supply
          ? [
              {
                key: "supply",
                label: "Circulating supply",
                value: spec.supply,
                format: "compact" as const,
              },
            ]
          : []),
      ],
    });
  }

  const legs = spec.market === "fx" ? fxLegs(symbol) : null;
  if (legs) {
    const baseRate = POLICY_RATES[legs.base];
    const quoteRate = POLICY_RATES[legs.quote];
    groups.push({
      title: "Carry",
      note: "The interest-rate differential the FX carry strategy reads. Synthetic here, but in a plausible relative ordering.",
      metrics: [
        {
          key: "base-rate",
          label: `${legs.base} policy rate`,
          value: baseRate,
          format: "percent",
        },
        {
          key: "quote-rate",
          label: `${legs.quote} policy rate`,
          value: quoteRate,
          format: "percent",
        },
        {
          key: "differential",
          label: "Differential",
          value: baseRate - quoteRate,
          format: "percent",
          hint: `long ${legs.base} earns this against ${legs.quote}`,
        },
      ],
    });
  }

  const assessment = advice.assessments.find((a) => a.symbol === symbol) ?? null;

  return NextResponse.json({
    // The whole spec minus the generation parameters. A hand-picked subset
    // here is the fourth copy of the same mistake — it is what dropped
    // `dataState`, so the asset page could not tell an NGX listing that is
    // still collecting from one the engine had no view on.
    instrument: toInstrument(spec),
    quote,
    assessment,
    actionable: advice.actionable.includes(symbol),
    groups,
    riskProfile,
    at,
    synthetic: provider.synthetic,
  });
}
