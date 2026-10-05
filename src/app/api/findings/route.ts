import { NextResponse, type NextRequest } from "next/server";
import { getFindings, parseRiskProfile, type PositionInput } from "@/lib/api/server";
import { requestPlan } from "@/lib/api/plan-server";

export const dynamic = "force-dynamic";

/**
 * The alpha finder. POST, because it carries the user's positions.
 *
 * Every other route in ember is a GET with the answer memoised behind it. This
 * one can't be: the answer depends on what the caller holds, and putting a
 * book in a query string would (a) put personal data in a URL, where it is
 * logged by every proxy between here and the browser, and (b) blow past the
 * length every one of those proxies will accept somewhere around thirty
 * positions.
 *
 * **This is the first request in ember that sends anything about the user off
 * their device.** Four derived numbers per symbol — see `PositionInput`, which
 * says at length what is *not* on it. Stated in settings, in CLAUDE.md §8, and
 * reasoned about in ADR 0025. It is necessary: a stop measured from a real
 * entry and a concentration warning against a real book cannot be computed by
 * a server that doesn't know either, and the engine cannot move to the client
 * without shipping ten strategies into the browser bundle.
 */

/** Enough for any plausible retail book; past this the caller is not a user. */
const MAX_POSITIONS = 200;

interface Body {
  profile?: unknown;
  positions?: unknown;
  watching?: unknown;
}

/**
 * Parse defensively and drop what doesn't fit, rather than rejecting the whole
 * request.
 *
 * A single malformed row — a hand-edited `localStorage`, a symbol that was
 * delisted between releases — should cost the user that one position's risk
 * signals, not their entire findings inbox. `NaN` is the case that matters:
 * it survives every comparison in the engine and comes out the far end as a
 * price of `null` on a card.
 */
function parsePositions(value: unknown): PositionInput[] {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, MAX_POSITIONS)
    .map((row): PositionInput | null => {
      if (typeof row !== "object" || row === null) return null;
      const { symbol, quantity, averageCost, openedAt } = row as Record<string, unknown>;

      if (typeof symbol !== "string" || symbol.length === 0) return null;
      if (!isFinitePositive(quantity) || !isFinitePositive(averageCost)) return null;
      if (typeof openedAt !== "number" || !Number.isFinite(openedAt)) return null;

      return {
        symbol: symbol.toUpperCase(),
        quantity,
        averageCost,
        openedAt,
      };
    })
    .filter((row): row is PositionInput => row !== null);
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** `null` is the watchlist's "following everything" sentinel (decision 023). */
function parseWatching(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .map((s) => s.toUpperCase());
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { error: "That request wasn't valid JSON." },
      { status: 400 },
    );
  }

  const findings = await getFindings({
    riskProfile: parseRiskProfile(typeof body.profile === "string" ? body.profile : null),
    positions: parsePositions(body.positions),
    watching: parseWatching(body.watching),
    plan: await requestPlan(),
  });

  return NextResponse.json(findings);
}
