/**
 * Deterministic randomness.
 *
 * Everything generated in the mock provider must be reproducible. A backtest
 * whose input changes between runs can't be verified, screenshots would
 * differ every reload, and a bug that only appears on some seeds becomes
 * impossible to chase. So: no `Math.random()` anywhere in the data layer.
 */

/** mulberry32 — small, fast, and good enough for synthetic market data. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a — turns a symbol into a stable seed. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Standard normal via Box–Muller. */
export function gaussian(rng: () => number): number {
  // u must be non-zero for the log.
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Smootherstep — zero first and second derivatives at both ends. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Continuous value noise: a smooth wander in [−1, 1] that depends only on
 * `t` and `seed`.
 *
 * This is what makes live prices *drift* rather than jitter. Sampling fresh
 * randomness each tick produces a sawtooth that reads as broken; interpolating
 * between seeded lattice points gives a continuous path, so a price polled
 * every two seconds and the same price polled every ten trace the same curve.
 */
export function smoothNoise(seed: number, t: number, period: number): number {
  const x = t / period;
  const i = Math.floor(x);
  const frac = x - i;

  const at = (index: number) => mulberry32(seed ^ Math.imul(index, 0x9e3779b1))() * 2 - 1;

  return at(i) + (at(i + 1) - at(i)) * fade(frac);
}

/**
 * Layered noise at halving amplitudes — one slow swing with finer detail on
 * top, which is closer to how a price actually moves within a session than a
 * single frequency.
 */
export function fractalNoise(
  seed: number,
  t: number,
  basePeriod: number,
  octaves = 3,
): number {
  let value = 0;
  let amplitude = 1;
  let total = 0;

  for (let o = 0; o < octaves; o++) {
    value += smoothNoise(seed + o * 7919, t, basePeriod / 2 ** o) * amplitude;
    total += amplitude;
    amplitude /= 2;
  }
  return value / total;
}
