import { createClient } from "@supabase/supabase-js";
import type { Candle, Quote } from "@/lib/api/types";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import { cached } from "./cache";
import { fetchJson } from "./http";

/**
 * The Nigerian Exchange — priced from the exchange itself, with a history
 * ember has to build for itself.
 *
 * **The NGX serves today and only today.** Its REST API returns real OHLCV for
 * every listed symbol, and there is no way to ask for another date: every
 * spelling of a date parameter is accepted and ignored, and there is no
 * history, chart or index-history endpoint. Yahoo does not list the exchange.
 * Stooq is bot-walled. The feeds that do carry NGX history are paid.
 *
 * The engine needs two hundred daily bars before it will speak, so this module
 * does two separate things:
 *
 * - **Quotes come from the exchange, live, today.** That works with no backend
 *   configured at all, which is the point — an NGX instrument is priced for
 *   everybody from the first minute.
 * - **History comes from `ngx_daily`,** a table ember fills a row at a time via
 *   `scripts/collect-ngx.mjs`. Until it holds enough sessions the instrument is
 *   `collecting` and says so on screen.
 *
 * The alternative to collecting was to list Nigeria with prices and no view
 * forever, or to skip it. Neither is a good answer for the one exchange the
 * author's own currency trades on.
 */

const SNAPSHOT_BASE =
  "https://doclib.ngxgroup.com/REST/api/statistics/equities/?market=&sector=&orderby=";

/**
 * Fifty, because larger pages 502.
 *
 * Measured: `pageSize=5`, `20` and `50` return data; `100`, `200`, `300` and
 * `400` all answer 502 with an HTML error page. So the board is walked in
 * pages — three of them for the 147 currently listed symbols.
 */
const PAGE_SIZE = 50;

/**
 * How many stored sessions before the engine is allowed a view.
 *
 * The same two hundred bars every strategy warms up over, so this is not a
 * separate judgement — it is `CONTEXT_BARS`' floor restated for the one venue
 * whose history is accumulating rather than fetched. Below it, `getCandles`
 * returns nothing and `buildContext` drops the instrument, which is already the
 * behaviour for an instrument with too little history.
 */
export const MIN_SESSIONS = 200;

interface SnapshotRow {
  Symbol: string;
  PrevClosingPrice: number | null;
  OpeningPrice: number | null;
  HighPrice: number | null;
  LowPrice: number | null;
  ClosePrice: number | null;
  Volume: number | null;
  TradeDate: string;
}

/**
 * Today's board, for every listed symbol, in one request.
 *
 * Cached for fifteen minutes: the NGX session is four and a half hours long and
 * this is one call for the whole exchange, so there is nothing to gain by
 * asking more often and no quota to spend.
 */
export function snapshot(): Promise<SnapshotRow[]> {
  return cached("ngx-snapshot", "board", { ttl: 900, maxAge: 3 * 86_400 }, async () => {
    const rows: SnapshotRow[] = [];

    // Bounded rather than "until empty": an upstream that starts returning a
    // full page forever would otherwise loop until the request timed out. The
    // exchange lists under two hundred symbols, so ten pages is generous.
    for (let page = 0; page < 10; page += 1) {
      const batch = await fetchJson<SnapshotRow[]>(
        `${SNAPSHOT_BASE}&pageSize=${PAGE_SIZE}&pageNo=${page}`,
      );
      rows.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }

    return rows;
  });
}

/** The NGX symbol for an ember symbol. Identical — the suffix is empty. */
function ngxSymbol(symbol: string): string {
  return symbol;
}

export async function quote(symbol: string, at: number): Promise<Quote | null> {
  const rows = await snapshot();
  const row = rows.find((r) => r.Symbol === ngxSymbol(symbol));
  if (!row) return null;

  /**
   * Mid-session the NGX reports a previous close and leaves the rest null.
   *
   * So "today's price" is the close if there is one, the open if trading has
   * started, and the previous close otherwise — in that order. Falling straight
   * back to the previous close would show yesterday's number as today's during
   * every live session.
   */
  const price = row.ClosePrice ?? row.OpeningPrice ?? row.PrevClosingPrice;
  const previousClose = row.PrevClosingPrice;
  if (price === null || previousClose === null) return null;

  const change = price - previousClose;

  return {
    symbol,
    price,
    change,
    changePct: previousClose === 0 ? 0 : change / previousClose,
    previousClose,
    // Null until the exchange has printed a range, and claiming one before then
    // would be inventing two numbers.
    dayHigh: row.HighPrice ?? price,
    dayLow: row.LowPrice ?? price,
    at: Date.parse(row.TradeDate) || at,
  };
}

/* ── The history ember is collecting ───────────────────────────────────── */

/**
 * A plain anon client, with no cookies and no session.
 *
 * `lib/supabase/server.ts` builds a request-scoped client so RLS can see who is
 * asking. This table is public market data with a `select` policy for `anon`, so
 * there is nobody to be — and using the request-scoped client would tie a market
 * data read to a user's session for no reason.
 */
function publicClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface StoredBar {
  session: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Stored sessions for one symbol, oldest first.
 *
 * Empty until the table holds `MIN_SESSIONS` of them — not truncated, *empty*.
 * Handing the engine eighty bars would have it either refuse the instrument
 * anyway or, worse, compute an indicator over a window shorter than the one it
 * was published for. An instrument that is still collecting has no series, and
 * the UI says which of those two things it is.
 *
 * Also empty with no Supabase project configured, which is a supported way to
 * run ember (ADR 0031) — NGX is then priced and never assessed.
 */
export function dailyCandles(symbol: string): Promise<Candle[]> {
  return cached("ngx-history", symbol, { ttl: 6 * 3_600, maxAge: 7 * 86_400 }, async () => {
    const supabase = publicClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("ngx_daily")
      .select("session, open, high, low, close, volume")
      .eq("symbol", ngxSymbol(symbol))
      .order("session", { ascending: true });

    if (error || !data || data.length < MIN_SESSIONS) return [];

    return (data as StoredBar[]).map((bar) => ({
      t: Date.parse(`${bar.session}T00:00:00Z`),
      o: Number(bar.open),
      h: Number(bar.high),
      l: Number(bar.low),
      c: Number(bar.close),
      v: Number(bar.volume),
    }));
  });
}

/**
 * How many sessions ember holds for a symbol — what the "collecting" copy
 * quotes so it can say how far along it is rather than just that it is waiting.
 */
export function storedSessions(symbol: string): Promise<number> {
  return cached("ngx-count", symbol, { ttl: 6 * 3_600, maxAge: 7 * 86_400 }, async () => {
    const supabase = publicClient();
    if (!supabase) return 0;

    const { count, error } = await supabase
      .from("ngx_daily")
      .select("session", { count: "exact", head: true })
      .eq("symbol", ngxSymbol(symbol));

    return error ? 0 : (count ?? 0);
  });
}
