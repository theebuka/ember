import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The cache that makes a free tier survive contact with a hundred and ten
 * instruments.
 *
 * Cold, one `/api/advice` needs a daily history for every instrument in the
 * universe. That is ninety-seven upstream requests against providers that
 * allow thirty to sixty a minute, and no amount of parallelism makes it fast —
 * the limit is the quota, not the wire. So the cache is not an optimisation
 * here; it is the thing that makes the feature possible at all.
 *
 * Three properties, each earning its complexity:
 *
 * **Stale-while-revalidate.** A stale entry is served immediately and
 * refreshed behind the response. Without it every TTL expiry hands some
 * unlucky visitor a ninety-second page load, and daily bars that are ten
 * minutes old are not wrong in any way a reader could act on.
 *
 * **Single flight.** Ten concurrent requests for AAPL's history are one
 * upstream call. Without it the first cold page view multiplies its own cost
 * by however many components asked, which is exactly when the quota is
 * tightest.
 *
 * **A disk tier.** Module scope alone means every `next start`, every dev
 * reload and every deploy begins cold, and a cold start against these quotas
 * is a minute of nothing. Writing entries to `.cache/market/` means a restart
 * is warm. It is deliberately best-effort — every read and write is wrapped,
 * because a cache that can fail the request it is meant to accelerate is worse
 * than no cache.
 *
 * **This is the local answer, not the deployed one.** ADR 0008 names Upstash,
 * and on a serverless platform the disk tier is inert (a fresh container has
 * no `.cache/`) while the memory tier still works per instance. Swapping in
 * Redis is this file and nothing else.
 */

interface Entry<T> {
  value: T;
  /** Epoch millis the value was fetched. */
  at: number;
}

type Namespace = string;

const memory = new Map<Namespace, Map<string, Entry<unknown>>>();
const inflight = new Map<string, Promise<unknown>>();

/** Namespaces with unwritten changes, flushed on a timer. */
const dirty = new Set<Namespace>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const CACHE_DIR = join(process.cwd(), ".cache", "market");
const FLUSH_DELAY = 2_000;

function bucket(namespace: Namespace): Map<string, Entry<unknown>> {
  const existing = memory.get(namespace);
  if (existing) return existing;

  const loaded = new Map<string, Entry<unknown>>();
  try {
    const raw = readFileSync(join(CACHE_DIR, `${namespace}.json`), "utf8");
    for (const [key, entry] of Object.entries(JSON.parse(raw) as Record<string, Entry<unknown>>)) {
      loaded.set(key, entry);
    }
  } catch {
    // No file, unreadable file, corrupt JSON — all the same thing to us: a
    // cold namespace. Never a reason to fail the request.
  }

  memory.set(namespace, loaded);
  return loaded;
}

function scheduleFlush(namespace: Namespace) {
  dirty.add(namespace);
  if (flushTimer !== null) return;

  flushTimer = setTimeout(() => {
    flushTimer = null;
    const pending = [...dirty];
    dirty.clear();

    try {
      mkdirSync(CACHE_DIR, { recursive: true });
      for (const name of pending) {
        const entries = memory.get(name);
        if (!entries) continue;
        writeFileSync(
          join(CACHE_DIR, `${name}.json`),
          JSON.stringify(Object.fromEntries(entries)),
        );
      }
    } catch {
      // Read-only filesystem, no disk quota, a serverless container. The
      // memory tier carries on unaffected.
    }
  }, FLUSH_DELAY);

  // Never hold the process open for a cache write.
  flushTimer.unref?.();
}

export interface CacheOptions {
  /** Seconds after which the value is refreshed — in the background if it can be. */
  ttl: number;
  /**
   * Seconds after which the value is too old to serve at all.
   *
   * Past this the caller waits for a fresh fetch. It exists so a provider that
   * has been down for a day cannot quietly keep serving yesterday's prices
   * under a chart labelled live.
   */
  maxAge: number;
}

/**
 * Read through the cache, refreshing in the background when it can.
 *
 * The `loader` may throw. A throw during a *background* refresh is swallowed
 * and the stale value stands — an upstream blip should not blank a chart. A
 * throw on the blocking path propagates, because there is nothing to show.
 *
 * **The loader is handed what is already stored.** Most callers ignore it: a
 * day of AAPL bars replaces the previous day of AAPL bars and there is nothing
 * to carry forward. The news feed is the exception, and it is the reason this
 * argument exists — it can only afford a slice of the universe per refresh, so
 * each cycle has to *add* to the pool rather than replace it. Without this the
 * only way to accumulate is a second store beside the cache, which is a second
 * thing to keep in step.
 */
export async function cached<T>(
  namespace: Namespace,
  key: string,
  { ttl, maxAge }: CacheOptions,
  loader: (previous: T | undefined) => Promise<T>,
): Promise<T> {
  const entries = bucket(namespace);
  const hit = entries.get(key) as Entry<T> | undefined;
  const age = hit ? (Date.now() - hit.at) / 1000 : Infinity;

  if (hit && age < ttl) return hit.value;

  const flightKey = `${namespace}:${key}`;

  const fetchAndStore = async (): Promise<T> => {
    const existing = inflight.get(flightKey) as Promise<T> | undefined;
    if (existing) return existing;

    const promise = loader(hit?.value)
      .then((value) => {
        entries.set(key, { value, at: Date.now() });
        scheduleFlush(namespace);
        return value;
      })
      .finally(() => {
        inflight.delete(flightKey);
      });

    inflight.set(flightKey, promise);
    return promise;
  };

  if (hit && age < maxAge) {
    // Stale but usable. Refresh behind the response and hand back what we have.
    void fetchAndStore().catch(() => {});
    return hit.value;
  }

  return fetchAndStore();
}

/** Test seam — drops every tier for one namespace. */
export function clearCache(namespace?: Namespace) {
  if (namespace) memory.delete(namespace);
  else memory.clear();
}
