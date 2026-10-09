import type { Strategy } from "../types";
import { withMomentumRisk } from "./momentum-risk";
import { clamp } from "../indicators/stats";
import { crossSectionalScore, ordinal, pct } from "./shared";

/** Fewer than this and a "sector" ranking is a comparison of two things. */
const MIN_SECTORS = 5;

/**
 * Industry momentum — the sector's trend, not the instrument's.
 *
 * Moskowitz and Grinblatt's result is uncomfortable and that is why it is worth
 * carrying: once you control for the industry a stock is in, individual momentum
 * profits largely disappear. What looks like "this company is winning" is to a
 * large extent "this company is in the sector that is winning". They document
 * substantial momentum in industry portfolios, and it is stronger and more
 * persistent than the individual-stock effect.
 *
 * The construction is therefore deliberately *not* a sector-neutral version of
 * `xs-momentum` — ranking a name within its own sector would remove exactly the
 * signal this paper says is doing the work. Every member of a sector gets the
 * same score here, which is the honest expression of a claim about the sector.
 * The individual measures are already covered five other ways.
 *
 * This makes it the one rule in the engine that is not about the instrument at
 * all, and the ensemble should read it that way: an industry tailwind is a
 * reason to prefer a name, never on its own a reason to buy one. Its confidence
 * is capped accordingly.
 */
export const industryMomentum: Strategy = withMomentumRisk({
  id: "industry-momentum",
  name: "Industry momentum",
  family: "momentum",
  appliesTo: ["equity"],
  minBars: 253,

  citation: {
    authors: "Moskowitz & Grinblatt",
    year: 1999,
    title: "Do Industries Explain Momentum?",
    where: "Journal of Finance 54(4)",
    claim:
      "Industry portfolios exhibit strong and persistent momentum, and controlling for it accounts for much of individual-stock momentum profits — the industry effect is the more robust of the two.",
  },

  evaluate(ctx) {
    const section = ctx.crossSection;
    const sector = ctx.instrument.sector;
    if (!section || !sector) return null;

    const { sectors } = section;
    if (sectors.length < MIN_SECTORS) return null;

    const own = sectors.find((s) => s.sector === sector);
    // A sector below the membership floor is omitted from the table entirely,
    // which is the right answer: the mean of three names is not an industry.
    if (!own) return null;

    const column = sectors.map((s) => s.momentum);
    const score = crossSectionalScore(own.momentum, column);
    if (score === null) return null;

    const rank = sectors.indexOf(own) + 1;

    return {
      strategyId: "industry-momentum",
      score,
      /**
       * Capped well below the momentum rules that read the instrument itself.
       * The claim is about a group, so however strong it is, it is evidence
       * *about the neighbourhood* — and every name in that sector is getting
       * this identical score, which is exactly the shape of a signal that should
       * not be allowed to carry a call on its own.
       */
      confidence: clamp(
        Math.min(sectors.length / 10, 1) * (0.25 + Math.abs(score) * 0.4),
        0.12,
        0.5,
      ),
      rationale: `${sector} is ${ordinal(rank)} of ${sectors.length} sectors over the twelve months to a month ago, its ${own.members} names averaging ${pct(own.momentum)}.`,
      horizonDays: 90,
      halfLifeDays: 60,
    };
  },
}, { crash: true });
