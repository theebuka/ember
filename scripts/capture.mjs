/**
 * Case-study capture — screenshots, a responsive sweep and a motion check.
 *
 * Reproducible rather than hand-taken, so the set can be regenerated after any
 * change instead of slowly going stale. Run against a production build:
 *
 *   npm run verify -- --only=capture
 *   node scripts/capture.mjs [baseUrl]   # if you already trust the server
 *
 * Writes:
 *   docs/case-study/screens/<route>-<viewport>-<theme>.png
 *   docs/case-study/responsive.md   — overflow check, 320px → 1920px
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3100";
const OUT = "docs/case-study";
const SHOTS = `${OUT}/screens`;

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

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 900 },
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
 * Screenshots of empty states would document a third of the app and none of
 * the interesting parts — the value chart, the positions table, realized P&L
 * and the allocation bar all need a ledger behind them.
 */
const SEED = () => {
  localStorage.setItem(
    "ember:profile",
    JSON.stringify({
      state: {
        // A name, because without one Home captures the greeting's name-free
        // form and the `brand-text` accent — the only brand colour in that
        // block — never appears in a single screenshot.
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

  /**
   * The directory is emptied, not written over.
   *
   * Phase 17 found the reason: the v1 set had a `portfolio-*` and a
   * `command-menu-*` slug, phase 13 renamed one and phase 14 restructured the
   * screen behind the other, and both sets of PNGs simply stayed on disk. A
   * capture script that only ever adds files produces a folder where some
   * images are current and some are two redesigns old, with nothing to tell
   * them apart. Regenerating means regenerating.
   */
  await rm(SHOTS, { recursive: true, force: true });
  await mkdir(SHOTS, { recursive: true });

  let shots = 0;

  /* ── Screenshots ─────────────────────────────────────────────────── */
  for (const theme of ["light", "dark"]) {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: theme,
        // 2× so the captures are legible in a case study rather than soft.
        deviceScaleFactor: 2,
        // Every capture is a still, and a shared-layout pill caught halfway
        // between two tabs is not the screen anyone designed.
        reducedMotion: "reduce",
      });
      await context.addCookies([COOKIE]);
      await context.addInitScript(SEED);

      const page = await context.newPage();

      for (const route of ROUTES) {
        await page.goto(`${BASE}${route.path}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(1400);
        await page.screenshot({
          path: `${SHOTS}/${route.slug}-${viewport.name}-${theme}.png`,
          fullPage: true,
        });
        shots += 1;
      }

      /**
       * ⌘K, and only here.
       *
       * The command menu is mounted on desktop only (decision 052) and has no
       * route of its own, so it is the one piece of the app a route list can
       * never reach. Not `fullPage` — it is an overlay over a page that is
       * already captured, and a full-page shot of it is mostly scrim.
       */
      if (viewport.name === "desktop") {
        await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
        await page.waitForTimeout(1400);
        await page.keyboard.press("ControlOrMeta+k");
        await page.waitForTimeout(700);
        await page.screenshot({
          path: `${SHOTS}/command-menu-desktop-${theme}.png`,
        });
        shots += 1;
      }

      await context.close();
    }
  }

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

  console.log(`${shots} screenshots → ${SHOTS}`);
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
    `\`scripts/capture.mjs\`, ${new Date().toISOString().slice(0, 10)}.`,
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
