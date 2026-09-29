/**
 * One way out to the network, with the quota built in.
 *
 * Every upstream ember talks to is free-tier and rate-limited, and the limits
 * are per host rather than per endpoint: Finnhub allows sixty calls a minute,
 * CoinGecko's demo key thirty. Enforcing that at each call site would mean
 * remembering to, so it is enforced here — a queue per host with a minimum
 * spacing between requests and a ceiling on how many are in flight.
 *
 * **Spacing, not just concurrency.** A concurrency cap of four still fires
 * forty requests in the second it takes them to return, which is what trips a
 * per-minute quota. The gap is derived from the quota itself.
 */

export class UpstreamError extends Error {
  constructor(
    readonly host: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

interface Quota {
  /** Milliseconds between the start of one request and the next. */
  spacing: number;
  /** How many may be in flight at once. */
  concurrency: number;
}

/**
 * Deliberately under the published limits.
 *
 * Finnhub says 60/minute, CoinGecko's demo key 30/minute. Sitting exactly on a
 * documented limit means the first clock-skew or retry crosses it, and the
 * penalty for crossing is a 429 that costs more time than the margin saved.
 * Yahoo publishes nothing, which is its own kind of answer — it gets the most
 * conservative spacing of the three.
 */
const QUOTAS: Record<string, Quota> = {
  "finnhub.io": { spacing: 1_100, concurrency: 4 },
  "api.coingecko.com": { spacing: 2_200, concurrency: 2 },
  "query1.finance.yahoo.com": { spacing: 260, concurrency: 6 },
  "api.frankfurter.dev": { spacing: 250, concurrency: 2 },
};

const DEFAULT_QUOTA: Quota = { spacing: 500, concurrency: 2 };

interface Lane {
  quota: Quota;
  active: number;
  nextAt: number;
  queue: Array<() => void>;
}

const lanes = new Map<string, Lane>();

function laneFor(host: string): Lane {
  const existing = lanes.get(host);
  if (existing) return existing;

  const lane: Lane = {
    quota: QUOTAS[host] ?? DEFAULT_QUOTA,
    active: 0,
    nextAt: 0,
    queue: [],
  };
  lanes.set(host, lane);
  return lane;
}

function pump(lane: Lane) {
  if (lane.active >= lane.quota.concurrency) return;
  const next = lane.queue.shift();
  if (!next) return;

  const wait = Math.max(0, lane.nextAt - Date.now());
  lane.active += 1;
  lane.nextAt = Date.now() + wait + lane.quota.spacing;
  setTimeout(next, wait);
}

function release(lane: Lane) {
  lane.active -= 1;
  pump(lane);
}

function acquire(host: string): Promise<() => void> {
  const lane = laneFor(host);
  return new Promise((resolve) => {
    lane.queue.push(() => resolve(() => release(lane)));
    pump(lane);
  });
}

const TIMEOUT_MS = 12_000;

/**
 * A JSON GET, queued behind its host's quota.
 *
 * Retries once on a 429 or a 5xx, because both are transient by definition and
 * a single retry is the difference between a missing instrument and a slightly
 * slower one. It does **not** retry a 4xx: a 403 from an endpoint the key
 * cannot reach will be a 403 next time too, and retrying it burns quota to
 * learn nothing.
 */
export async function fetchJson<T>(
  url: string,
  init?: { headers?: Record<string, string> },
): Promise<T> {
  const host = new URL(url).host;
  const done = await acquire(host);

  try {
    // A loop rather than recursion: recursing would re-enter `acquire` while
    // still holding this host's slot, which is a deadlock the moment a lane's
    // concurrency is one.
    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            // Yahoo answers a bare fetch with a challenge page rather than JSON.
            "User-Agent": "Mozilla/5.0 (compatible; ember/1.0)",
            Accept: "application/json",
            ...init?.headers,
          },
          signal: controller.signal,
          // Next would otherwise apply its own fetch cache on top of ours,
          // with a different TTL and no visibility. One cache, in `cache.ts`.
          cache: "no-store",
        });
      } finally {
        clearTimeout(timer);
      }

      if ((response.status === 429 || response.status >= 500) && attempt < 1) {
        await new Promise((r) => setTimeout(r, 1_500));
        continue;
      }

      if (!response.ok) {
        throw new UpstreamError(host, response.status, `${host} answered ${response.status}`);
      }

      return (await response.json()) as T;
    }
  } finally {
    done();
  }
}
