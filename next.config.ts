import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * Every address this machine answers on, so `next dev` will serve its own
 * assets to a phone on the same wifi.
 *
 * **This is not a convenience.** Next 16 refuses `/_next/*` to any origin that
 * is not localhost, with a bare **403** and nothing in the terminal. The HTML
 * still renders, so the page arrives and looks alive — and then every chunk is
 * refused, nothing hydrates, and the app sits on whatever the server painted
 * with every control dead. On `/onboarding` that is the splash, because the
 * splash *is* the prerendered fallback (decision 094), so the symptom reads as
 * "stuck on the launch screen" rather than as a network failure. Measured on a
 * LAN origin: eleven chunks, all 403.
 *
 * Derived rather than written down, because the alternative is a hard-coded
 * `192.168.x.x` that is wrong the next time the router hands out a lease or the
 * laptop joins a different network — and wrong in a way whose symptom is a
 * blank-looking app rather than an error. `EMBER_DEV_ORIGINS` adds anything
 * this cannot see, such as a tunnel hostname.
 *
 * Dev only. A production server serves its assets to anybody who asks.
 */
function localOrigins(): string[] {
  const found = new Set<string>();

  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.internal) continue;
      // IPv6 link-local carries a zone index (`%en0`) that never round-trips
      // through a URL, and nothing types one into a phone anyway.
      if (address.family === "IPv6") continue;
      found.add(address.address);
    }
  }

  for (const extra of (process.env.EMBER_DEV_ORIGINS ?? "").split(",")) {
    const trimmed = extra.trim();
    if (trimmed.length > 0) found.add(trimmed);
  }

  return [...found];
}


const nextConfig: NextConfig = {
  allowedDevOrigins: localOrigins(),

  // The dev overlay anchors bottom-left, directly over the first item in the
  // mobile bottom nav, which makes that tab impossible to see or review.
  devIndicators: false,

  experimental: {
    // Phosphor ships 1,512 icons behind a single barrel. Without this, a dev
    // build resolves every one of them on each request to `components/common/icon`
    // — seconds per navigation — and the production bundle relies on the
    // bundler's tree-shaking being perfect. This rewrites the barrel import
    // into direct module paths at compile time.
    optimizePackageImports: ["@phosphor-icons/react"],
  },

  /**
   * v1's routes, kept alive.
   *
   * `/advice` became `/signals` and `/watchlist` folded into `/portfolio` as a
   * segment. Both are permanent moves, but the old paths are in installed PWA
   * shortcuts, in notification payloads sitting in an OS queue, and in any link
   * anyone has shared — so they redirect rather than 404. `/watchlist` carries
   * its destination in the query so it lands on the right segment instead of
   * the top of a screen that no longer mentions watching.
   */
  async redirects() {
    return [
      { source: "/advice", destination: "/signals", permanent: true },
      { source: "/advice/:path*", destination: "/signals/:path*", permanent: true },
      { source: "/watchlist", destination: "/portfolio?view=watching", permanent: true },
      // `/admin` was its own route for one phase. It is a settings tab now, and
      // the redirect answers everybody the same way — which is the property ADR
      // 0039 wanted from the route in the first place: nothing about the reply
      // tells a prober whether the caller is an admin.
      { source: "/admin", destination: "/settings?tab=admin", permanent: true },
    ];
  },

  async headers() {
    return [
      {
        // The service worker must be able to control the whole origin, and
        // must never be served from cache — a stale worker outlives a deploy.
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
