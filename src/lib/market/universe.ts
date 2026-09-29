import { CURRENCY_META, type Currency, type Instrument, type MarketKind } from "@/lib/api/types";
import { EXCHANGES, type ExchangeId } from "@/lib/market/exchanges";

/**
 * The instrument universe, plus the parameters the mock generator needs.
 *
 * `anchorPrice` is where the generated series is rescaled to end, so current
 * prices land somewhere plausible rather than wherever a random walk happened
 * to wander. Drift and volatility set the *shape* of the path; the anchor
 * sets its level. Rescaling by a constant preserves every return in the
 * series, so the indicators see an untouched path.
 *
 * These are synthetic. Nothing here is a real quote — see CLAUDE.md §8.
 *
 * **Written as rows, not as objects.** v1 held thirteen instruments as
 * fully-spelled literals, which was fine at thirteen and unreadable at a
 * hundred: the parameters are a table, and a table of a hundred rows where
 * every field is named on its own line is a table nobody can scan for the one
 * value that looks wrong. The constructors below name the columns once.
 */
export interface InstrumentSpec extends Instrument {
  /** Where the generated series is rescaled to finish. */
  anchorPrice: number;
  /** Annualised drift of the generated path. */
  drift: number;
  /** Annualised baseline volatility. */
  vol: number;
  /** Probability per bar of a jump — earnings, news, a liquidation cascade. */
  jumpRate: number;
  /** Typical daily volume, for the volume series. */
  baseVolume: number;
  /** Crypto only: circulating supply, for market cap. */
  supply?: number;
}

/**
 * Jump intensity is derived from volatility rather than set per row.
 *
 * It was a hand-set field on each of the thirteen originals and every value
 * tracked the instrument's volatility, because that is what the field means:
 * a name that moves a lot gaps more often. At a hundred rows, hand-setting a
 * hundred numbers that all follow one rule is a hundred chances to typo the
 * rule.
 */
function jumpRateFor(vol: number, market: MarketKind): number {
  const base = market === "crypto" ? 0.024 : market === "fx" ? 0.04 : 0.023;
  return Number((vol * base).toFixed(4));
}

/**
 * An equity on a named venue.
 *
 * Currency and precision come from the **exchange** rather than being passed,
 * because both are properties of where a thing trades rather than of the thing:
 * Shell is quoted in pence in London and dollars in New York, and won and yen
 * are quoted in whole units while everything else takes two decimals. Passing
 * them per row would be ninety-two chances to disagree with the venue.
 *
 * `anchorPrice` is in **major units** — pounds, not pence; rand, not cents. The
 * live provider divides London and Johannesburg quotes down at the point it
 * builds candles (`providers/live/yahoo.ts`), so by the time anything else sees
 * a price it is already in major units, and the generated path has to match or
 * the mock and the feed would disagree by a factor of a hundred.
 */
function listed(
  exchangeId: ExchangeId,
  symbol: string,
  name: string,
  sector: string,
  anchorPrice: number,
  drift: number,
  vol: number,
  baseVolume: number,
): InstrumentSpec {
  const exchange = EXCHANGES[exchangeId];
  return {
    symbol,
    name,
    market: "equity",
    currency: exchange.currency,
    precision: CURRENCY_META[exchange.currency].decimals,
    sector,
    exchange: exchangeId,
    anchorPrice,
    drift,
    vol,
    jumpRate: jumpRateFor(vol, "equity"),
    baseVolume,
  };
}

/**
 * A listing ember can price but not yet assess.
 *
 * Only the NGX today. Everything else about it is an ordinary equity — it has a
 * real live price, it appears in search and on the watchlist, a user can hold it
 * and see it valued. What it does not have is a history, so `getCandles`
 * returns nothing until `ngx_daily` holds two hundred sessions and the engine
 * declines to form a view.
 *
 * The flag exists so the UI can tell the two silences apart. An instrument the
 * engine considered and had no view on, and one it *cannot* consider yet, look
 * identical on screen — and the first is a judgement while the second is a
 * wait. Presenting a wait as a judgement is the more damaging of the two.
 */
function collecting(
  symbol: string,
  name: string,
  sector: string,
  anchorPrice: number,
  drift: number,
  vol: number,
  baseVolume: number,
): InstrumentSpec {
  return {
    ...listed("XNSA", symbol, name, sector, anchorPrice, drift, vol, baseVolume),
    dataState: "collecting",
  };
}

/** A US listing. The seventy-two originals, unchanged. */
function equity(
  symbol: string,
  name: string,
  sector: string,
  anchorPrice: number,
  drift: number,
  vol: number,
  baseVolume: number,
): InstrumentSpec {
  return listed("XNYS", symbol, name, sector, anchorPrice, drift, vol, baseVolume);
}

function crypto(
  symbol: string,
  name: string,
  anchorPrice: number,
  drift: number,
  vol: number,
  baseVolume: number,
  supply: number,
): InstrumentSpec {
  return {
    symbol,
    name,
    market: "crypto",
    currency: "USD",
    // Below a dollar, two decimals rounds a token to nothing. The threshold is
    // the same one `formatQuotePrice` would need if it were guessing, which is
    // exactly why it doesn't have to — the precision is declared here.
    precision: anchorPrice >= 1000 ? 0 : anchorPrice >= 1 ? 2 : 4,
    anchorPrice,
    drift,
    vol,
    jumpRate: jumpRateFor(vol, "crypto"),
    baseVolume,
    supply,
  };
}

function fx(
  symbol: string,
  name: string,
  currency: Currency,
  anchorPrice: number,
  drift: number,
  vol: number,
): InstrumentSpec {
  return {
    symbol,
    name,
    market: "fx",
    currency,
    // JPY crosses are quoted to two places, everything else to four. Not a
    // guess — it is the interbank convention, and getting it wrong makes a
    // pip look like a percent.
    precision: currency === "JPY" ? 2 : 4,
    anchorPrice,
    drift,
    vol,
    jumpRate: jumpRateFor(vol, "fx"),
    baseVolume: 0,
  };
}

export const INSTRUMENTS: InstrumentSpec[] = [
  // ── Equities ─────────────────────────────────────────────────────────────
  // Spread across sectors on purpose: the cross-sectional strategies rank an
  // instrument against its market, and a universe of sixty megacap technology
  // names would make "ranks in the top decile" a statement about nothing.
  equity("AAPL", "Apple", "Technology", 241.8, 0.11, 0.26, 54_000_000),
  equity("MSFT", "Microsoft", "Software", 468.2, 0.13, 0.23, 22_000_000),
  equity("NVDA", "NVIDIA", "Semiconductors", 186.4, 0.32, 0.47, 210_000_000),
  equity("AMZN", "Amazon", "Consumer discretionary", 228.6, 0.14, 0.3, 41_000_000),
  equity("GOOGL", "Alphabet", "Technology", 212.4, 0.12, 0.28, 28_000_000),
  equity("META", "Meta Platforms", "Technology", 724.5, 0.18, 0.36, 14_000_000),
  equity("TSLA", "Tesla", "Automotive", 302.5, 0.02, 0.56, 88_000_000),
  equity("AVGO", "Broadcom", "Semiconductors", 342.7, 0.24, 0.4, 27_000_000),
  equity("AMD", "AMD", "Semiconductors", 168.3, 0.15, 0.51, 46_000_000),
  equity("INTC", "Intel", "Semiconductors", 24.6, -0.08, 0.48, 92_000_000),
  equity("QCOM", "Qualcomm", "Semiconductors", 172.9, 0.08, 0.33, 9_400_000),
  equity("TXN", "Texas Instruments", "Semiconductors", 198.4, 0.06, 0.27, 5_800_000),
  equity("MU", "Micron", "Semiconductors", 118.2, 0.19, 0.49, 21_000_000),
  equity("ORCL", "Oracle", "Software", 214.8, 0.21, 0.32, 11_000_000),
  equity("CRM", "Salesforce", "Software", 268.1, 0.07, 0.31, 6_200_000),
  equity("ADBE", "Adobe", "Software", 386.4, -0.02, 0.33, 3_400_000),
  equity("NOW", "ServiceNow", "Software", 962.3, 0.16, 0.32, 1_400_000),
  equity("INTU", "Intuit", "Software", 648.9, 0.09, 0.29, 1_600_000),
  equity("IBM", "IBM", "Technology", 268.7, 0.1, 0.22, 4_100_000),
  equity("CSCO", "Cisco", "Technology", 68.4, 0.07, 0.21, 18_000_000),
  equity("NFLX", "Netflix", "Media", 892.6, 0.2, 0.34, 3_200_000),
  equity("DIS", "Disney", "Media", 108.9, 0.03, 0.28, 9_800_000),
  equity("CMCSA", "Comcast", "Media", 36.2, -0.03, 0.24, 21_000_000),
  equity("JPM", "JPMorgan Chase", "Financials", 289.4, 0.09, 0.21, 9_500_000),
  equity("BAC", "Bank of America", "Financials", 47.8, 0.08, 0.25, 38_000_000),
  equity("WFC", "Wells Fargo", "Financials", 78.3, 0.1, 0.26, 17_000_000),
  equity("GS", "Goldman Sachs", "Financials", 612.7, 0.14, 0.27, 2_100_000),
  equity("MS", "Morgan Stanley", "Financials", 138.2, 0.11, 0.26, 7_400_000),
  equity("BLK", "BlackRock", "Financials", 1_042.6, 0.09, 0.23, 620_000),
  equity("SCHW", "Charles Schwab", "Financials", 84.1, 0.07, 0.28, 8_900_000),
  equity("V", "Visa", "Financials", 342.8, 0.11, 0.19, 6_100_000),
  equity("MA", "Mastercard", "Financials", 562.4, 0.12, 0.19, 2_800_000),
  equity("AXP", "American Express", "Financials", 302.9, 0.13, 0.24, 2_600_000),
  equity("PYPL", "PayPal", "Financials", 71.3, -0.01, 0.37, 12_000_000),
  equity("BRK.B", "Berkshire Hathaway", "Financials", 486.2, 0.08, 0.16, 3_700_000),
  equity("JNJ", "Johnson & Johnson", "Healthcare", 162.4, 0.04, 0.16, 7_200_000),
  equity("UNH", "UnitedHealth", "Healthcare", 318.6, -0.06, 0.31, 4_900_000),
  equity("LLY", "Eli Lilly", "Healthcare", 812.4, 0.22, 0.3, 3_100_000),
  equity("PFE", "Pfizer", "Healthcare", 26.1, -0.04, 0.23, 42_000_000),
  equity("MRK", "Merck", "Healthcare", 92.7, 0.02, 0.21, 11_000_000),
  equity("ABBV", "AbbVie", "Healthcare", 198.3, 0.12, 0.2, 6_400_000),
  equity("TMO", "Thermo Fisher", "Healthcare", 512.8, 0.05, 0.24, 1_800_000),
  equity("ISRG", "Intuitive Surgical", "Healthcare", 528.4, 0.15, 0.28, 1_500_000),
  equity("XOM", "Exxon Mobil", "Energy", 118.6, 0.06, 0.24, 16_000_000),
  equity("CVX", "Chevron", "Energy", 156.2, 0.05, 0.23, 8_100_000),
  equity("COP", "ConocoPhillips", "Energy", 96.4, 0.04, 0.28, 6_300_000),
  equity("SLB", "SLB", "Energy", 38.2, -0.02, 0.32, 12_000_000),
  equity("NEE", "NextEra Energy", "Utilities", 74.9, 0.05, 0.22, 12_000_000),
  equity("DUK", "Duke Energy", "Utilities", 118.3, 0.04, 0.16, 3_200_000),
  equity("SO", "Southern Company", "Utilities", 92.6, 0.05, 0.16, 4_100_000),
  equity("WMT", "Walmart", "Consumer staples", 98.4, 0.14, 0.19, 18_000_000),
  equity("COST", "Costco", "Consumer staples", 942.8, 0.13, 0.2, 2_100_000),
  equity("PG", "Procter & Gamble", "Consumer staples", 158.2, 0.03, 0.15, 7_800_000),
  equity("KO", "Coca-Cola", "Consumer staples", 71.4, 0.06, 0.15, 14_000_000),
  equity("PEP", "PepsiCo", "Consumer staples", 142.6, 0.01, 0.17, 6_200_000),
  equity("MCD", "McDonald's", "Consumer discretionary", 312.8, 0.07, 0.17, 3_100_000),
  equity("NKE", "Nike", "Consumer discretionary", 68.9, -0.05, 0.31, 11_000_000),
  equity("SBUX", "Starbucks", "Consumer discretionary", 94.2, 0.02, 0.27, 9_400_000),
  equity("HD", "Home Depot", "Consumer discretionary", 386.4, 0.06, 0.22, 3_600_000),
  equity("BA", "Boeing", "Industrials", 182.6, 0.03, 0.42, 8_200_000),
  equity("CAT", "Caterpillar", "Industrials", 398.2, 0.12, 0.27, 2_900_000),
  equity("GE", "GE Aerospace", "Industrials", 268.4, 0.19, 0.29, 4_800_000),
  equity("UPS", "UPS", "Industrials", 96.8, -0.04, 0.26, 5_100_000),
  equity("LMT", "Lockheed Martin", "Industrials", 468.2, 0.05, 0.2, 1_200_000),
  equity("HON", "Honeywell", "Industrials", 218.6, 0.06, 0.2, 2_700_000),
  equity("LIN", "Linde", "Materials", 462.8, 0.08, 0.19, 1_700_000),
  equity("FCX", "Freeport-McMoRan", "Materials", 46.2, 0.09, 0.38, 15_000_000),
  equity("NEM", "Newmont", "Materials", 58.4, 0.16, 0.36, 12_000_000),
  equity("PLD", "Prologis", "Real estate", 108.2, 0.02, 0.25, 4_200_000),
  equity("AMT", "American Tower", "Real estate", 196.4, 0.01, 0.24, 2_400_000),
  equity("T", "AT&T", "Telecoms", 28.6, 0.07, 0.2, 34_000_000),
  equity("VZ", "Verizon", "Telecoms", 42.3, 0.02, 0.19, 19_000_000),

  // ── International equities ───────────────────────────────────────────────
  // Ninety-two listings across nine venues, and **every ticker was probed
  // against the live feed before it was written down** — 1,214 to 1,280 daily
  // bars each. Roche was dropped because Yahoo does not answer for `ROG.SW`; a
  // row that cannot be priced is a row that vanishes silently, which is the
  // failure `mapping.test.ts` exists to catch.
  //
  // The probe is also what confirmed the trap this whole phase turns on:
  // London comes back as `GBp` and Johannesburg as `ZAc`. Anchors below are in
  // major units.

  // Europe: London. Quoted in pence upstream; anchors here are pounds.
  listed("XLON", "SHEL.L", "Shell", "Energy", 33.14, 0.06, 0.24, 25_000_000),
  listed("XLON", "AZN.L", "AstraZeneca", "Healthcare", 115.84, 0.11, 0.22, 2_100_000),
  listed("XLON", "HSBA.L", "HSBC", "Financials", 15.4, 0.1, 0.23, 28_000_000),
  listed("XLON", "ULVR.L", "Unilever", "Consumer staples", 45.18, 0.04, 0.17, 4_800_000),
  listed("XLON", "BP.L", "BP", "Energy", 5.2, 0.02, 0.28, 40_000_000),
  listed("XLON", "RIO.L", "Rio Tinto", "Materials", 71.56, 0.05, 0.27, 3_200_000),
  listed("XLON", "GSK.L", "GSK", "Healthcare", 18.37, 0.07, 0.23, 8_400_000),
  listed("XLON", "DGE.L", "Diageo", "Consumer staples", 17.4, -0.04, 0.24, 5_100_000),
  listed("XLON", "LSEG.L", "London Stock Exchange Group", "Financials", 85.66, 0.09, 0.24, 1_100_000),
  listed("XLON", "BATS.L", "British American Tobacco", "Consumer staples", 41.88, 0.12, 0.21, 4_600_000),
  listed("XLON", "REL.L", "RELX", "Media", 25.12, 0.1, 0.19, 3_400_000),
  listed("XLON", "NG.L", "National Grid", "Utilities", 11.88, 0.05, 0.18, 9_200_000),

  // Europe: Xetra.
  listed("XETR", "SAP.DE", "SAP", "Software", 179.24, 0.19, 0.27, 2_800_000),
  listed("XETR", "SIE.DE", "Siemens", "Industrials", 284.35, 0.13, 0.26, 1_700_000),
  listed("XETR", "ALV.DE", "Allianz", "Financials", 441.2, 0.11, 0.2, 700_000),
  listed("XETR", "DTE.DE", "Deutsche Telekom", "Telecoms", 28.46, 0.08, 0.19, 6_400_000),
  listed("XETR", "MBG.DE", "Mercedes-Benz", "Automotive", 45.97, -0.03, 0.3, 3_100_000),
  listed("XETR", "BAS.DE", "BASF", "Materials", 50.91, 0.01, 0.27, 2_400_000),
  listed("XETR", "BMW.DE", "BMW", "Automotive", 59.26, -0.02, 0.29, 1_600_000),
  listed("XETR", "IFX.DE", "Infineon", "Semiconductors", 62.55, 0.14, 0.4, 5_200_000),
  listed("XETR", "RWE.DE", "RWE", "Utilities", 59.58, 0.06, 0.28, 2_200_000),

  // Europe: Paris.
  listed("XPAR", "MC.PA", "LVMH", "Consumer discretionary", 453.6, 0.02, 0.28, 700_000),
  listed("XPAR", "OR.PA", "L\u2019Oréal", "Consumer staples", 374.9, 0.01, 0.24, 600_000),
  listed("XPAR", "TTE.PA", "TotalEnergies", "Energy", 75.91, 0.05, 0.24, 4_100_000),
  listed("XPAR", "SU.PA", "Schneider Electric", "Industrials", 309.75, 0.15, 0.27, 900_000),
  listed("XPAR", "AIR.PA", "Airbus", "Industrials", 215.2, 0.16, 0.28, 1_200_000),
  listed("XPAR", "SAN.PA", "Sanofi", "Healthcare", 75.98, 0.03, 0.22, 2_600_000),
  listed("XPAR", "BNP.PA", "BNP Paribas", "Financials", 111.66, 0.13, 0.26, 2_300_000),
  listed("XPAR", "DG.PA", "Vinci", "Industrials", 120.5, 0.08, 0.21, 800_000),
  listed("XPAR", "RMS.PA", "Hermès", "Consumer discretionary", 1562.0, 0.09, 0.26, 90_000),

  // Europe: Amsterdam.
  listed("XAMS", "ASML.AS", "ASML", "Semiconductors", 1624.8, 0.22, 0.36, 900_000),
  listed("XAMS", "INGA.AS", "ING Groep", "Financials", 31.02, 0.14, 0.26, 8_100_000),
  listed("XAMS", "AD.AS", "Ahold Delhaize", "Consumer staples", 32.08, 0.05, 0.19, 3_200_000),
  listed("XAMS", "PHIA.AS", "Philips", "Healthcare", 23.54, 0.03, 0.32, 3_600_000),
  listed("XAMS", "HEIA.AS", "Heineken", "Consumer staples", 72.46, -0.02, 0.22, 900_000),

  // Europe: Milan.
  listed("XMIL", "RACE.MI", "Ferrari", "Automotive", 363.1, 0.13, 0.27, 300_000),
  listed("XMIL", "ENEL.MI", "Enel", "Utilities", 9.53, 0.07, 0.21, 28_000_000),
  listed("XMIL", "ISP.MI", "Intesa Sanpaolo", "Financials", 6.91, 0.16, 0.25, 90_000_000),
  listed("XMIL", "UCG.MI", "UniCredit", "Financials", 84.98, 0.24, 0.29, 9_400_000),
  listed("XMIL", "ENI.MI", "Eni", "Energy", 23.67, 0.04, 0.23, 11_000_000),

  // Europe: Zurich.
  listed("XSWX", "NESN.SW", "Nestlé", "Consumer staples", 79.44, -0.03, 0.18, 4_200_000),
  listed("XSWX", "NOVN.SW", "Novartis", "Healthcare", 122.88, 0.09, 0.2, 3_100_000),
  listed("XSWX", "UBSG.SW", "UBS Group", "Financials", 43.55, 0.12, 0.28, 5_400_000),
  listed("XSWX", "ZURN.SW", "Zurich Insurance", "Financials", 590.6, 0.08, 0.17, 500_000),
  listed("XSWX", "ABBN.SW", "ABB", "Industrials", 83.6, 0.14, 0.25, 3_300_000),

  // Asia-Pacific: Tokyo. Whole yen, and a lunch break.
  listed("XTKS", "7203.T", "Toyota", "Automotive", 3013, 0.06, 0.24, 35_000_000),
  listed("XTKS", "6758.T", "Sony", "Technology", 3780, 0.12, 0.28, 12_000_000),
  listed("XTKS", "8306.T", "Mitsubishi UFJ", "Financials", 3649, 0.18, 0.27, 60_000_000),
  listed("XTKS", "9984.T", "SoftBank Group", "Technology", 5886, 0.15, 0.44, 14_000_000),
  listed("XTKS", "6861.T", "Keyence", "Industrials", 86_750, 0.04, 0.29, 600_000),
  listed("XTKS", "7974.T", "Nintendo", "Media", 8761, 0.1, 0.28, 4_100_000),
  listed("XTKS", "4502.T", "Takeda", "Healthcare", 5513, 0.01, 0.22, 6_200_000),
  listed("XTKS", "8035.T", "Tokyo Electron", "Semiconductors", 60_090, 0.16, 0.44, 3_400_000),

  // Asia-Pacific: Taipei.
  listed("XTAI", "2330.TW", "TSMC", "Semiconductors", 2400, 0.28, 0.34, 32_000_000),
  listed("XTAI", "2317.TW", "Hon Hai", "Technology", 255, 0.14, 0.32, 48_000_000),
  listed("XTAI", "2454.TW", "MediaTek", "Semiconductors", 4050, 0.11, 0.41, 6_800_000),

  // Asia-Pacific: Hong Kong. Lunch break, like Tokyo.
  listed("XHKG", "0700.HK", "Tencent", "Technology", 446.4, 0.14, 0.32, 18_000_000),
  listed("XHKG", "9988.HK", "Alibaba", "Consumer discretionary", 122.2, 0.06, 0.42, 28_000_000),
  listed("XHKG", "1299.HK", "AIA Group", "Financials", 73.4, 0.02, 0.28, 22_000_000),
  listed("XHKG", "0939.HK", "China Construction Bank", "Financials", 8.9, 0.09, 0.24, 240_000_000),
  listed("XHKG", "3690.HK", "Meituan", "Consumer discretionary", 87.65, -0.06, 0.48, 24_000_000),

  // Asia-Pacific: Seoul. Whole won.
  listed("XKRX", "005930.KS", "Samsung Electronics", "Semiconductors", 274_500, 0.13, 0.31, 12_000_000),
  listed("XKRX", "000660.KS", "SK hynix", "Semiconductors", 1_645_000, 0.3, 0.46, 2_800_000),
  listed("XKRX", "005380.KS", "Hyundai Motor", "Automotive", 453_000, 0.08, 0.29, 900_000),
  listed("XKRX", "051910.KS", "LG Chem", "Materials", 280_500, -0.05, 0.38, 400_000),

  // Asia-Pacific: Mumbai.
  listed("XNSE", "RELIANCE.NS", "Reliance Industries", "Energy", 1316.0, 0.09, 0.24, 11_000_000),
  listed("XNSE", "TCS.NS", "Tata Consultancy Services", "Software", 2313.2, 0.02, 0.22, 2_400_000),
  listed("XNSE", "HDFCBANK.NS", "HDFC Bank", "Financials", 729.0, 0.11, 0.21, 18_000_000),
  listed("XNSE", "INFY.NS", "Infosys", "Software", 1139.9, 0.04, 0.25, 8_600_000),
  listed("XNSE", "ICICIBANK.NS", "ICICI Bank", "Financials", 1415.3, 0.14, 0.22, 12_000_000),
  listed("XNSE", "BHARTIARTL.NS", "Bharti Airtel", "Telecoms", 1969.3, 0.18, 0.24, 7_100_000),

  // Asia-Pacific: Singapore. Lunch break.
  listed("XSES", "D05.SI", "DBS Group", "Financials", 76.88, 0.13, 0.19, 4_800_000),
  listed("XSES", "O39.SI", "OCBC", "Financials", 31.55, 0.1, 0.18, 6_200_000),
  listed("XSES", "Z74.SI", "Singtel", "Telecoms", 4.46, 0.12, 0.21, 32_000_000),

  // Africa: Johannesburg. Quoted in cents upstream; anchors here are rand.
  listed("XJSE", "NPN.JO", "Naspers", "Technology", 797.7, 0.11, 0.31, 1_400_000),
  listed("XJSE", "MTN.JO", "MTN Group", "Telecoms", 192.05, 0.09, 0.36, 7_200_000),
  listed("XJSE", "SOL.JO", "Sasol", "Energy", 184.93, -0.08, 0.45, 5_100_000),
  listed("XJSE", "FSR.JO", "FirstRand", "Financials", 98.91, 0.08, 0.28, 14_000_000),
  listed("XJSE", "SBK.JO", "Standard Bank", "Financials", 316.99, 0.1, 0.27, 4_200_000),
  listed("XJSE", "AGL.JO", "Anglo American", "Materials", 860.73, 0.06, 0.38, 3_800_000),
  listed("XJSE", "BID.JO", "Bid Corporation", "Consumer staples", 436.08, 0.07, 0.24, 1_100_000),
  listed("XJSE", "CPI.JO", "Capitec", "Financials", 4840.69, 0.18, 0.3, 400_000),
  listed("XJSE", "SHP.JO", "Shoprite", "Consumer staples", 307.75, 0.09, 0.26, 2_100_000),
  listed("XJSE", "ABG.JO", "Absa Group", "Financials", 223.81, 0.07, 0.29, 3_400_000),
  listed("XJSE", "IMP.JO", "Impala Platinum", "Materials", 217.52, 0.02, 0.52, 6_800_000),
  listed("XJSE", "GFI.JO", "Gold Fields", "Materials", 668.94, 0.21, 0.42, 5_200_000),

  // Africa: Cairo.
  listed("XCAI", "COMI.CA", "Commercial International Bank", "Financials", 81.2, 0.14, 0.31, 8_400_000),
  listed("XCAI", "HRHO.CA", "EFG Holding", "Financials", 21.55, 0.11, 0.38, 12_000_000),
  listed("XCAI", "TMGH.CA", "Talaat Moustafa Group", "Real estate", 58.0, 0.16, 0.36, 9_100_000),
  listed("XCAI", "SWDY.CA", "Elsewedy Electric", "Industrials", 47.69, 0.13, 0.35, 4_600_000),
  listed("XCAI", "EAST.CA", "Eastern Company", "Consumer staples", 21.8, 0.05, 0.3, 6_200_000),
  listed("XCAI", "ABUK.CA", "Abu Qir Fertilizers", "Materials", 58.32, 0.08, 0.33, 3_100_000),

  // ── Africa: Lagos, and the one venue with no history to fetch ────────────
  //
  // Twelve NGX listings, priced live from the exchange's own API and **not
  // assessed**. The NGX serves today and only today — no history endpoint, no
  // honoured date parameter, and Yahoo does not list the exchange — so ember
  // stores a session a day itself (`ngx_daily`) and the engine starts forming a
  // view when it holds two hundred of them, roughly ten months out.
  //
  // They carry `dataState: "collecting"` so a screen can say which of the two
  // silences it is looking at: a priced instrument with no signal is otherwise
  // indistinguishable from one the engine considered and had no view on, and
  // the second is a judgement while the first is a wait.
  collecting("DANGCEM", "Dangote Cement", "Materials", 1034, 0.12, 0.3, 4_200_000),
  collecting("MTNN", "MTN Nigeria", "Telecoms", 805, 0.18, 0.36, 2_800_000),
  collecting("AIRTELAFRI", "Airtel Africa", "Telecoms", 6300, 0.14, 0.33, 900_000),
  collecting("GTCO", "Guaranty Trust", "Financials", 128.5, 0.22, 0.34, 38_000_000),
  collecting("ZENITHBANK", "Zenith Bank", "Financials", 122.6, 0.2, 0.33, 44_000_000),
  collecting("UBA", "United Bank for Africa", "Financials", 45.5, 0.19, 0.35, 52_000_000),
  collecting("ACCESSCORP", "Access Holdings", "Financials", 27.05, 0.17, 0.37, 68_000_000),
  collecting("NESTLE", "Nestl\u00e9 Nigeria", "Consumer staples", 2800, 0.09, 0.28, 180_000),
  collecting("DANGSUGAR", "Dangote Sugar", "Consumer staples", 64.55, 0.11, 0.34, 12_000_000),
  collecting("BUACEMENT", "BUA Cement", "Materials", 316, 0.13, 0.29, 1_400_000),
  collecting("SEPLAT", "Seplat Energy", "Energy", 11200.6, 0.16, 0.38, 320_000),
  collecting("TRANSCORP", "Transcorp", "Industrials", 37, 0.15, 0.42, 24_000_000),

  // ── Crypto ───────────────────────────────────────────────────────────────
  crypto("BTC", "Bitcoin", 104_820, 0.28, 0.52, 38_000, 19_880_000),
  crypto("ETH", "Ethereum", 3_912.4, 0.22, 0.66, 420_000, 120_600_000),
  crypto("SOL", "Solana", 214.7, 0.3, 0.92, 3_100_000, 545_000_000),
  crypto("BNB", "BNB", 682.4, 0.18, 0.61, 480_000, 140_000_000),
  crypto("XRP", "XRP", 2.34, 0.24, 0.88, 82_000_000, 58_400_000_000),
  crypto("ADA", "Cardano", 0.92, 0.11, 0.86, 94_000_000, 36_200_000_000),
  crypto("AVAX", "Avalanche", 38.6, 0.14, 0.94, 4_800_000, 420_000_000),
  crypto("DOT", "Polkadot", 6.42, 0.04, 0.85, 12_000_000, 1_540_000_000),
  crypto("LINK", "Chainlink", 24.86, 0.16, 0.83, 12_400_000, 657_000_000),
  // POL, not MATIC. Polygon migrated its native token in 2024 and MATIC is
  // now a legacy contract — CoinGecko still answers for it, but with only
  // eighty-seven days of daily history, which is a third of what the engine
  // needs before it will say anything. A row that cannot go live is a row that
  // is wrong about the market, and the market moved.
  crypto("POL", "Polygon", 0.48, -0.06, 0.91, 62_000_000, 10_100_000_000),
  crypto("UNI", "Uniswap", 12.84, 0.09, 0.89, 9_200_000, 600_000_000),
  crypto("AAVE", "Aave", 286.4, 0.21, 0.95, 640_000, 15_100_000),
  crypto("ATOM", "Cosmos", 5.86, -0.03, 0.87, 14_000_000, 390_000_000),
  crypto("NEAR", "NEAR Protocol", 4.62, 0.12, 0.98, 18_000_000, 1_220_000_000),
  crypto("APT", "Aptos", 8.94, 0.07, 1.02, 11_000_000, 620_000_000),
  crypto("ARB", "Arbitrum", 0.64, -0.08, 0.99, 84_000_000, 4_600_000_000),
  crypto("OP", "Optimism", 1.12, -0.05, 1.01, 32_000_000, 1_680_000_000),
  crypto("LTC", "Litecoin", 108.4, 0.06, 0.68, 3_400_000, 75_600_000),
  crypto("BCH", "Bitcoin Cash", 486.2, 0.1, 0.74, 780_000, 19_820_000),
  crypto("XLM", "Stellar", 0.34, 0.08, 0.9, 128_000_000, 30_400_000_000),
  crypto("FIL", "Filecoin", 4.28, -0.09, 0.96, 16_000_000, 640_000_000),
  crypto("ICP", "Internet Computer", 8.16, -0.04, 0.97, 6_800_000, 512_000_000),
  crypto("INJ", "Injective", 22.4, 0.13, 1.06, 4_200_000, 98_000_000),
  crypto("TIA", "Celestia", 4.86, -0.02, 1.08, 14_000_000, 236_000_000),

  // ── Forex ────────────────────────────────────────────────────────────────
  fx("EURUSD", "Euro / US dollar", "USD", 1.0942, 0.004, 0.072),
  fx("GBPUSD", "British pound / US dollar", "USD", 1.2914, -0.002, 0.079),
  fx("USDJPY", "US dollar / Japanese yen", "JPY", 149.86, 0.018, 0.089),
  fx("AUDUSD", "Australian dollar / US dollar", "USD", 0.6482, -0.006, 0.085),
  fx("NZDUSD", "New Zealand dollar / US dollar", "USD", 0.5914, -0.008, 0.091),
  fx("USDCAD", "US dollar / Canadian dollar", "CAD", 1.3862, 0.011, 0.062),
  fx("USDCHF", "US dollar / Swiss franc", "CHF", 0.8746, 0.007, 0.068),
  fx("EURGBP", "Euro / British pound", "GBP", 0.8472, 0.005, 0.054),
  fx("EURJPY", "Euro / Japanese yen", "JPY", 163.98, 0.021, 0.086),
  fx("GBPJPY", "British pound / Japanese yen", "JPY", 193.54, 0.019, 0.098),
  fx("AUDJPY", "Australian dollar / Japanese yen", "JPY", 97.14, 0.012, 0.102),
  fx("CADJPY", "Canadian dollar / Japanese yen", "JPY", 108.12, 0.009, 0.094),
  fx("CHFJPY", "Swiss franc / Japanese yen", "JPY", 171.36, 0.014, 0.081),
  fx("EURCHF", "Euro / Swiss franc", "CHF", 0.9568, -0.003, 0.048),
];

/**
 * The public fields of an `Instrument`, and a compile-time check that this list
 * is all of them.
 *
 * **This exists because of a bug that silently undid a whole phase.** Both
 * providers mapped a spec to an `Instrument` with a hand-written object literal,
 * and when `exchange` was added the literals were not updated — so
 * `computeWindow` never saw a venue and every equity, Tokyo and Lagos included,
 * was still evaluated against New York hours. Nothing failed; the feature just
 * did not happen.
 *
 * A rest-spread would also fix it, but eslint objects to the discarded
 * bindings. This is better anyway: `AssertExhaustive` makes *adding* a field to
 * `Instrument` without listing it here a type error, which a spread cannot do.
 */
const INSTRUMENT_FIELDS = [
  "symbol",
  "name",
  "market",
  "currency",
  "precision",
  "sector",
  "exchange",
  "dataState",
] as const satisfies readonly (keyof Instrument)[];

/**
 * A type error here names a field added to `Instrument` and not listed above.
 *
 * Exported only so the linter can see it is used. It is a type, so nothing is
 * emitted — the whole point is that `tsc` fails rather than a field being
 * quietly dropped on its way to every screen, which is what happened to
 * `exchange`.
 */
export type InstrumentFieldsAreComplete = [
  Exclude<keyof Instrument, (typeof INSTRUMENT_FIELDS)[number]>,
] extends [never]
  ? true
  : never;

/**
 * A spec as the rest of the app sees it — generation parameters removed.
 *
 * One implementation shared by both providers, because two copies is how the
 * bug above happened. `undefined` fields are omitted rather than serialised, so
 * a crypto row does not ship `"exchange": null` to every client.
 */
export function toInstrument(spec: InstrumentSpec): Instrument {
  const out: Record<string, unknown> = {};
  for (const field of INSTRUMENT_FIELDS) {
    const value = spec[field];
    if (value !== undefined) out[field] = value;
  }
  return out as unknown as Instrument;
}

export const INSTRUMENT_BY_SYMBOL = new Map<string, InstrumentSpec>(
  INSTRUMENTS.map((i) => [i.symbol, i]),
);

export function instrumentsIn(market: MarketKind): InstrumentSpec[] {
  return INSTRUMENTS.filter((i) => i.market === market);
}

/** Crypto trades every day; everything else follows the exchange calendar. */
export function periodsPerYearFor(market: MarketKind): number {
  return market === "crypto" ? 365 : 252;
}

/**
 * Search the universe by symbol or name.
 *
 * Lives here so the shape is settled before it needs to be a network call.
 * The mock answers it out of the compiled-in registry; a live provider will
 * answer it from an upstream symbol-search endpoint, which is what turns the
 * watchlist's "add" control from a filter over a fixed list into genuine
 * search-and-add. Making that a provider capability now means the day live
 * data goes on it is a second implementation of an existing method rather
 * than a refactor of every screen that touches the instrument list.
 *
 * Exact symbol matches rank first, then symbol prefixes, then anything whose
 * name contains the query — so typing "so" offers SOL and Southern Company
 * before Solana-adjacent noise, and typing "SOL" puts SOL at the top.
 */
export function searchInstruments(query: string, limit = 20): InstrumentSpec[] {
  const q = query.trim().toUpperCase();
  if (q.length === 0) return INSTRUMENTS.slice(0, limit);

  const scored = INSTRUMENTS.map((instrument) => {
    const symbol = instrument.symbol.toUpperCase();
    const name = instrument.name.toUpperCase();

    const score =
      symbol === q
        ? 0
        : symbol.startsWith(q)
          ? 1
          : name.startsWith(q)
            ? 2
            : symbol.includes(q)
              ? 3
              : name.includes(q)
                ? 4
                : -1;

    return { instrument, score };
  }).filter((entry) => entry.score >= 0);

  scored.sort(
    (a, b) =>
      a.score - b.score || a.instrument.symbol.localeCompare(b.instrument.symbol),
  );

  return scored.slice(0, limit).map((entry) => entry.instrument);
}

/**
 * Annualised policy rates, used by the FX carry strategy.
 *
 * Synthetic, but in a plausible relative ordering — the carry signal is about
 * differentials, so what matters is that JPY and CHF sit far below USD, and
 * that the commodity currencies sit near it.
 */
export const POLICY_RATES: Record<Currency, number> = {
  USD: 0.0385,
  EUR: 0.0225,
  GBP: 0.0375,
  JPY: 0.0075,
  CHF: 0.005,
  AUD: 0.0335,
  CAD: 0.0295,
  NZD: 0.0315,
  NGN: 0.245,
  // The quote currencies of the international listings. No pair trades in
  // them, so the carry strategy never reads these — they are here because
  // `Record<Currency, …>` is exhaustive and because `fxLegs` validates against
  // this table. Maintained by hand like the rest: no free API serves
  // central-bank targets, which is in §8 rather than glossed over.
  ZAR: 0.07,
  EGP: 0.21,
  HKD: 0.045,
  KRW: 0.025,
  INR: 0.055,
  SGD: 0.02,
  TWD: 0.0175,
};

/** The two legs of an FX pair, for the carry calculation. */
export function fxLegs(symbol: string): { base: Currency; quote: Currency } | null {
  const base = symbol.slice(0, 3) as Currency;
  const quote = symbol.slice(3, 6) as Currency;
  if (!(base in POLICY_RATES) || !(quote in POLICY_RATES)) return null;
  return { base, quote };
}

/**
 * USD per one unit of each currency — for converting a portfolio into the
 * user's chosen base.
 */
export const USD_PER_UNIT: Record<Currency, number> = {
  USD: 1,
  EUR: 1.0942,
  GBP: 1.2914,
  JPY: 1 / 149.86,
  CHF: 1 / 0.8746,
  AUD: 0.6482,
  CAD: 1 / 1.3862,
  NZD: 0.5914,
  NGN: 1 / 1357,
  ZAR: 1 / 18.2,
  EGP: 1 / 50.17,
  HKD: 1 / 7.79,
  KRW: 1 / 1380,
  INR: 1 / 88,
  SGD: 1 / 1.29,
  TWD: 1 / 31.8,
};

/** The risk-free hurdle for absolute momentum. */
export const RISK_FREE_RATE = POLICY_RATES.USD;
