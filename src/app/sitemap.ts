import type { MetadataRoute } from "next";
import { baseUrl } from "@/app/robots";


/**
 * Only what a stranger can actually reach.
 *
 * Every other route sits behind the first-run gate in `proxy.ts` and answers
 * an uncookied visitor — crawler included — with a redirect to setup. Listing
 * those would be advertising a 307, which is how a sitemap earns the "contains
 * URLs that redirect" warning and stops being trusted.
 *
 * That leaves the two pages the gate deliberately exempts: the methodology and
 * the track record, which are the product's public argument and hold nothing
 * personal. Both lists live in `proxy.ts`'s `PUBLIC_PATHS` and here, and they
 * have to agree.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = baseUrl();
  const now = new Date();

  return [
    { path: "/signals/methodology", priority: 0.9 },
    { path: "/signals/track-record", priority: 0.9 },
  ].map(({ path, priority }) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority,
  }));
}
