import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getProvider } from "./index";

/**
 * Which provider answers, and the one case that matters.
 *
 * A half-configured live provider — the flag on, a key missing — would answer
 * every request with an empty universe: no candles, so no context, so no
 * assessments, so a working app showing nothing at all. That is a much harder
 * thing to diagnose than a "Generated prices" chip, so the fallback is
 * deliberate and it is tested rather than trusted.
 */
describe("provider selection", () => {
  const original = { ...process.env };
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...original };
    warn.mockRestore();
  });

  it("serves generated data by default", () => {
    delete process.env.EMBER_DATA_PROVIDER;
    expect(getProvider().synthetic).toBe(true);
  });

  it("serves generated data when the flag is anything but live", () => {
    process.env.EMBER_DATA_PROVIDER = "mock";
    process.env.FINNHUB_API_KEY = "x";
    process.env.COINGECKO_API_KEY = "y";
    expect(getProvider().synthetic).toBe(true);
  });

  it("falls back, loudly, when the flag is on but a key is missing", () => {
    process.env.EMBER_DATA_PROVIDER = "live";
    process.env.FINNHUB_API_KEY = "x";
    delete process.env.COINGECKO_API_KEY;

    expect(getProvider().synthetic).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it("goes live only with the flag and both keys", () => {
    process.env.EMBER_DATA_PROVIDER = "live";
    process.env.FINNHUB_API_KEY = "x";
    process.env.COINGECKO_API_KEY = "y";

    const provider = getProvider();
    expect(provider.id).toBe("live");
    // The chip in every page header reads this. Getting it wrong is the
    // difference between "these are modelled" and a claim about real prices.
    expect(provider.synthetic).toBe(false);
  });
});
