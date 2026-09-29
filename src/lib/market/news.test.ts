import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { NewsItem } from "@/lib/api/types";
import { generateNews } from "@/lib/market/providers/mock/news";
import { INSTRUMENTS } from "@/lib/market/universe";
import { newsForSymbols, trendingFrom } from "./news";

const NOW = Date.UTC(2026, 7, 14, 12, 0, 0);

function story(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id: "x",
    headline: "Something happened",
    summary: "It happened at the scheduled time.",
    source: "Market Wire",
    at: NOW,
    url: "#",
    symbols: [],
    topics: ["earnings"],
    category: "markets",
    ...overrides,
  };
}

describe("trendingFrom", () => {
  /**
   * The whole reason this is a function and not a constant. An authored list
   * of "today's topics" is an editorial claim dressed as a measurement — the
   * same failure as a hardcoded track record, and ruled out for the same
   * reason.
   */
  it("ranks by how often a topic actually appears", () => {
    const trending = trendingFrom([
      story({ id: "1", topics: ["earnings"] }),
      story({ id: "2", topics: ["earnings"] }),
      story({ id: "3", topics: ["earnings", "rates"] }),
      story({ id: "4", topics: ["rates"] }),
    ]);

    expect(trending.map((t) => [t.topic, t.mentions])).toEqual([
      ["earnings", 3],
      ["rates", 2],
    ]);
  });

  it("drops a topic mentioned only once — that's a story, not a trend", () => {
    const trending = trendingFrom([
      story({ id: "1", topics: ["earnings"] }),
      story({ id: "2", topics: ["earnings"] }),
      story({ id: "3", topics: ["M&A"] }),
    ]);
    expect(trending.map((t) => t.topic)).toEqual(["earnings"]);
  });

  it("attaches the instruments those stories were about, busiest first", () => {
    const trending = trendingFrom([
      story({ id: "1", topics: ["earnings"], symbols: ["AAPL"] }),
      story({ id: "2", topics: ["earnings"], symbols: ["AAPL"] }),
      story({ id: "3", topics: ["earnings"], symbols: ["MSFT"] }),
    ]);
    expect(trending[0].symbols).toEqual(["AAPL", "MSFT"]);
  });

  /**
   * Without the tiebreak the order falls out of `Map` insertion, which is the
   * order the feed happened to arrive in — not a fact about anything, and it
   * would reshuffle the strip between identical requests.
   */
  it("is stable when two topics tie", () => {
    const items = [
      story({ id: "1", topics: ["rates"] }),
      story({ id: "2", topics: ["rates"] }),
      story({ id: "3", topics: ["earnings"] }),
      story({ id: "4", topics: ["earnings"] }),
    ];
    expect(trendingFrom(items).map((t) => t.topic)).toEqual(["earnings", "rates"]);
    expect(trendingFrom([...items].reverse()).map((t) => t.topic)).toEqual([
      "earnings",
      "rates",
    ]);
  });

  it("returns nothing for an empty feed rather than throwing", () => {
    expect(trendingFrom([])).toEqual([]);
  });
});

describe("newsForSymbols", () => {
  it("keeps stories about the given symbols", () => {
    const items = [
      story({ id: "1", symbols: ["AAPL"] }),
      story({ id: "2", symbols: ["TSLA"] }),
    ];
    expect(newsForSymbols(items, ["AAPL"]).map((i) => i.id)).toEqual(["1"]);
  });

  /**
   * "Your assets" means what bears on your book, and a CPI print bears on all
   * of it. Dropping market-wide stories would make the filtered view quieter
   * than the truth, which is the wrong direction for a filter to lie in.
   */
  it("keeps market-wide stories, which have no symbols", () => {
    const items = [story({ id: "macro", symbols: [] }), story({ id: "tsla", symbols: ["TSLA"] })];
    expect(newsForSymbols(items, ["AAPL"]).map((i) => i.id)).toEqual(["macro"]);
  });
});

describe("the mock feed", () => {
  it("is stable within a day and moves between days", () => {
    const today = generateNews(NOW).map((i) => i.id);
    const later = generateNews(NOW + 3_600_000).map((i) => i.id);
    const tomorrow = generateNews(NOW + 86_400_000).map((i) => i.id);

    expect(later).toEqual(today);
    expect(tomorrow).not.toEqual(today);
  });

  it("covers some of the universe, not all of it", () => {
    const items = generateNews(NOW);
    expect(items.length).toBeGreaterThan(8);

    /**
     * Proportional, not an absolute count.
     *
     * This asserted `< 70`, which was two thirds of a 110-instrument universe
     * and became exactly 100% of the bound the day the universe reached 202.
     * The property it is actually protecting is that the feed covers *a subset*
     * — a day where every instrument has a story is obviously generated, and it
     * is a wall rather than a screen. Expressed against the universe, it stays
     * true whatever size that is.
     */
    expect(items.length).toBeLessThan(INSTRUMENTS.length * 0.6);
  });

  it("is newest first, and inside the window", () => {
    const items = generateNews(NOW);
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].at).toBeGreaterThanOrEqual(items[i].at);
    }
    for (const item of items) {
      expect(item.at).toBeLessThanOrEqual(NOW);
      expect(item.at).toBeGreaterThan(NOW - 49 * 3_600_000);
    }
  });

  /**
   * Everything else in the mock invents numbers. This would invent *words
   * attributed to an organisation*, and a fabricated headline carrying a real
   * publisher's byline is a different class of thing from a generated price —
   * a screenshot of one is a fake news story. The outlets are fictional until
   * a live feed supplies real attribution.
   */
  it("attributes nothing to a real news organisation", () => {
    const real = /reuters|bloomberg|financial times|\bft\b|wsj|wall street|cnbc|barron|associated press|\bap\b|guardian|bbc|forbes|business insider/i;
    for (const item of generateNews(NOW)) {
      expect(item.source, item.source).not.toMatch(real);
    }
  });
});

/**
 * The boundary, enforced rather than intended.
 *
 * ADR 0005 rules out sentiment as a signal input, and the methodology page
 * renders that rejection to users. ADR 0027 extends it: news may sit beside a
 * finding as labelled context, and may never enter the ensemble.
 *
 * A rule that lives only in prose erodes the first time someone reaches for
 * "just a relevance nudge". This walks every file under `lib/signals` and
 * fails if one of them so much as imports a news module — the same discipline
 * as `server-only` on the engine, which is the other rule in this codebase
 * that would be worthless if it were merely documented.
 */
describe("news never reaches the engine", () => {
  const ENGINE = join(process.cwd(), "src/lib/signals");

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  }

  it("no module under lib/signals imports news", () => {
    const offenders = walk(ENGINE)
      .filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts"))
      .filter((path) => /from\s+["'][^"']*news[^"']*["']/.test(readFileSync(path, "utf8")));

    expect(offenders).toEqual([]);
  });

  /**
   * And the type itself carries no field that would make it look like one.
   * A `sentiment` or `relevance` on `NewsItem` is an invitation, and the
   * invitation is most of how this kind of boundary fails.
   */
  it("NewsItem carries no sentiment, score or weight", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/api/types.ts"), "utf8");
    const shape = source.slice(
      source.indexOf("export interface NewsItem"),
      source.indexOf("export type NewsCategory"),
    );

    expect(shape).not.toMatch(/sentiment|relevance|\bscore\b|\bweight\b|impact/i);
  });
});
