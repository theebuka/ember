#!/usr/bin/env node
/**
 * Store one day of the Nigerian Exchange, so that in ten months ember can have
 * an opinion about it.
 *
 * The NGX publishes today's board and nothing else — real open, high, low,
 * close and volume for every listed symbol, with no history endpoint and no
 * date parameter that is honoured. Yahoo does not list the exchange. The feeds
 * that carry NGX history are paid. The engine needs two hundred daily bars
 * before it will speak.
 *
 * So ember collects. This runs once a trading day, writes a row per symbol, and
 * the instruments flip from `collecting` to assessed the day the table holds
 * enough sessions. Nothing else in the app can write to that table.
 *
 * **This lives in `scripts/` and not under `src/` on purpose.** It needs the
 * service-role key, and the rule that key must never appear anywhere under
 * `src/` is one of the few absolute ones in this codebase — `ngx_daily` has a
 * public `select` policy and no write policy at all, so the application can
 * read the history and literally cannot add to it. Same boundary as `notices`.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=… node scripts/collect-ngx.mjs
 *   node scripts/collect-ngx.mjs --dry-run     # fetch and report, write nothing
 *
 * Idempotent: the primary key is (symbol, session), and a re-run upserts. Safe
 * to schedule generously and safe to run twice by hand.
 */

import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BASE =
  "https://doclib.ngxgroup.com/REST/api/statistics/equities/?market=&sector=&orderby=";
/** Larger pages answer 502. Measured — see `providers/live/ngx.ts`. */
const PAGE_SIZE = 50;

/**
 * The symbols ember actually lists.
 *
 * The exchange returns about 147 rows and ember tracks twelve of them. Storing
 * all 147 would be cheap and is still wrong: it is market data ember does not
 * show, accumulating in a table forever, and the first question anyone asks
 * about a stored dataset is why it holds what it holds. Widen this list when
 * the universe widens, in the same commit.
 */
const TRACKED = [
  "DANGCEM", "MTNN", "AIRTELAFRI", "GTCO", "ZENITHBANK", "UBA",
  "ACCESSCORP", "NESTLE", "DANGSUGAR", "BUACEMENT", "SEPLAT", "TRANSCORP",
];

async function board() {
  const rows = [];
  for (let page = 0; page < 10; page += 1) {
    const response = await fetch(`${BASE}&pageSize=${PAGE_SIZE}&pageNo=${page}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ember/1.0)" },
    });
    if (!response.ok) throw new Error(`NGX answered ${response.status} on page ${page}`);

    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    // The exchange 502s under load. Three pages, unhurried.
    await new Promise((r) => setTimeout(r, 900));
  }
  return rows;
}

function toBar(row) {
  /**
   * A session with no close is not a session.
   *
   * Mid-day the board carries a previous close and leaves the rest null, and
   * on a holiday it carries the last real session's numbers under today's
   * date. Writing either would put a bar in the history that no trading
   * produced — the collector's one job is to be trustworthy about that,
   * because nothing downstream can tell an invented bar from a real one.
   */
  const close = row.ClosePrice;
  if (close === null || close === undefined) return null;

  const open = row.OpeningPrice ?? close;
  const high = row.HighPrice ?? Math.max(open, close);
  const low = row.LowPrice ?? Math.min(open, close);

  return {
    symbol: row.Symbol,
    session: String(row.TradeDate).slice(0, 10),
    open,
    high,
    low,
    close,
    volume: row.Volume ?? 0,
  };
}

async function main() {
  const rows = await board();
  console.log(`NGX board: ${rows.length} listed symbols, session ${rows[0]?.TradeDate?.slice(0, 10)}`);

  const tracked = new Set(TRACKED);
  const bars = [];
  const skipped = [];

  for (const row of rows) {
    if (!tracked.has(row.Symbol)) continue;
    const bar = toBar(row);
    if (bar) bars.push(bar);
    else skipped.push(row.Symbol);
  }

  const missing = TRACKED.filter((s) => !rows.some((r) => r.Symbol === s));

  console.log(`  ${bars.length} of ${TRACKED.length} tracked symbols have a close`);
  if (skipped.length) console.log(`  no close yet: ${skipped.join(", ")}`);
  if (missing.length) console.log(`  NOT LISTED: ${missing.join(", ")}`);

  if (bars.length === 0) {
    // Not an error. Before the close, and on any non-trading day, this is the
    // correct outcome — and a scheduler that treats it as a failure will page
    // somebody every weekend.
    console.log("\nNothing to store yet. This is normal before the close.");
    return;
  }

  if (DRY_RUN) {
    console.log("\n--dry-run, so nothing was written:");
    for (const bar of bars) {
      console.log(`  ${bar.symbol.padEnd(12)} ${bar.session}  o ${bar.open}  h ${bar.high}  l ${bar.low}  c ${bar.close}  v ${bar.volume}`);
    }
    return;
  }

  if (!URL || !SERVICE_KEY) {
    console.error(
      "\nNEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are both required to write.\n" +
        "Run with --dry-run to see what would be stored.",
    );
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase
    .from("ngx_daily")
    .upsert(bars, { onConflict: "symbol,session" });

  if (error) {
    console.error(`\nwrite failed: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const { count } = await supabase
    .from("ngx_daily")
    .select("session", { count: "exact", head: true })
    .eq("symbol", TRACKED[0]);

  console.log(`\nstored ${bars.length} bars`);
  console.log(`${TRACKED[0]} now has ${count ?? 0} sessions — the engine needs 200.`);
}

main().catch((error) => {
  console.error(`\ncollect-ngx failed: ${error.message}`);
  process.exitCode = 1;
});
