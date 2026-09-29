import { NextResponse, type NextRequest } from "next/server";
import { parseRiskProfile } from "@/lib/api/server";
import type { RegimeScenario, StrategySummary } from "@/lib/api/types";
import { PROFILE_WEIGHTS } from "@/lib/signals/ensemble";
import { regimeWeight, type Regime } from "@/lib/signals/regime";
import { HORIZON_HOURS } from "@/lib/signals/window";
import { STRATEGIES } from "@/lib/signals/strategies";
import type { StrategyFamily } from "@/lib/signals/types";

export const dynamic = "force-dynamic";

/**
 * Everything the methodology page states about the engine, read out of the
 * engine.
 *
 * The point is that the page cannot drift from the code. A methodology page
 * transcribed by hand is a document that was true once — and on a product
 * whose entire claim is "you can check this", a stale weight table is worse
 * than no table at all.
 */


/**
 * Concrete regimes, not abstract labels.
 *
 * The multipliers below are produced by calling `regimeWeight()` with these
 * exact objects, so what the page shows is what the ensemble does — including
 * the compound cases. A stressed *and* ranging market damps trend twice, and a
 * hand-written table would almost certainly report only one of those.
 */
const SCENARIOS: { key: string; label: string; description: string; regime: Regime }[] = [
  {
    key: "calm-uptrend",
    label: "Calm uptrend",
    description: "Price above a rising 200-day average, volatility in the bottom third of its own year.",
    regime: buildRegime("uptrend", "calm", 0.08),
  },
  {
    key: "ranging",
    label: "Ranging",
    description: "No trend either way, volatility around its usual level.",
    regime: buildRegime("range", "normal", 0.5),
  },
  {
    key: "downtrend",
    label: "Downtrend",
    description: "Price below a falling 200-day average, volatility around its usual level.",
    regime: buildRegime("downtrend", "normal", 0.5),
  },
  {
    key: "stressed",
    label: "Stressed",
    description: "Volatility in the top fifth of its own year, with no clear trend.",
    regime: buildRegime("range", "stressed", 0.92),
  },
];

function buildRegime(
  trend: Regime["trend"],
  vol: Regime["vol"],
  volPercentile: number,
): Regime {
  return {
    trend,
    vol,
    volatility: 0.2,
    volPercentile,
    trendStrength: trend === "uptrend" ? 0.05 : trend === "downtrend" ? -0.05 : 0,
    label: `${vol === "normal" ? "normal-vol" : vol} ${trend}`,
    summary: "",
  };
}

/**
 * The families that actually exist in the engine, read off the registry.
 *
 * This was a hand-written list of seven, which is the exact drift this route was
 * built to prevent (ADR 0012): adding the `defensive` family in phase 24 left it
 * behind, so the regime table would have gone on describing an engine with one
 * fewer family in it and nothing would have failed. Derived, in registration
 * order, so the page can only ever show what is there.
 */
const FAMILIES: StrategyFamily[] = [...new Set(STRATEGIES.map((s) => s.family))];

export async function GET(request: NextRequest) {
  const riskProfile = parseRiskProfile(request.nextUrl.searchParams.get("profile"));

  const strategies: StrategySummary[] = STRATEGIES.map((s) => ({
    id: s.id,
    name: s.name,
    family: s.family,
    citation: s.citation,
    appliesTo: [...s.appliesTo],
    minBars: s.minBars,
  }));

  const regimes: RegimeScenario[] = SCENARIOS.map(({ key, label, description, regime }) => ({
    key,
    label,
    description,
    weights: Object.fromEntries(
      FAMILIES.map((family) => [family, regimeWeight(family, regime)]),
    ),
  }));

  return NextResponse.json({
    strategies,
    families: FAMILIES,
    regimes,
    riskProfile,
    /** Family multipliers for the chosen profile. Absent means 1. */
    profileWeights: PROFILE_WEIGHTS[riskProfile],
    horizonHours: HORIZON_HOURS,
    at: Date.now(),
  });
}
