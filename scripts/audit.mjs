/**
 * Accessibility audit — axe-core over every screen, both themes, two widths.
 *
 * Run against a *production* server, not `next dev`: the dev overlay injects
 * its own DOM, the service worker is deliberately not registered in
 * development, and React's development build renders extra attributes.
 * Auditing any of that is auditing the harness.
 *
 * `npm run verify` builds, serves and runs this — use it. Starting a server by
 * hand and pointing this at it is how phase 17 spent ten minutes reading seven
 * violations that were a stale process rather than the code (`verify.mjs`).
 *
 *   npm run verify -- --only=audit
 *   node scripts/audit.mjs [baseUrl]     # if you already trust the server
 *
 * Writes docs/case-study/accessibility.md and exits non-zero on any violation,
 * so it can be a gate rather than a report nobody reads.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const BASE = process.argv[2] ?? "http://localhost:3100";
const OUT = "docs/case-study";

/** Every screen, plus the states that only exist after an interaction. */
const ROUTES = [
  { path: "/", name: "Home" },
  { path: "/portfolio", name: "Portfolio — holdings" },
  // Watching and Activity are segments of the same route, not screens of
  // their own, and axe only sees what is mounted. Auditing `/portfolio` alone
  // would leave two thirds of that screen unchecked.
  { path: "/portfolio?view=watching", name: "Portfolio — watching" },
  { path: "/portfolio?view=activity", name: "Portfolio — activity" },
  { path: "/signals", name: "Signals feed" },
  { path: "/news", name: "News" },
  { path: "/signals/track-record", name: "Track record" },
  { path: "/signals/methodology", name: "Methodology" },
  { path: "/asset/NVDA", name: "Asset detail" },
  { path: "/settings", name: "Settings — account" },
  { path: "/settings?tab=data", name: "Settings — your data" },
  { path: "/settings?tab=about", name: "Settings — about" },
  { path: "/notifications", name: "Notifications" },
  // Renders its "nothing to sign in to" state without credentials, which is
  // the state the gate runs in and a real one users can reach.
  { path: "/auth", name: "Sign in" },
  { path: "/onboarding?replay=1", name: "Onboarding" },
  // Reached from an email by someone who may have no session and no cookie, so
  // it is exempt from the first-run gate (`proxy.ts`) — which also means it is a
  // screen the route list would otherwise never visit. A screen outside the gate
  // is a screen with no accessibility check.
  { path: "/unsubscribe?token=00000000-0000-0000-0000-000000000000", name: "Unsubscribe" },
  // The admin surface is a settings tab now. A non-admin — which is what the
  // gate is — gets the Account tab, so this row is a duplicate of the one above
  // in every state a machine here can produce, and it is left out rather than
  // audited twice.
];

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 900 },
];

const THEMES = ["light", "dark"];

/**
 * WCAG 2.1 AA, which is the bar the design system claims to meet.
 * `best-practice` is included because most of what it catches — a missing
 * landmark, a skipped heading level — is real for a screen-reader user.
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

/** The app is behind a first-run redirect; skip setup rather than fight it. */
const COOKIE = {
  name: "ember_onboarded",
  value: "1",
  domain: "localhost",
  path: "/",
};

async function main() {
  const browser = await chromium.launch();
  const findings = [];
  let checked = 0;

  for (const theme of THEMES) {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: theme,
        deviceScaleFactor: 1,
      });
      await context.addCookies([COOKIE]);

      /**
       * A real book, so tables, charts, P&L figures **and risk findings** are
       * actually populated. An audit of empty states is an audit of a third of
       * the app — and until phase 15 this comment claimed to seed a book while
       * only seeding preferences, so the portfolio screens were being audited
       * empty the whole time.
       *
       * The positions are chosen to fire the exposure engine: TSLA and INTC
       * are far enough through their ATR stops to raise `critical` findings,
       * which is the only state that renders the direction-tinted severity
       * badge. Without a losing position, that badge never appears and axe
       * never measures it.
       */
      await context.addInitScript(() => {
        localStorage.setItem(
          "ember:profile",
          JSON.stringify({
            state: {
              preferredName: "Travis",
              firstName: "Travis",
              lastName: "Okafor",
              country: "US",
              timezone: "America/New_York",
            },
            version: 1,
          }),
        );

        localStorage.setItem(
          "ember:preferences",
          JSON.stringify({
            state: {
                    riskProfile: "balanced",
              markets: { equity: true, crypto: true, fx: true },
              baseCurrency: "USD",
              notifications: {
                windowOpen: false,
                riskAlerts: false,
                dailyDigest: false,
                priceAlerts: false,
              },
              sidebarCollapsed: false,
              hasOnboarded: true,
            },
            version: 4,
          }),
        );

        const tx = (id, symbol, quantity, price, date) => ({
          id,
          symbol,
          side: "buy",
          quantity,
          price,
          date,
        });

        localStorage.setItem(
          "ember:portfolio",
          JSON.stringify({
            state: {
              transactions: [
                tx("audit-1", "TSLA", 120, 470, "2026-02-10"),
                tx("audit-2", "INTC", 2000, 44, "2026-01-15"),
                tx("audit-3", "NVDA", 300, 120, "2025-11-03"),
                tx("audit-4", "AAPL", 40, 235, "2026-06-01"),
                tx("audit-5", "BTC", 0.4, 98000, "2026-03-20"),
              ],
              isSample: false,
            },
            version: 1,
          }),
        );
      });

      const page = await context.newPage();

      for (const route of ROUTES) {
        await page.goto(`${BASE}${route.path}`, { waitUntil: "networkidle" });
        // Skeletons resolve on their own; give the queries a beat so the audit
        // sees real content rather than placeholder boxes.
        await page.waitForTimeout(1200);

        const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        checked += 1;

        for (const violation of results.violations) {
          findings.push({
            route: route.name,
            path: route.path,
            theme,
            viewport: viewport.name,
            id: violation.id,
            impact: violation.impact,
            help: violation.help,
            helpUrl: violation.helpUrl,
            nodes: violation.nodes.map((n) => n.target.join(" ")),
          });
        }
      }

      await context.close();
    }
  }

  await browser.close();
  await mkdir(OUT, { recursive: true });
  await writeFile(`${OUT}/accessibility.md`, report(findings, checked), "utf8");

  console.log(
    `${checked} page audits · ${findings.length} violation${findings.length === 1 ? "" : "s"}`,
  );
  for (const f of findings) {
    console.log(`  ${f.impact.padEnd(8)} ${f.id}  ${f.route} (${f.theme}/${f.viewport})`);
    for (const node of f.nodes.slice(0, 3)) console.log(`           ${node}`);
  }

  process.exitCode = findings.length > 0 ? 1 : 0;
}

function report(findings, checked) {
  const when = new Date().toISOString().slice(0, 10);
  const lines = [
    "# Accessibility audit",
    "",
    `axe-core via \`scripts/audit.mjs\`, ${when}.`,
    "",
    `${ROUTES.length} screens × ${THEMES.length} themes × ${VIEWPORTS.length} widths = **${checked} page audits**,`,
    `against WCAG 2.1 A and AA plus axe's best-practice rules, on a production build.`,
    "",
  ];

  if (findings.length === 0) {
    lines.push(
      "**No violations.**",
      "",
      "What an automated pass can and can't tell you: axe catches contrast,",
      "names, roles, landmarks and structure. It cannot tell you whether the",
      "keyboard path makes sense, whether focus lands somewhere useful after a",
      "dialog closes, or whether a screen reader's rendering of the advice card",
      "is comprehensible. Those were checked by hand and are noted in",
      "`CLAUDE.md` §8 where they are incomplete.",
    );
  } else {
    lines.push(`**${findings.length} violations.**`, "");
    for (const f of findings) {
      lines.push(
        `- \`${f.id}\` (${f.impact}) — ${f.route}, ${f.theme}/${f.viewport}`,
        `  ${f.help}`,
        ...f.nodes.slice(0, 4).map((n) => `  - \`${n}\``),
        `  <${f.helpUrl}>`,
        "",
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
