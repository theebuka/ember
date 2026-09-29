import type { NewsCategory, NewsItem } from "@/lib/api/types";
import { hashString, mulberry32 } from "@/lib/market/random";
import { INSTRUMENTS, type InstrumentSpec } from "@/lib/market/universe";

/**
 * Generated headlines.
 *
 * Two rules shape this more than the copy does.
 *
 * **The sources are fictional.** Everything else in the mock provider invents
 * numbers; this would invent *words attributed to a named organisation*, which
 * is a different thing. A generated price labelled "Generated prices" misleads
 * nobody; a fabricated Reuters headline about a real company, screenshotted,
 * is a fake news story with a real byline on it. So the outlets below do not
 * exist. When Finnhub is wired up the attribution becomes real, and it should
 * be the *only* moment ember ever puts a real publisher's name on a headline.
 *
 * **Nothing here is directional.** Every template is procedural — a filing, a
 * schedule, a personnel move, a rate decision. None of them say an instrument
 * is cheap, or going up, or worth buying. That is partly good taste and mostly
 * structural: news is context and never evidence (ADR 0027), and a mock full
 * of "ANALYSTS SEE 40% UPSIDE" would make the boundary look arbitrary the
 * moment anyone read the screen.
 */

const HOUR = 3_600_000;

/** Invented outlets. See the note above — this is deliberate, not laziness. */
const SOURCES = [
  "Market Wire",
  "The Ledger",
  "Terminal Daily",
  "Parallax Markets",
  "Northgate Report",
  "Signal & Tape",
];

/**
 * Templates, with the topics each one is about.
 *
 * Topics are declared rather than extracted from the text, because that is how
 * a real feed supplies them and re-deriving them by parsing headlines would be
 * a worse version of a job the upstream has already done.
 */
interface Template {
  headline: (name: string) => string;
  summary: (name?: string) => string;
  topics: string[];
}

const COMPANY: Template[] = [
  {
    headline: (n) => `${n} confirms date for next quarterly results`,
    summary: (n) => `${n} will report after the close, with a call scheduled for the same afternoon.`,
    topics: ["earnings"],
  },
  {
    headline: (n) => `${n} files annual report with the SEC`,
    summary: () => `The filing covers the full year and restates the segment breakdown disclosed in the third quarter.`,
    topics: ["filings", "regulation"],
  },
  {
    headline: (n) => `${n} names a new chief financial officer`,
    summary: () => `The appointment takes effect next quarter. The outgoing CFO stays on through the transition.`,
    topics: ["leadership"],
  },
  {
    headline: (n) => `${n} expands its manufacturing footprint`,
    summary: () => `The company confirmed a second site, with hiring beginning in the new year.`,
    topics: ["capex", "supply chain"],
  },
  {
    headline: (n) => `${n} completes previously announced acquisition`,
    summary: () => `Terms were disclosed at announcement. The business will be consolidated from next quarter.`,
    topics: ["M&A"],
  },
  {
    headline: (n) => `${n} shareholders approve the board's slate`,
    summary: () => `All resolutions passed at the annual meeting. Turnout was in line with prior years.`,
    topics: ["governance"],
  },
  {
    headline: (n) => `${n} joins index rebalance for the coming quarter`,
    summary: () => `The change takes effect at the next scheduled review. Passive flows typically follow.`,
    topics: ["index changes"],
  },
  {
    headline: (n) => `${n} discloses buyback progress`,
    summary: () => `The company reported repurchases under the existing authorisation, which runs to year end.`,
    topics: ["buybacks", "capital returns"],
  },
];

const CRYPTO: Template[] = [
  {
    headline: (n) => `${n} network completes scheduled upgrade`,
    summary: () => `The upgrade activated at the planned block height. Node operators were given four weeks' notice.`,
    topics: ["protocol upgrades"],
  },
  {
    headline: (n) => `Exchange adds ${n} to its institutional custody list`,
    summary: () => `Custody support goes live alongside existing spot markets. No fee changes were announced.`,
    topics: ["custody", "exchanges"],
  },
  {
    headline: (n) => `${n} scheduled token unlock lands this month`,
    summary: () => `The release follows the published vesting schedule. Circulating supply rises accordingly.`,
    topics: ["token unlocks", "supply"],
  },
  {
    headline: (n) => `Developer activity on ${n} steady quarter on quarter`,
    summary: () => `Commit counts and active repositories were broadly unchanged from the previous quarter.`,
    topics: ["developer activity"],
  },
  {
    headline: (n) => `${n} added to a new spot ETF filing`,
    summary: () => `The application is with the regulator. There is no decision date on the docket yet.`,
    topics: ["ETFs", "regulation"],
  },
];

const FX: Template[] = [
  {
    headline: (n) => `${n} volatility eases into the London fix`,
    summary: () => `Implied volatility on one-month options came off its recent range. Volumes were near average.`,
    topics: ["FX volatility"],
  },
  {
    headline: (n) => `Rate differential on ${n} unchanged after policy meeting`,
    summary: () => `Both central banks held. The differential that drives the carry is where it was a month ago.`,
    topics: ["central banks", "carry"],
  },
  {
    headline: (n) => `Positioning data shows a lighter book in ${n}`,
    summary: () => `The weekly commitment report showed reduced net exposure among leveraged accounts.`,
    topics: ["positioning"],
  },
];

/** Market-wide stories, not about any one instrument. */
const MACRO: { headline: string; summary: string; topics: string[]; category: NewsCategory }[] = [
  {
    headline: "CPI print lands mid-month, consensus unchanged",
    summary: "The release is scheduled for 08:30 Eastern. ember's execution windows already route around it.",
    topics: ["inflation", "central banks"],
    category: "macro",
  },
  {
    headline: "FOMC holds, statement language little changed",
    summary: "The committee left the target range where it was. The next meeting is in seven weeks.",
    topics: ["central banks", "rates"],
    category: "macro",
  },
  {
    headline: "Payrolls day: what is on the calendar",
    summary: "The employment report is out on Friday morning, with revisions to the prior two months.",
    topics: ["employment", "rates"],
    category: "macro",
  },
  {
    headline: "Treasury curve steepens modestly over the week",
    summary: "The two-year and ten-year spread widened. Auction sizes were unchanged.",
    topics: ["rates", "bonds"],
    category: "macro",
  },
  {
    headline: "Index futures quiet ahead of the open",
    summary: "Overnight volumes were thin across the majors. No scheduled releases before the bell.",
    topics: ["index changes", "positioning"],
    category: "markets",
  },
  {
    headline: "Earnings season: the week's reporting calendar",
    summary: "Several large caps report between Tuesday and Thursday, most of them after the close.",
    topics: ["earnings"],
    category: "markets",
  },
  {
    headline: "Crypto spot volumes flat week on week",
    summary: "Aggregate exchange volume was little changed. Weekend books remain the thinnest of the cycle.",
    topics: ["exchanges", "supply"],
    category: "crypto",
  },
];

function templatesFor(market: InstrumentSpec["market"]): Template[] {
  if (market === "crypto") return CRYPTO;
  if (market === "fx") return FX;
  return COMPANY;
}

/**
 * Headlines over the trailing window, newest first.
 *
 * Seeded per instrument *and per day*, so the feed changes daily and is
 * identical for every reader on the same day — the same property that makes
 * screenshots and the backtest reproducible.
 *
 * Not every instrument gets a story. A universe of 110 producing 110 stories a
 * day would be a wall, and a feed where everything is covered equally is
 * obviously generated. Coverage is weighted toward the instruments a reader is
 * more likely to care about, which here means the ones with the most volume.
 */
export function generateNews(at: number, windowHours = 48): NewsItem[] {
  const day = Math.floor(at / 86_400_000);
  const items: NewsItem[] = [];

  for (const spec of INSTRUMENTS) {
    const rng = mulberry32(hashString(`${spec.symbol}:news:${day}`));

    // Roughly a third of the universe is covered on a given day; the busiest
    // names a little more often.
    const busy = spec.baseVolume > 20_000_000 || spec.market !== "equity";
    if (rng() > (busy ? 0.45 : 0.2)) continue;

    const templates = templatesFor(spec.market);
    const template = templates[Math.floor(rng() * templates.length)];
    const ageHours = rng() * windowHours;

    items.push({
      id: `${spec.symbol}-${day}-${template.topics[0]}`,
      headline: template.headline(spec.name),
      summary: template.summary(spec.name),
      source: SOURCES[Math.floor(rng() * SOURCES.length)],
      at: at - ageHours * HOUR,
      // Deliberately inert. A live provider supplies a real link; a mock that
      // pointed at a plausible-looking external URL would be inviting someone
      // to click through to a page that does not exist, or worse, one that
      // does and says something different.
      url: "#",
      symbols: [spec.symbol],
      topics: template.topics,
      category: spec.market === "crypto" ? "crypto" : "company",
    });
  }

  for (const [index, story] of MACRO.entries()) {
    const rng = mulberry32(hashString(`macro:${index}:${day}`));
    if (rng() > 0.65) continue;

    items.push({
      id: `macro-${index}-${day}`,
      headline: story.headline,
      summary: story.summary,
      source: SOURCES[Math.floor(rng() * SOURCES.length)],
      at: at - rng() * windowHours * HOUR,
      url: "#",
      symbols: [],
      topics: story.topics,
      category: story.category,
    });
  }

  return items.sort((a, b) => b.at - a.at);
}
