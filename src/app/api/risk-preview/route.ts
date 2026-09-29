import { NextResponse } from "next/server";
import { getAdvice } from "@/lib/api/server";
import {
  RISK_PROFILES,
  type RiskProfile,
  type RiskProfilePreview,
} from "@/lib/api/types";

export const dynamic = "force-dynamic";

/**
 * What each risk profile would actually do, right now.
 *
 * The profile is the only setting in ember that changes the product rather
 * than its presentation — it shifts family weights, the volatility target, the
 * position cap and the bar a call has to clear to reach the feed. A control
 * that says "Conservative / Balanced / Aggressive" and leaves the user to
 * discover the difference is a label, and a paragraph of prose describing the
 * difference is a claim.
 *
 * So the settings screen shows the consequence measured: how many instruments
 * clear each profile's bar *on today's market*, computed by running the
 * ensemble three times. It's the same argument the track-record page makes —
 * the number is the engine's output, not a designer's estimate — applied to a
 * setting.
 *
 * Cheap in practice: `getAdvice` is already memoised per profile for a minute
 * and shares one memoised universe load, so this is at worst three passes of
 * the ensemble over the universe.
 */

const PROFILES = Object.keys(RISK_PROFILES) as RiskProfile[];

export async function GET() {
  const results = await Promise.all(PROFILES.map((profile) => getAdvice(profile)));

  const profiles: RiskProfilePreview[] = results.map((advice, index) => {
    const profile = PROFILES[index];
    const config = RISK_PROFILES[profile];

    const actionable = new Set(advice.actionable);
    const sizes = advice.assessments
      .filter((a) => actionable.has(a.symbol) && a.sizing)
      .map((a) => a.sizing!.weight);

    return {
      profile,
      label: config.label,
      consequence: config.consequence,
      assessed: advice.assessments.length,
      actionable: actionable.size,
      typicalSize:
        sizes.length > 0 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : null,
      actionThreshold: config.actionThreshold,
      confidenceFloor: config.confidenceFloor,
      maxWeight: config.maxWeight,
      volTarget: config.volTarget,
    };
  });

  return NextResponse.json({
    profiles,
    at: Date.now(),
    synthetic: results[0].synthetic,
  });
}
