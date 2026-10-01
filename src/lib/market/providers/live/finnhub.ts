import type { Instrument, NewsCategory, NewsItem, Quote } from "@/lib/api/types";
import type { MarketEvent } from "@/lib/market/calendar";
import { INSTRUMENTS, INSTRUMENT_BY_SYMBOL, instrumentsIn } from "@/lib/market/universe";
import type { Fundamentals } from "@/lib/signals/types";
import { cached } from "./cache";
import { fetchJson } from "./http";

/**
 * Finnhub — everything its free tier actually covers.
 *
 * Measured against the key rather than read off a pricing page, because the
 * two disagree. What works: `/quote`, `/stock/financials-reported` (parsed
 * 10-K and 10-Q line items, which is the SEC EDGAR data ADR 0006 planned for
 * without the parsing), `/company-news`, `/news`, `/search` and
 * `/calendar/earnings`. What answers **403**: every candle endpoint,
 * `/forex/rates` and `/calendar/economic`.
 *
 * That shape is why this file is not the price source. Prices come from
 * elsewhere (see `yahoo.ts` for the uncomfortable reason) and Finnhub is used
 * for the four things it does supply and nothing else does: real filed
 * fundamentals, real headlines with real attribution, real symbol search over
 * every US listing, and real earnings dates.
 */

const BASE = "https://finnhub.io/api/v1";

export function apiKey(): string | undefined {
  return process.env.FINNHUB_API_KEY;
}

function url(path: string, params: Record<string, string>): string {
  const query = new URLSearchParams({ ...params, token: apiKey() ?? "" });
  return `${BASE}${path}?${query}`;
}

/* ── Quotes ────────────────────────────────────────────────────────────── */

interface QuoteResponse {
  c: number;
  d: number | null;
  dp: number | null;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
}

/**
 * A real-time equity quote.
 *
 * Currently unused by the provider, and kept because it is the licensed
 * answer for a price the moment a licensed history exists. Today the price
 * ships in the same response as the history it has to agree with, and taking
 * the two from different vendors would put a headline number on screen that
 * the chart under it does not end at.
 */
export function quote(symbol: string): Promise<Quote | null> {
  return cached("finnhub-quote", symbol, { ttl: 30, maxAge: 900 }, async () => {
    const body = await fetchJson<QuoteResponse>(url("/quote", { symbol }));
    if (!body.c) return null;
    return {
      symbol,
      price: body.c,
      change: body.d ?? 0,
      changePct: (body.dp ?? 0) / 100,
      previousClose: body.pc,
      dayHigh: body.h,
      dayLow: body.l,
      at: body.t ? body.t * 1000 : Date.now(),
    };
  });
}

/* ── Fundamentals ──────────────────────────────────────────────────────── */

interface ReportedLine {
  concept: string;
  label: string;
  value: number;
}

interface ReportedFiling {
  year: number;
  quarter: number;
  form: string;
  endDate: string;
  report: { bs?: ReportedLine[]; ic?: ReportedLine[]; cf?: ReportedLine[] };
}

interface ReportedResponse {
  data?: ReportedFiling[];
}

/**
 * Pull one figure out of a filing section.
 *
 * Filers do not agree on concepts — revenue alone appears as
 * `RevenueFromContractWithCustomerExcludingAssessedTax`, `Revenues` and
 * `SalesRevenueNet` depending on the company and the year. So each field names
 * its candidates in priority order and the first present one wins, matched on
 * the concept's suffix because Finnhub prefixes the taxonomy (`us-gaap_`).
 *
 * Returns `null` rather than 0 when nothing matches. A missing line item and a
 * line item that is genuinely zero mean opposite things to a ratio, and the
 * caller refuses the instrument rather than dividing by a guess.
 *
 * The comparison is on the concept's *local name* — everything after the
 * taxonomy prefix — and it is exact. A suffix match looks more forgiving and
 * is quietly wrong: `Assets` is the balance-sheet total, and `endsWith`
 * matches `OtherAssets` too, so a filer who reports one would have their
 * "other assets" line silently become their total assets.
 */
function localName(concept: string): string {
  const underscore = concept.lastIndexOf("_");
  return underscore === -1 ? concept : concept.slice(underscore + 1);
}

function line(section: ReportedLine[] | undefined, concepts: string[]): number | null {
  if (!section) return null;
  for (const concept of concepts) {
    const hit = section.find((l) => localName(l.concept) === concept);
    if (hit && typeof hit.value === "number" && Number.isFinite(hit.value)) return hit.value;
  }
  return null;
}

/**
 * The synonym tables, and why each has more than one entry.
 *
 * Filers choose their own concepts within the taxonomy, and the choice tracks
 * the industry rather than any preference: Alphabet reports `CostOfRevenue`
 * where Procter & Gamble reports `CostOfGoodsAndServicesSold`, and Exxon
 * reports neither because an integrated oil major does not present a gross
 * margin at all. Every alternative below was found by reading real filings for
 * the seventy-two names in the universe, not from documentation.
 */
const REVENUE = [
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTaxProductAndService",
  "SalesRevenueNet",
  "SalesRevenueGoodsNet",
];

const COST_OF_REVENUE = [
  "CostOfGoodsAndServicesSold",
  "CostOfRevenue",
  "CostOfGoodsSold",
  "CostOfServices",
  // Deliberately **not** `CostsAndExpenses`. That is every operating cost, so
  // revenue minus it is operating income, not gross profit — and a gross
  // margin quietly holding an operating margin would make a Novy-Marx score
  // that looks computed and is measuring a different thing entirely.
];

const PRETAX = [
  "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
  "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
  "IncomeLossFromContinuingOperationsBeforeIncomeTaxes",
];

const INTEREST = ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt"];

const SHARE_COUNT = [
  "CommonStockSharesOutstanding",
  "WeightedAverageNumberOfDilutedSharesOutstanding",
  "WeightedAverageNumberOfSharesOutstandingBasic",
  "CommonStockSharesIssued",
];

/**
 * Filed fundamentals, from the two most recent annual reports.
 *
 * The engine's value and quality strategies all compare a figure to the same
 * figure a year earlier — accruals, asset growth, share issuance, margin
 * trend — so a single filing is not enough and the "prior" fields are the
 * previous 10-K rather than an estimate.
 *
 * `null` when the pair can't be assembled. `buildContext` drops the
 * instrument, the fundamental strategies abstain for it, and the ensemble
 * already handles abstention by shrinking coverage rather than confidence
 * (decision 011). A partially-invented balance sheet would instead produce a
 * confident number with nothing behind it.
 */
export function fundamentals(symbol: string, price: number): Promise<Fundamentals | null> {
  return cached("finnhub-fundamentals", symbol, { ttl: 12 * 3_600, maxAge: 30 * 86_400 }, async () => {
    const body = await fetchJson<ReportedResponse>(
      url("/stock/financials-reported", { symbol, freq: "annual" }),
    );

    const annual = (body.data ?? [])
      .filter((f) => f.form.startsWith("10-K") || f.form.startsWith("20-F"))
      .sort((a, b) => Date.parse(b.endDate) - Date.parse(a.endDate));

    const current = annual[0];
    const prior = annual[1];
    if (!current || !prior) return null;

    const at = (filing: ReportedFiling) => {
      const { bs, ic, cf } = filing.report;

      const netIncome = line(ic, ["NetIncomeLoss", "ProfitLoss"]);
      const revenue = line(ic, REVENUE);

      /**
       * Share count, derived from earnings per share where it isn't stated.
       *
       * Almost nobody puts a share count on the face of the balance sheet —
       * it lives on the cover page, which Finnhub does not parse. Diluted EPS
       * is on every income statement, and net income over diluted EPS *is* the
       * diluted share count: it is the definition rearranged, not an estimate.
       * This alone took coverage from thirty-two of seventy-two to most of the
       * universe.
       */
      const eps = line(ic, ["EarningsPerShareDiluted", "EarningsPerShareBasic"]);
      const shares =
        line(bs, SHARE_COUNT) ??
        line(ic, SHARE_COUNT) ??
        (netIncome !== null && eps !== null && eps !== 0 ? netIncome / eps : null);

      /**
       * EBIT, and the fallback is the definition rather than a proxy.
       *
       * Operating income is what most filers report. Those that don't — Exxon
       * and Disney among them — still report income before tax and interest
       * expense, and earnings *before interest and tax* is exactly their sum.
       */
      const pretax = line(ic, PRETAX);
      const interest = line(ic, INTEREST);
      const ebit =
        line(ic, ["OperatingIncomeLoss", "OperatingIncomeLossIncludingEquityMethodIncome"]) ??
        (pretax !== null ? pretax + (interest ?? 0) : null);

      // Gross profit is often left for the reader to subtract. Derived only
      // where a genuine cost-of-revenue line exists; see `COST_OF_REVENUE`.
      const cost = line(ic, COST_OF_REVENUE);
      const grossProfit =
        line(ic, ["GrossProfit"]) ??
        (revenue !== null && cost !== null ? revenue - cost : null);

      return {
        netIncome,
        revenue,
        shares,
        ebit,
        grossProfit,
        operatingCashFlow: line(cf, ["NetCashProvidedByUsedInOperatingActivities"]),
        totalAssets: line(bs, ["Assets"]),
        longTermDebt: line(bs, ["LongTermDebtNoncurrent", "LongTermDebt"]),
        currentAssets: line(bs, ["AssetsCurrent"]),
        currentLiabilities: line(bs, ["LiabilitiesCurrent"]),
        fixedAssets: line(bs, ["PropertyPlantAndEquipmentNet"]),
        cash: line(bs, ["CashAndCashEquivalentsAtCarryingValue"]),
      };
    };

    const now = at(current);
    const then = at(prior);

    const required = [
      now.netIncome, then.netIncome, now.operatingCashFlow,
      now.totalAssets, then.totalAssets, now.currentAssets, now.currentLiabilities,
      then.currentAssets, then.currentLiabilities, now.shares, then.shares,
      now.grossProfit, then.grossProfit, now.revenue, then.revenue, now.ebit,
    ];
    if (required.some((v) => v === null)) return null;

    const currentAssets = now.currentAssets!;
    const currentLiabilities = now.currentLiabilities!;
    const longTermDebt = now.longTermDebt ?? 0;

    return {
      netIncome: now.netIncome!,
      netIncomePrior: then.netIncome!,
      operatingCashFlow: now.operatingCashFlow!,
      totalAssets: now.totalAssets!,
      totalAssetsPrior: then.totalAssets!,
      longTermDebt,
      longTermDebtPrior: then.longTermDebt ?? 0,
      currentAssets,
      currentLiabilities,
      currentAssetsPrior: then.currentAssets!,
      currentLiabilitiesPrior: then.currentLiabilities!,
      sharesOutstanding: now.shares!,
      sharesOutstandingPrior: then.shares!,
      grossProfit: now.grossProfit!,
      grossProfitPrior: then.grossProfit!,
      revenue: now.revenue!,
      revenuePrior: then.revenue!,
      ebit: now.ebit!,
      netWorkingCapital: currentAssets - currentLiabilities,
      netFixedAssets: now.fixedAssets ?? 0,
      // Market cap plus debt less cash — the textbook definition, computed
      // from today's price rather than the price on the filing date, because
      // an earnings yield is a statement about what the market charges now.
      enterpriseValue: price * now.shares! + longTermDebt - (now.cash ?? 0),
    };
  });
}

/* ── News ──────────────────────────────────────────────────────────────── */

interface FinnhubNews {
  id: number;
  category: string;
  datetime: number;
  headline: string;
  source: string;
  summary: string;
  url: string;
  related: string;
}

const CATEGORY: Record<string, NewsCategory> = {
  crypto: "crypto",
  forex: "macro",
  economy: "macro",
  merger: "company",
  company: "company",
  business: "markets",
  general: "markets",
  "top news": "markets",
  technology: "markets",
};

/**
 * The name a headline actually uses, where it differs from the universe's.
 *
 * A short list, and every entry is a company whose common name is not its
 * registered one. Curating *names* is not curating trends — the counting still
 * happens over whatever the feed says (decision 081); this only makes sure the
 * count can see "Google" when the universe row says "Alphabet".
 */
export const ALIASES: Record<string, string[]> = {
  GOOGL: ["Google", "Alphabet"],
  META: ["Meta", "Facebook"],
  "BRK.B": ["Berkshire"],
  JPM: ["JPMorgan", "JP Morgan"],
  GS: ["Goldman Sachs"],
  MS: ["Morgan Stanley"],
  UNH: ["UnitedHealth"],
  TMO: ["Thermo Fisher"],
  ISRG: ["Intuitive Surgical"],
  COP: ["ConocoPhillips"],
  FCX: ["Freeport"],
  AMD: ["AMD"],
  NEAR: ["NEAR Protocol"],
  // International listings whose ember name is not what a headline calls them,
  // or is too short to match on safely. `BP` is the interesting one — see the
  // case-sensitivity note below.
  "BP.L": ["BP"],
  "SHEL.L": ["Shell"],
  "AZN.L": ["AstraZeneca"],
  "HSBA.L": ["HSBC"],
  "ULVR.L": ["Unilever"],
  "RIO.L": ["Rio Tinto"],
  "BATS.L": ["British American Tobacco"],
  "LSEG.L": ["London Stock Exchange"],
  "MC.PA": ["LVMH"],
  "OR.PA": ["L\u2019Or\u00e9al", "L'Oreal"],
  "ASML.AS": ["ASML"],
  "MBG.DE": ["Mercedes-Benz", "Mercedes"],
  "RACE.MI": ["Ferrari"],
  "NESN.SW": ["Nestl\u00e9", "Nestle"],
  "7203.T": ["Toyota"],
  "6758.T": ["Sony"],
  "9984.T": ["SoftBank"],
  "7974.T": ["Nintendo"],
  "8306.T": ["Mitsubishi UFJ"],
  "8035.T": ["Tokyo Electron"],
  "2330.TW": ["TSMC", "Taiwan Semiconductor"],
  "2317.TW": ["Hon Hai", "Foxconn"],
  "2454.TW": ["MediaTek"],
  "0700.HK": ["Tencent"],
  "9988.HK": ["Alibaba"],
  "3690.HK": ["Meituan"],
  "005930.KS": ["Samsung Electronics", "Samsung"],
  "000660.KS": ["SK hynix", "SK Hynix"],
  "005380.KS": ["Hyundai Motor", "Hyundai"],
  "RELIANCE.NS": ["Reliance Industries"],
  "TCS.NS": ["Tata Consultancy"],
  "HDFCBANK.NS": ["HDFC Bank"],
  "INFY.NS": ["Infosys"],
  "ICICIBANK.NS": ["ICICI Bank"],
  "BHARTIARTL.NS": ["Bharti Airtel"],
  "D05.SI": ["DBS Group", "DBS Bank"],
  "Z74.SI": ["Singtel"],
  "NPN.JO": ["Naspers"],
  "MTN.JO": ["MTN Group"],
  "SOL.JO": ["Sasol"],
  "AGL.JO": ["Anglo American"],
  "GFI.JO": ["Gold Fields"],
  "COMI.CA": ["Commercial International Bank"],
};

/**
 * Shortest token we will match case-insensitively.
 *
 * `BP` is two characters, and a two-character token matched without regard to
 * case is a liability — the same class of mistake as scanning prose for `SO`.
 * Matched *case-sensitively* it is fine: `\bBP\b` picks out the company and
 * leaves the rare lowercase "bp" alone. So short names get an exact-case
 * pattern rather than being dropped, which is what the old `length >= 3` filter
 * did — silently, so BP could never have been tagged at all.
 */
const CASE_INSENSITIVE_MIN = 3;

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Instruments a story is about, matched on company names — never on tickers,
 * and never on the first word of a multi-word name.
 *
 * Tickers are ruled out because fourteen of the seventy-two equities have one-
 * or two-letter symbols (`T`, `V`, `MA`, `GE`, `SO`, `KO`, `HD`, `BA`), and
 * scanning prose for them tags every story containing the word "so" as being
 * about Southern Company.
 *
 * **The first-word rule was the second-order version of the same mistake**, and
 * it shipped before being measured. Taking the stem of every name made
 * `Bank of America` into `\bBank\b`, which tagged seven unrelated banking
 * stories — putting "bank" at the top of the trending strip attributed to
 * Intel and BlackRock — and made `NEAR Protocol` into `\bNEAR\b`, which
 * matched the English word *near* in a story about Berkshire. So a multi-word
 * name must appear in full, aliases carry the handful of cases where the
 * common name differs, and precision beats recall: a trending strip that
 * claims to be counted has to be counting the right thing.
 */
export const NAME_MATCHERS: Array<{ symbol: string; pattern: RegExp; topic: string }> =
  INSTRUMENTS.filter((i) => i.market !== "fx").map((i) => {
    const names = ALIASES[i.symbol] ?? [i.name];
    const shortest = names.reduce((a, b) => (b.length < a.length ? b : a));
    const alternatives = names.map(escape).join("|");
    return {
      symbol: i.symbol,
      pattern: new RegExp(
        `\\b(?:${alternatives})\\b`,
        shortest.length >= CASE_INSENSITIVE_MIN ? "i" : "",
      ),
      // The topic reads as a word, so it is the shortest name we match on —
      // in its own casing. Lowercased, the strip's first-letter capital
      // produced "Bank of america".
      topic: shortest,
    };
  });

function toItem(raw: FinnhubNews, forSymbol?: string): NewsItem {
  const text = `${raw.headline} ${raw.summary}`;

  const symbols = new Set<string>();
  if (forSymbol) symbols.add(forSymbol);
  for (const part of raw.related.split(",")) {
    const symbol = part.trim();
    if (symbol && INSTRUMENT_BY_SYMBOL.has(symbol)) symbols.add(symbol);
  }

  const topics = new Set<string>();
  for (const matcher of NAME_MATCHERS) {
    if (!matcher.pattern.test(text)) continue;
    symbols.add(matcher.symbol);
    topics.add(matcher.topic);
  }

  const category = CATEGORY[raw.category?.toLowerCase() ?? ""] ?? "markets";
  /**
   * Only the categories that say something become topics.
   *
   * Every item is a market story about a company, so tagging them `markets`
   * and `companies` put those two at the top of the trending strip on every
   * refresh — measured at 150-odd mentions each against `disney` at three.
   * A chip that is always there and always first is not a measurement of what
   * is being written about, which is the entire claim the strip makes
   * (decision 081). `crypto` and `macro` survive because a day when either
   * dominates the feed is a real fact about the day.
   */
  if (category === "crypto" || category === "macro") topics.add(category);

  return {
    id: `fh-${raw.id}`,
    headline: raw.headline,
    // Finnhub's summary is the publisher's own standfirst. ember never writes
    // one: a sentence under a headline that ember composed would be ember
    // interpreting a story, which is the line ADR 0027 draws.
    summary: raw.summary || "",
    source: raw.source,
    at: raw.datetime * 1000,
    url: raw.url,
    symbols: [...symbols],
    topics: [...topics],
    category,
  };
}

/**
 * How many equities get a company-news call per background refresh.
 *
 * Twelve rather than eighteen, because these no longer have to arrive all at
 * once — the pool accumulates, so a smaller slice costs coverage *speed* rather
 * than coverage. Seventy-two names are covered in about an hour of an open tab.
 */
const COMPANY_SLICE = 12;

/** Oldest story the feed will hold, and the window company news is asked for. */
const WINDOW_DAYS = 2;

/**
 * A ceiling on the accumulated pool.
 *
 * The pool now grows across refreshes instead of resetting, so it needs a stop.
 * Two hundred is comfortably more than two days of news and keeps the response
 * near 110 KB — the whole feed ships in one payload because the "Yours" filter
 * and the trending strip are computed in the browser against all of it, which
 * is what keeps the user's holdings off this route entirely.
 */
const POOL_LIMIT = 200;

/** The two feeds worth a general call. `forex` and `merger` also work. */
const GENERAL_CATEGORIES = ["general", "crypto"];

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * General and crypto market news, with company news accumulating behind it.
 *
 * **The cold path is two calls, and that is the whole point of this shape.** It
 * used to be nineteen — one general feed plus eighteen company feeds — which at
 * Finnhub's one-a-second spacing is twenty seconds, and it was keyed on a
 * ten-minute slot. A new slot is a cache *miss*, so stale-while-revalidate
 * never applied and somebody paid the full twenty seconds every ten minutes,
 * forever. The cache namespace had eight slot keys in it with ages spread over
 * days, which is that bug written down.
 *
 * So the key is constant and the rotation moved *inside* the loader. A cold
 * miss now fetches only the two general feeds — about two seconds — and each
 * background refresh adds a slice of twelve company feeds to what is already
 * stored. The pool grows toward full coverage instead of resetting, which is
 * what the old comment claimed and the old code could not do.
 *
 * **Attribution is real, and this is the only condition under which ember
 * prints a publisher's name.** The mock invented outlets on purpose (ADR 0027):
 * a fabricated Reuters headline about a real company is a fake news story with
 * a real byline on it. Every `source` and `url` below belongs to whoever wrote
 * the thing.
 */
/**
 * Takes no `at`. The loader runs whenever the cache decides to refresh —
 * possibly long after the request that triggered it — so a timestamp captured
 * at call time would date the trailing window from the wrong moment.
 */
export function news(): Promise<NewsItem[]> {
  return cached("finnhub-news", "feed", { ttl: 600, maxAge: 4 * 3_600 }, async (previous) => {
    const now = Date.now();
    const general = await Promise.all(
      GENERAL_CATEGORIES.map((category) =>
        fetchJson<FinnhubNews[]>(url("/news", { category })).catch(() => []),
      ),
    );

    /**
     * Company news only on a refresh, never on the blocking path.
     *
     * A first visitor gets a full screen of real headlines in two seconds; the
     * company slice arrives behind them. The alternative — making them wait for
     * it — is the twenty seconds this rewrite exists to remove.
     */
    const company: NewsItem[] = [];
    if (previous !== undefined) {
      const equities = instrumentsIn("equity");
      const slot = Math.floor(now / 600_000);
      const start = (slot * COMPANY_SLICE) % Math.max(1, equities.length);
      const from = isoDay(now - WINDOW_DAYS * 86_400_000);
      const to = isoDay(now + 86_400_000);

      const slices = await Promise.all(
        Array.from({ length: Math.min(COMPANY_SLICE, equities.length) }, (_, i) => {
          const instrument = equities[(start + i) % equities.length];
          return fetchJson<FinnhubNews[]>(
            url("/company-news", { symbol: instrument.symbol, from, to }),
          )
            .then((rows) => rows.slice(0, 6).map((row) => toItem(row, instrument.symbol)))
            .catch(() => [] as NewsItem[]);
        }),
      );
      company.push(...slices.flat());
    }

    const cutoff = now - WINDOW_DAYS * 86_400_000;
    // Fresh rows first, so a story Finnhub re-issued under the same id with an
    // edited headline replaces the stored copy instead of sitting beside it.
    const items = [
      ...general.flat().map((row) => toItem(row)),
      ...company,
      ...(previous ?? []),
    ].filter((item) => item.at >= cutoff);

    // Wire services syndicate, so the same story arrives under several ids.
    const seen = new Set<string>();
    const byHeadline = new Map<string, NewsItem>();
    for (const item of items) {
      if (!item.headline || !item.url || seen.has(item.id)) continue;
      seen.add(item.id);
      const key = item.headline.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const existing = byHeadline.get(key);
      if (!existing) byHeadline.set(key, item);
      else {
        // Keep the one that knows more about which instruments it touches.
        existing.symbols = [...new Set([...existing.symbols, ...item.symbols])];
        existing.topics = [...new Set([...existing.topics, ...item.topics])];
      }
    }

    return [...byHeadline.values()].sort((a, b) => b.at - a.at).slice(0, POOL_LIMIT);
  });
}

/* ── Search ────────────────────────────────────────────────────────────── */

interface SearchResponse {
  result: Array<{ symbol: string; description: string; displaySymbol: string; type: string }>;
}

/**
 * Symbol search over every US listing.
 *
 * The seam's whole purpose (see `providers/types.ts`): the mock filtered a
 * hundred and ten compiled-in rows, and this asks an upstream that knows tens
 * of thousands. Results outside the universe come back as instruments ember
 * can name but cannot yet price — the add-an-instrument flow is what closes
 * that, and it is a separate piece of work.
 */
export function search(query: string, limit: number): Promise<Instrument[]> {
  const q = query.trim();
  if (q.length === 0) return Promise.resolve([]);

  return cached("finnhub-search", q.toLowerCase(), { ttl: 6 * 3_600, maxAge: 30 * 86_400 }, async () => {
    const body = await fetchJson<SearchResponse>(url("/search", { q, exchange: "US" }));
    return body.result
      .filter((row) => row.type === "Common Stock" && !row.symbol.includes("."))
      .slice(0, limit)
      .map((row) => {
        const known = INSTRUMENT_BY_SYMBOL.get(row.symbol);
        return {
          symbol: row.symbol,
          name: known?.name ?? row.description,
          market: "equity" as const,
          currency: "USD" as const,
          precision: 2,
          sector: known?.sector,
        };
      });
  });
}

/* ── Calendar ──────────────────────────────────────────────────────────── */

interface EarningsResponse {
  earningsCalendar?: Array<{ symbol: string; date: string; hour: string }>;
}

/**
 * Real earnings dates for the instruments ember watches.
 *
 * The event calendar exists so the engine can keep clear of a scheduled
 * release — `blackoutHours` either side of a print is what stops a window
 * opening into an earnings gap. Generated dates made that testable; filed ones
 * make it true.
 *
 * **Only earnings.** `/calendar/economic` is 403 on this key, so CPI and FOMC
 * dates are still modelled, and that split is stated in CLAUDE.md §8 rather
 * than smoothed over — a calendar that is half real and presented as whole is
 * the sort of thing this product exists not to do.
 */
export function earnings(at: number): Promise<MarketEvent[]> {
  const day = isoDay(at);
  return cached("finnhub-earnings", day, { ttl: 12 * 3_600, maxAge: 7 * 86_400 }, async () => {
    const body = await fetchJson<EarningsResponse>(
      url("/calendar/earnings", { from: day, to: isoDay(at + 45 * 86_400_000) }),
    );

    const events: MarketEvent[] = [];
    for (const row of body.earningsCalendar ?? []) {
      const instrument = INSTRUMENT_BY_SYMBOL.get(row.symbol);
      if (!instrument || instrument.market !== "equity") continue;

      // `hour` is "bmo" (before market open), "amc" (after market close) or
      // blank. Mapped to a US-Eastern wall time, which is what the blackout
      // window is measured against.
      const hour = row.hour === "bmo" ? 12 : row.hour === "amc" ? 21 : 20;
      const timestamp = Date.parse(`${row.date}T${String(hour).padStart(2, "0")}:00:00Z`);
      if (!Number.isFinite(timestamp)) continue;

      events.push({
        id: `earnings-${row.symbol}-${row.date}`,
        kind: "earnings",
        at: timestamp,
        label: `${instrument.name} earnings`,
        symbols: [row.symbol],
        markets: ["equity"],
        blackoutHoursBefore: 24,
        blackoutHoursAfter: 18,
      });
    }
    return events;
  });
}
