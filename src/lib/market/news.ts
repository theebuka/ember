import type { NewsItem, TrendingTopic } from "@/lib/api/types";

/**
 * What the feed is actually about, counted rather than declared.
 *
 * The strip at the top of the News screen is the one place a product like this
 * reaches for an editor: pick five topics, write them into a constant, ship.
 * That is an authored claim about what matters today wearing the costume of a
 * measurement — the same failure mode as a hardcoded track record, and ruled
 * out for the same reason (CLAUDE.md §7).
 *
 * So it is frequency across the stories in the window, and nothing else. If
 * three companies filed and nobody moved, "filings" leads, and that is a true
 * statement about the day.
 *
 * Pure, so the ranking can be tested against fixtures rather than eyeballed
 * against whatever the generator produced this morning.
 */
export function trendingFrom(
  items: readonly NewsItem[],
  limit = 6,
): TrendingTopic[] {
  const counts = new Map<string, { mentions: number; symbols: Map<string, number> }>();

  for (const item of items) {
    for (const topic of item.topics) {
      const entry = counts.get(topic) ?? { mentions: 0, symbols: new Map() };
      entry.mentions += 1;

      for (const symbol of item.symbols) {
        entry.symbols.set(symbol, (entry.symbols.get(symbol) ?? 0) + 1);
      }

      counts.set(topic, entry);
    }
  }

  return [...counts.entries()]
    .map(([topic, entry]) => ({
      topic,
      mentions: entry.mentions,
      symbols: [...entry.symbols.entries()]
        // Most-mentioned first, then alphabetical — without the tiebreak the
        // order comes from Map insertion, which is the order the feed happened
        // to arrive in, which is not a fact about anything.
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 4)
        .map(([symbol]) => symbol),
    }))
    // A topic mentioned once is not trending; it is a story. Filtering here
    // rather than in the UI keeps "what counts as trending" in one place.
    .filter((topic) => topic.mentions > 1)
    .sort((a, b) => b.mentions - a.mentions || a.topic.localeCompare(b.topic))
    .slice(0, limit);
}

/**
 * Stories touching a given set of symbols.
 *
 * Market-wide items — those with no symbols — are kept, because "your assets"
 * means the things that bear on your book, and a CPI print bears on all of it.
 * Dropping them would make the filtered view quieter than the truth.
 */
export function newsForSymbols(
  items: readonly NewsItem[],
  symbols: readonly string[],
): NewsItem[] {
  const wanted = new Set(symbols);
  return items.filter(
    (item) => item.symbols.length === 0 || item.symbols.some((s) => wanted.has(s)),
  );
}
