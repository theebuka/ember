/**
 * Re-measure the numbers ember quotes about itself.
 *
 * The track record, the payload sizes and the cold-route timings are all
 * stated in CLAUDE.md §8 and on the track-record page, and all three are
 * properties of the engine and the universe rather than of any screen. When
 * either changes they stop being true, and a documented figure that is quietly
 * wrong is worse than no figure at all on a product whose entire claim is that
 * you can go and check.
 *
 * So this is a script rather than a note in a commit message: the same
 * argument that made `audit.mjs` a gate rather than a report.
 *
 * It runs against a **production** build, like the other two scripts — and the
 * safe way to do that is `npm run verify`, which owns the server's lifecycle so
 * the thing being measured is provably the build that was just made:
 *
 *   npm run verify              # build · audit · capture · measure
 *   npm run verify -- --only=measure
 *
 * By hand, if you already have a server you trust:
 *
 *   node scripts/measure.mjs http://localhost:3100
 *
 * `next dev` recompiles per request, so every timing here would be measuring
 * the compiler.
 */

const BASE =
  process.argv[2] ?? process.env.EMBER_URL ?? "http://localhost:3100";
const PROFILES = ["conservative", "balanced", "aggressive"];

const pct = (v) => `${(v * 100).toFixed(1)}%`;
const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

async function timed(label, url, init) {
  const started = performance.now();
  const response = await fetch(url, init);
  const body = await response.text();
  const ms = Math.round(performance.now() - started);

  if (!response.ok) {
    console.error(`  ${label}: HTTP ${response.status} — ${body.slice(0, 200)}`);
    process.exitCode = 1;
    return { ms, bytes: body.length, json: null };
  }

  return { ms, bytes: Buffer.byteLength(body), json: JSON.parse(body) };
}

async function main() {
  console.log(`\nember · measurement against ${BASE}\n`);

  /* ── The universe ────────────────────────────────────────────────────── */

  const instruments = await timed("instruments", `${BASE}/api/instruments`);
  const byMarket = {};
  for (const instrument of instruments.json.instruments) {
    byMarket[instrument.market] = (byMarket[instrument.market] ?? 0) + 1;
  }

  console.log("Universe");
  console.log(`  ${instruments.json.instruments.length} instruments —`,
    Object.entries(byMarket).map(([m, n]) => `${n} ${m}`).join(", "));
  console.log(`  synthetic: ${instruments.json.synthetic}\n`);

  /* ── Route cost ──────────────────────────────────────────────────────────
     Cold first, then warm, because everything server-side is memoised for a
     minute and quoting only the warm number would describe a request almost
     nobody makes. */

  console.log("Routes — cold, then warm (60s memo)");

  const adviceCold = await timed("advice", `${BASE}/api/advice?profile=balanced`);
  const adviceWarm = await timed("advice", `${BASE}/api/advice?profile=balanced`);
  console.log(
    `  /api/advice          ${adviceCold.ms}ms → ${adviceWarm.ms}ms · ${kb(adviceCold.bytes)} · ${adviceCold.json.assessments.length} of ${adviceCold.json.assessed} shown, ${adviceCold.json.actionable.length} actionable`,
  );

  // A book big enough to exercise the risk engine on every trigger it can
  // reach: one position per market, opened far enough back to have an entry
  // read to compare against.
  const openedAt = Date.now() - 120 * 86_400_000;
  const positions = instruments.json.instruments
    .slice(0, 12)
    .map((instrument) => ({
      symbol: instrument.symbol,
      quantity: 10,
      averageCost: 100,
      openedAt,
    }));

  const findingsBody = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ profile: "balanced", positions, watching: null }),
  };

  const findingsCold = await timed("findings", `${BASE}/api/findings`, findingsBody);
  const findingsWarm = await timed("findings", `${BASE}/api/findings`, findingsBody);
  const kinds = {};
  for (const finding of findingsCold.json?.findings ?? []) {
    kinds[finding.kind] = (kinds[finding.kind] ?? 0) + 1;
  }
  console.log(
    `  /api/findings        ${findingsCold.ms}ms → ${findingsWarm.ms}ms · ${kb(findingsCold.bytes)} · ${findingsCold.json?.findings.length ?? 0} findings (${JSON.stringify(kinds)}) on ${positions.length} positions`,
  );

  const preview = await timed("risk-preview", `${BASE}/api/risk-preview`);
  console.log(`  /api/risk-preview    ${preview.ms}ms · ${kb(preview.bytes)}`);

  const asset = await timed("asset", `${BASE}/api/asset?symbol=AAPL&profile=balanced`);
  console.log(`  /api/asset?symbol=   ${asset.ms}ms · ${kb(asset.bytes)}\n`);

  /* ── The track record ────────────────────────────────────────────────── */

  console.log("Track record — walk-forward over the whole universe");
  for (const profile of PROFILES) {
    const record = await timed(profile, `${BASE}/api/track-record?profile=${profile}`);
    const r = record.json;
    if (!r) continue;

    console.log(
      `  ${profile.padEnd(13)} ${String(r.calls).padStart(4)} calls · hit ${pct(r.hitRate)} · avg ${pct(r.averageReturn)} · median ${pct(r.medianReturn)} · drawdown ${pct(r.maxDrawdown)} · stopped ${pct(r.stoppedOutRate)} · ${record.ms}ms`,
    );
  }

  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
