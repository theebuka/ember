import { liveProvider } from "./live";
import { mockProvider } from "./mock";
import type { MarketDataProvider } from "./types";

export type { MarketDataProvider, OnChainMetrics } from "./types";

/**
 * The configured market data source.
 *
 * Only the API routes call this. Components go through `lib/api/client.ts`, so
 * which provider is active is invisible above this line — which is the point:
 * turning on live data is an env var and one more implementation of
 * `MarketDataProvider`, not a change to any screen. That claim was made in
 * phase 1 against generated data and it held: the live provider landed without
 * touching a component, a route or a test.
 *
 * **Opt-in, and it stays that way.** `EMBER_DATA_PROVIDER=live` is the switch.
 * With no keys the app runs entirely on generated data and is fully usable —
 * that is a supported way to run ember, not a broken one (ADR 0007), and it is
 * also what `npm run verify` measures against, because a gate whose numbers
 * move with the market measures the market rather than the app.
 *
 * Falling back to the mock when the flag is on but a key is missing is
 * deliberate and loud: a half-configured live provider would answer every
 * request with an empty universe, and an app showing nothing is much harder to
 * diagnose than an app showing a "Generated prices" chip.
 */
/**
 * Whether prices are generated, for the root layout to hand to every screen.
 * See `components/market/data-source.tsx` for why this is not read from a query.
 */
export function servesGeneratedData(): boolean {
  return getProvider().synthetic;
}

export function getProvider(): MarketDataProvider {
  if (process.env.EMBER_DATA_PROVIDER !== "live") return mockProvider;

  if (!process.env.FINNHUB_API_KEY || !process.env.COINGECKO_API_KEY) {
    console.warn(
      "[ember] EMBER_DATA_PROVIDER=live but FINNHUB_API_KEY or COINGECKO_API_KEY is unset — serving generated data.",
    );
    return mockProvider;
  }

  return liveProvider;
}
