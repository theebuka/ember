/**
 * The responsive sweep: every screen at every width from 320px to 1920px, on a
 * seeded book, failing if the document ever scrolls sideways.
 *
 * This was `capture.mjs` and took 74 screenshots too. Those went on
 * 2026-10-10: the Figma file is the visual record now, and a folder of PNGs
 * nobody looked at cost a minute of every gate run. Run against a production
 * build:
 *
 *   npm run verify -- --only=responsive
 *   node scripts/responsive.mjs [baseUrl]   # if you already trust the server
 *
 * Writes docs/case-study/responsive.md.
 */
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3100";
const OUT = "docs/case-study";

const ROUTES = [
  { path: "/", slug: "home", name: "Home" },
  { path: "/portfolio", slug: "portfolio-holdings", name: "Portfolio — holdings" },
  { path: "/portfolio?view=watching", slug: "portfolio-watching", name: "Portfolio — watching" },
  { path: "/portfolio?view=activity", slug: "portfolio-activity", name: "Portfolio — activity" },
  { path: "/signals", slug: "signals", name: "Signals feed" },
  { path: "/news", slug: "news", name: "News" },
  { path: "/signals/track-record", slug: "track-record", name: "Track record" },
  { path: "/signals/methodology", slug: "methodology", name: "Methodology" },
  { path: "/asset/NVDA", slug: "asset", name: "Asset detail" },
  // The index on a phone, Profile beside the sidebar on desktop (decision 284).
  { path: "/settings", slug: "settings", name: "Settings" },
  { path: "/settings?tab=account", slug: "settings-profile", name: "Settings — profile" },
  { path: "/settings?tab=plan", slug: "settings-plan", name: "Settings — plan" },
  { path: "/settings?tab=data", slug: "settings-data", name: "Settings — your data" },
  { path: "/notifications", slug: "notifications", name: "Notifications" },
  { path: "/auth", slug: "auth", name: "Sign in" },
  { path: "/onboarding?replay=1", slug: "onboarding", name: "Onboarding" },
  // Exempt from the first-run gate, because it is reached from an email by
  // someone who may have no session and no cookie — which also means the route
  // list would never visit it otherwise, and a screen outside the sweep is a
  // screen nobody has checked at 320px.
  {
    path: "/unsubscribe?token=00000000-0000-0000-0000-000000000000",
    slug: "unsubscribe",
    name: "Unsubscribe",
  },
  // The checkout's return page. The gate has no session, so this photographs
  // "Sign in to finish"; the subscriber states are seen with the development
  // preview on the Plan tab.
  { path: "/pro/welcome", slug: "pro-welcome", name: "Pro welcome" },
  // Admin moved into a settings tab, which a signed-out visitor cannot select,
  // so there is nothing here a machine can photograph. Recorded in §8.
];


/** The sweep. Narrowest supported, the common phones, tablet, laptop, wide. */
const WIDTHS = [320, 375, 414, 640, 768, 1024, 1280, 1440, 1920];

const COOKIE = {
  name: "ember_onboarded",
  value: "1",
  domain: "localhost",
  path: "/",
};

/**
 * The sample book, loaded before first paint.
 *
 * An empty book would sweep a third of the app and none of the wide parts:
 * the value chart, the positions table, realized P&L and the allocation bar
 * all need a ledger behind them.
 */
const SEED = () => {
  localStorage.setItem(
    "ember:profile",
    JSON.stringify({
      state: {
        // A name, so the greeting is swept at its longer, named width.
        preferredName: "Travis",
        firstName: "Travis",
        lastName: "Okafor",
        country: "US",
        timezone: "America/New_York",
      },
      version: 1,
    }),
  );
  const daysAgo = (n) =>
    new Date(Date.now() - n * 86400000).toISOString().slice(0, 10) +
    "T00:00:00.000Z";
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
  localStorage.setItem(
    "ember:portfolio",
    JSON.stringify({
      state: {
        isSample: true,
        transactions: [
          ["AAPL", "buy", 40, 198.4, 240],
          ["MSFT", "buy", 12, 412.75, 196],
          ["NVDA", "buy", 55, 121.3, 154],
          ["BTC", "buy", 0.42, 68400, 132],
          ["ETH", "buy", 4.5, 2980, 98],
          ["EURUSD", "buy", 20000, 1.0821, 66],
          ["SOL", "buy", 30, 141.2, 44],
          ["AAPL", "sell", 10, 241.1, 20],
        ].map(([symbol, side, quantity, price, ago], i) => ({
          id: `seed-${i}`,
          symbol,
          side,
          quantity,
          price,
          fees: 1.5,
          date: daysAgo(ago),
          account: "Brokerage",
        })),
      },
      version: 1,
    }),
  );
};

async function main() {
  const browser = await chromium.launch();

  /* ── Responsive sweep ────────────────────────────────────────────── */
  const overflow = [];
  const context = await browser.newContext({
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await context.addCookies([COOKIE]);
  await context.addInitScript(SEED);
  const page = await context.newPage();

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ROUTES) {
      await page.goto(`${BASE}${route.path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(900);

      const result = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        win: window.innerWidth,
        // Anything wider than the viewport that isn't in its own scroller.
        culprits: [...document.querySelectorAll("body *")]
          .filter((el) => {
            const style = getComputedStyle(el);
            if (style.overflowX !== "visible") return false;
            if (style.position === "fixed") return false;
            return el.getBoundingClientRect().right > window.innerWidth + 1;
          })
          .slice(0, 3)
          .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`),
      }));

      if (result.doc > result.win + 1) {
        overflow.push({ width, route: route.name, ...result });
      }
    }
  }

  await context.close();
  await browser.close();

  await writeFile(`${OUT}/responsive.md`, sweepReport(overflow), "utf8");

  console.log(
    `${WIDTHS.length} widths × ${ROUTES.length} routes · ${overflow.length} overflowing`,
  );
  for (const o of overflow) {
    console.log(`  ${o.width}px ${o.route}: doc ${o.doc} > win ${o.win}`);
    for (const c of o.culprits) console.log(`      ${c}`);
  }

  process.exitCode = overflow.length > 0 ? 1 : 0;
}

function sweepReport(overflow) {
  const lines = [
    "# Responsive sweep",
    "",
    `\`scripts/responsive.mjs\`, ${new Date().toISOString().slice(0, 10)}.`,
    "",
    `${ROUTES.length} screens at ${WIDTHS.join(", ")}px — ${WIDTHS.length * ROUTES.length} combinations.`,
    "",
    "The check is that the document never scrolls horizontally. Wide content —",
    "the positions table, the risk comparison — is allowed to scroll, but only",
    "inside its own container, never by pushing the page sideways.",
    "",
  ];

  if (overflow.length === 0) {
    lines.push("**No horizontal overflow at any width.**");
  } else {
    lines.push(`**${overflow.length} overflowing combinations.**`, "");
    for (const o of overflow) {
      lines.push(
        `- **${o.route}** at ${o.width}px — document ${o.doc}px in a ${o.win}px viewport`,
        ...o.culprits.map((c) => `  - \`${c}\``),
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
