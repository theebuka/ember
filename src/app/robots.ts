import type { MetadataRoute } from "next";

/**
 * What a crawler may read.
 *
 * The public argument of this product — the methodology, the citations, the
 * computed track record — is exactly the part worth indexing, so the default
 * is allow. Two exclusions:
 *
 *   `/api/*` is JSON with no reader, and `/api/advice` is an 82 KB response
 *   that would be crawled on every pass for nothing.
 *
 *   `/onboarding` is a setup flow. Landing on step one from a search result
 *   is a worse first impression than landing on the dashboard, and it is
 *   where the first-run redirect sends people anyway.
 *
 *   `/admin` is not excluded because it is secret — RLS is what keeps it safe
 *   and a robots directive protects nothing. It is excluded because it is a
 *   page no searcher is looking for, and because a crawler that indexed it
 *   would be indexing the one sentence it shows a stranger.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/onboarding", "/admin", "/unsubscribe"],
    },
    sitemap: `${baseUrl()}/sitemap.xml`,
  };
}

/**
 * The deployed origin, or localhost while there isn't one.
 *
 * `NEXT_PUBLIC_SITE_URL` is read rather than hardcoded because the same build
 * runs on a preview URL, a production domain and a laptop, and a sitemap
 * pointing at the wrong host is worse than no sitemap.
 */
export function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  );
}
