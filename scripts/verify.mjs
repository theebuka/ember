/**
 * The gate — build, serve, audit, capture, measure, stop.
 *
 *   node scripts/verify.mjs              # build first, then everything
 *   node scripts/verify.mjs --skip-build # reuse the build already on disk
 *   node scripts/verify.mjs --only=audit,measure
 *
 * **This exists because of a false result, not for convenience.** The three
 * scripts each say "run against a production build" and each takes a base URL,
 * which left the server's lifecycle in the operator's hands — and phase 17
 * opened by rebuilding underneath a `next start` that a previous session had
 * left running on 3100. `next start` resolves its manifests at boot, so the
 * old process went on serving a build whose chunks no longer existed: the
 * audit reported seven violations on Home, four of them the Next.js error page
 * wearing a `#__next_error__` id, and every one of them was a lie about the
 * code. Ten minutes went into reading a defect that did not exist.
 *
 * The fix is not a warning in a comment. It is owning the process: the server
 * this starts is the build it just made, it is killed on the way out, and a
 * port that is already occupied is a hard failure rather than something to
 * quietly attach to.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.EMBER_PORT ?? 3100);
const BASE = `http://localhost:${PORT}`;

const args = process.argv.slice(2);
const skipBuild = args.includes("--skip-build");
const only = args
  .find((a) => a.startsWith("--only="))
  ?.slice("--only=".length)
  .split(",");

/** Order matters: the audit is the gate, so it runs before the slow ones. */
const STEPS = [
  { name: "audit", script: "scripts/audit.mjs" },
  { name: "capture", script: "scripts/capture.mjs" },
  { name: "perf", script: "scripts/perf.mjs" },
  { name: "measure", script: "scripts/measure.mjs" },
];

/**
 * The gate always measures generated data, never the live feed.
 *
 * `.env.local` may well say `EMBER_DATA_PROVIDER=live`, and every number this
 * script produces would then be a fact about the market rather than about
 * ember: layout shift changes with how many findings the day happens to
 * produce, the screenshot set is different every run, and a quiet news day
 * empties a screen the capture is supposed to prove exists. The mock is
 * deterministic given a symbol and a date, which is the only reason the
 * figures in CLAUDE.md §8 mean anything.
 *
 * It also keeps the gate off the quota. A full run touches every screen
 * several times over; against live providers that is hundreds of upstream
 * calls to prove something that does not depend on them.
 */
const GENERATED = { ...process.env, EMBER_DATA_PROVIDER: "mock" };

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

/** Occupied means someone else's build. Refuse rather than measure it. */
async function portIsFree() {
  try {
    await fetch(BASE, { signal: AbortSignal.timeout(1500) });
    return false;
  } catch {
    return true;
  }
}

async function waitForReady(server, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error("the server exited during startup");
    try {
      // Any status is fine — `/` 307s to onboarding without the cookie, which
      // is itself proof the proxy is up and answering.
      await fetch(BASE, { redirect: "manual", signal: AbortSignal.timeout(1500) });
      return;
    } catch {
      await sleep(400);
    }
  }
  throw new Error(`the server never answered on ${BASE}`);
}

async function main() {
  if (!(await portIsFree())) {
    console.error(
      `\nSomething is already serving ${BASE}.\n\n` +
        `It is almost certainly an older \`next start\` left over from a previous\n` +
        `session, and it will serve a stale build — which is exactly the failure\n` +
        `this script exists to prevent. Stop it first:\n\n` +
        `  lsof -ti :${PORT} | xargs kill\n`,
    );
    process.exit(1);
  }

  if (!skipBuild) {
    console.log("\n── build\n");
    const code = await run("npm", ["run", "build"], { env: GENERATED });
    if (code !== 0) process.exit(code);
  }

  const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    stdio: ["ignore", "ignore", "inherit"],
    env: GENERATED,
  });

  let failed = 0;
  try {
    await waitForReady(server);
    console.log(`\n── serving ${BASE}\n`);

    for (const step of STEPS) {
      if (only && !only.includes(step.name)) continue;
      console.log(`\n── ${step.name}\n`);
      const code = await run("node", [step.script, BASE]);
      if (code !== 0) {
        console.error(`\n${step.name} failed (exit ${code}).`);
        failed += 1;
      }
    }
  } finally {
    server.kill("SIGTERM");
    // Give it a moment to release the port, so a second run doesn't trip the
    // occupied-port check on a socket that is merely closing.
    await sleep(500);
    if (server.exitCode === null) server.kill("SIGKILL");
  }

  console.log(failed === 0 ? "\n── all steps passed\n" : `\n── ${failed} step(s) failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
