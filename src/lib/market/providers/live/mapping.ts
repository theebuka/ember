import type { Currency } from "@/lib/api/types";
import type { Exchange } from "@/lib/market/exchanges";

/**
 * ember's symbols, and what each upstream calls the same instrument.
 *
 * The universe uses the name a person would type — `AAPL`, `BTC`, `EURUSD` —
 * and every provider spells at least one of those differently. Keeping the
 * translation in one file rather than in each adapter means a symbol that
 * doesn't resolve is one lookup to diagnose, and it makes the *gaps* visible:
 * anything missing from these tables is an instrument that cannot go live, and
 * that shows up here as an absent row rather than as a silent empty chart.
 */

/**
 * CoinGecko's coin ids.
 *
 * Not derivable from the ticker — `AVAX` is `avalanche-2`, `BNB` is
 * `binancecoin`, and `NEAR` is `near` while `NEAR Protocol` is not. Every id
 * here was resolved against `/coins/markets` rather than guessed.
 *
 * Polygon is `POL`, not `MATIC`. The original contract still resolves —
 * `matic-network` answers — but with eighty-seven days of daily history
 * against POL's three hundred and sixty-five, because it is a legacy token
 * nobody trades. That is the shape of a delisting, and the universe row was
 * renamed rather than pointed at a successor under the old ticker: silently
 * repricing a symbol somebody holds against a different asset's series is how
 * a cost basis becomes fiction.
 */
export const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple",
  ADA: "cardano",
  AVAX: "avalanche-2",
  DOT: "polkadot",
  LINK: "chainlink",
  POL: "polygon-ecosystem-token",
  UNI: "uniswap",
  AAVE: "aave",
  ATOM: "cosmos",
  NEAR: "near",
  APT: "aptos",
  ARB: "arbitrum",
  OP: "optimism",
  LTC: "litecoin",
  BCH: "bitcoin-cash",
  XLM: "stellar",
  FIL: "filecoin",
  ICP: "internet-computer",
  INJ: "injective-protocol",
  TIA: "celestia",
};

export const SYMBOL_BY_COINGECKO_ID = new Map(
  Object.entries(COINGECKO_IDS).map(([symbol, id]) => [id, symbol]),
);

/**
 * Yahoo's ticker for an ember equity.
 *
 * ember's symbol for a non-US listing already carries its venue suffix —
 * `SHEL.L`, `7203.T`, `NPN.JO` — because that is what a person recognises and
 * because a bare `SHEL` would collide with a US line of the same company. Those
 * pass through untouched.
 *
 * US symbols are the exception, and it is a real one: Yahoo writes a share
 * class with a hyphen where the exchange and Finnhub use a dot, so `BRK.B` has
 * to become `BRK-B`. Getting that backwards returns an empty series, which is
 * indistinguishable from an instrument the engine had no view on — it is why
 * `mapping.test.ts` asserts both directions.
 */
export function yahooTicker(symbol: string, exchange?: Exchange | null): string {
  const suffix = exchange?.yahooSuffix ?? "";
  if (suffix && symbol.endsWith(suffix)) return symbol;
  return symbol.replace(".", "-");
}

/**
 * The currencies the FX universe is built from.
 *
 * Frankfurter answers one request with every rate against a base, so all
 * fourteen crosses come from a single call per day rather than fourteen. The
 * list is derived from the pairs rather than typed twice — see `fxLegs`.
 */
export const FX_CURRENCIES: Currency[] = ["EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"];

/**
 * Quote currencies the ECB also publishes, so a portfolio can convert out of
 * them without a second source.
 *
 * Probed against `/v1/currencies`: the ECB's daily reference set covers thirty
 * currencies including all five of these.
 */
export const ECB_QUOTE_CURRENCIES: Currency[] = ["ZAR", "HKD", "KRW", "INR", "SGD"];

/**
 * The three the ECB does not publish, and where they come from instead.
 *
 * Measured: `/v1/currencies` has no TWD, EGP or NGN. Yahoo answers for all
 * three (`USDTWD=X`, `USDEGP=X`, `USDNGN=X` — 261 bars each), so they are
 * filled from there. **This is the naira finally becoming live**, which
 * CLAUDE.md §8 has been flagging as the author's own currency carrying a
 * compiled figure — and it deepens the one unlicensed dependency, so it is
 * recorded in §7 beside it rather than passed over.
 */
export const YAHOO_FX_CURRENCIES: Currency[] = ["TWD", "EGP", "NGN"];

/**
 * Every currency ember asks the ECB for.
 *
 * Frankfurter has no rate for the dollar against itself; `USD` is added by the
 * adapter as 1.
 */
export const CONVERSION_CURRENCIES: Currency[] = [
  ...FX_CURRENCIES,
  ...ECB_QUOTE_CURRENCIES,
];
