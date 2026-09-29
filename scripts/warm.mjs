#!/usr/bin/env node
/**
 * Fill the market cache before anyone reads it.
 *
 * A cold universe is 72 Yahoo calls plus 24 CoinGecko coins at thirty requests
 * a minute — over a minute of upstream time that no amount of concurrency
 * shortens, because the quota is the wall. `loadUniverse` no longer blocks on
 * it (`LOAD_DEADLINE_MS`), so a cold server is usable immediately and fills in
 * behind the reader. This script is for when you would rather it were already
 * full: before a demo, after a deploy, or on a schedule.
 *
 * **It drives the real routes rather than importing the provider.** Importing
 * would mean a TypeScript loader and a second code path that can drift from the
 * one the app actually uses; hitting `/api/advice` warms exactly what a visitor
 * would warm, through exactly the same cache. It also means this works against
 * a deployed instance, not only a local one.
 *
 * Usage:
 *   node scripts/warm.mjs [baseUrl]        # defaults to http://localhost:3000
 *
 * Safe to run against a server on generated data — it will simply report zero
 * pending on the first pass and exit.
 *
 * **It warms a process, not a store.** Everything this fills lives in the
 * server's own memory and `.cache/market/` tiers, so it warms the instance it is
 * pointed at and nothing else — on a serverless platform the next container is
 * cold again. A shared warm store was planned for phase 22, deferred to 26, and
 * deferred again there for a reason that turned out not to be scheduling: see ADR
 * 0037 and CLAUDE.md §8 for the three options and why none of them is small.
 */

const BASE = process.argv[2] ?? process.env.EMBER_BASE ?? "http://localhost:3000";

/** How long to keep asking before giving up on a stuck upstream. */
const BUDGET_MS = 6 * 60_000;
/** Between passes. The server is rate-limited upstream; hammering it achieves nothing. */
const INTERVAL_MS = 10_000;

async function get(path) {
  const response = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return response.json();
}

function seconds(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

async function main() {
  const started = Date.now();
  console.log(`warming ${BASE}\n`);

  // News first: two upstream calls, and it is the screen most likely to be
  // opened cold. The company-news slice only fetches on a *refresh*, so a
  // second pass at the end is what starts it accumulating.
  let t = Date.now();
  const news = await get("/api/news");
  console.log(
    `news        ${seconds(Date.now() - t).padStart(7)} · ${news.items.length} items · ${news.trending.length} topics`,
  );

  if (news.synthetic) {
    console.log("\nProvider is generated data — nothing upstream to warm.");
    return;
  }

  // Then the universe, one profile. The other two share the same loaded
  // candles, so warming `balanced` warms all three.
  let pass = 0;
  for (;;) {
    pass += 1;
    t = Date.now();
    const advice = await get("/api/advice?profile=balanced");
    const took = Date.now() - t;

    console.log(
      `advice #${String(pass).padEnd(2)} ${seconds(took).padStart(7)} · ${advice.assessed} assessed · ${advice.pending} pending`,
    );

    if (advice.pending === 0) break;

    if (Date.now() - started > BUDGET_MS) {
      console.error(
        `\nGave up with ${advice.pending} still pending after ${seconds(Date.now() - started)}.`,
      );
      console.error(
        "Not necessarily a failure — an instrument whose upstream is down stays pending, and\n" +
          "the app reports that count rather than hiding it.",
      );
      process.exitCode = 1;
      return;
    }

    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }

  // A second news pass, now that there is a stored value: this is the one that
  // triggers the company-news slice and starts the pool accumulating.
  t = Date.now();
  const refreshed = await get("/api/news");
  console.log(
    `news        ${seconds(Date.now() - t).padStart(7)} · ${refreshed.items.length} items`,
  );

  console.log(`\nwarm in ${seconds(Date.now() - started)}`);
}

main().catch((error) => {
  console.error(`\nwarm failed: ${error.message}`);
  console.error(`Is a server running at ${BASE}?`);
  process.exitCode = 1;
});
