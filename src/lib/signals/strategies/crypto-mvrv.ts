import type { Strategy } from "../types";
import { clamp } from "../indicators/stats";
import { pct } from "./shared";

/**
 * MVRV Z-score — market value against realised value.
 *
 * Realised capitalisation prices every coin at the moment it last moved
 * on-chain, which makes it a reasonable proxy for the aggregate cost basis of
 * everyone holding. The Z-score asks how far market price has run from that
 * cost basis in standard-deviation terms: deeply negative means the average
 * holder is underwater, historically the region major bottoms have formed in;
 * above roughly seven has marked every cycle top so far.
 *
 * Two caveats, stated here and on the methodology page rather than buried.
 * First, "every cycle so far" is a sample of three or four — this is a
 * suggestive regularity, not an estimated effect, and it carries lower
 * confidence than anything in this engine derived from a peer-reviewed panel.
 * Second, the metric was constructed for Bitcoin; altcoin realised caps are
 * noisier and shorter, so confidence is reduced further off BTC.
 *
 * Stock-to-flow, the other well-known on-chain valuation model, is
 * deliberately excluded — it broke badly out of sample and keeping it would
 * undermine everything beside it. See docs/decisions/0005.
 */
export const cryptoMvrv: Strategy = {
  id: "crypto-mvrv",
  name: "MVRV Z-score",
  family: "valuation",
  appliesTo: ["crypto"],
  minBars: 1,

  citation: {
    authors: "Murad Mahmudov & David Puell, formalised by Glassnode",
    year: 2018,
    title: "MVRV Z-Score",
    where: "Glassnode Studio on-chain metric",
    claim:
      "The spread between market capitalisation and realised capitalisation, normalised by its own standard deviation, has bounded Bitcoin's historical cycle tops and bottoms.",
  },

  evaluate(ctx) {
    if (!ctx.onchain) return null;

    const { mvrvZ, marketCap, realizedCap } = ctx.onchain;

    // Centred near 2.5 — roughly the historical midpoint between the bottom
    // region and the top region — and inverted, because a high Z-score is
    // expensive, not strong.
    const score = clamp(-Math.tanh((mvrvZ - 2.5) / 2.5), -1, 1);

    const premium = realizedCap > 0 ? marketCap / realizedCap - 1 : 0;

    const reading =
      mvrvZ < 0
        ? "below the aggregate cost basis of holders — historically where bottoms have formed"
        : mvrvZ > 6
          ? "in the region that has marked every cycle top so far"
          : "in the middle of its historical range";

    // A small sample of cycles is a weak prior, and weaker still off Bitcoin.
    const btc = ctx.instrument.symbol === "BTC";
    const extremity = Math.min(Math.abs(mvrvZ - 2.5) / 3.5, 1);

    return {
      strategyId: "crypto-mvrv",
      score,
      confidence: clamp(extremity * (btc ? 0.6 : 0.35), 0.1, 0.6),
      rationale: `MVRV Z-score of ${mvrvZ.toFixed(1)}, ${reading}. Market value sits ${pct(premium)} against realised value.`,
      horizonDays: 180,
      halfLifeDays: 90,
    };
  },
};
