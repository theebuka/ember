import type { Candle, MarketKind } from "@/lib/api/types";
import { fractalNoise, gaussian, hashString, mulberry32 } from "@/lib/market/random";
import { zonedTime } from "@/lib/market/sessions";
import { periodsPerYearFor, type InstrumentSpec } from "@/lib/market/universe";

const DAY = 86_400_000;
const MINUTE = 60_000;

/** Enough for a 252-bar lookback plus room to walk a backtest forward. */
export const HISTORY_BARS = 1_000;

/* ── Daily history ──────────────────────────────────────────────────────── */

/** Trading days ending on the last *completed* session before `at`. */
function tradingDayGrid(market: MarketKind, bars: number, at: number): number[] {
  const days: number[] = [];
  let cursor = Math.floor(at / DAY) * DAY - DAY; // start at yesterday

  while (days.length < bars) {
    const weekday = new Date(cursor).getUTCDay();
    const tradable = market === "crypto" || (weekday !== 0 && weekday !== 6);
    if (tradable) days.push(cursor);
    cursor -= DAY;
  }
  return days.reverse();
}

/**
 * A price path with volatility clustering.
 *
 * Plain geometric Brownian motion produces a series that is visibly not a
 * market: volatility is constant, so there are no quiet stretches and no
 * panics, and every volatility-based indicator in the engine reads flat. A
 * GARCH(1,1) variance process fixes that — a large move raises the variance,
 * which decays slowly, so shocks cluster the way they actually do. It is also
 * what makes the regime filter meaningful, since without clustering there are
 * no regimes to detect.
 *
 * Jumps are layered on top for the discontinuities a diffusion can't produce:
 * earnings gaps, liquidation cascades.
 */
function generateReturns(spec: InstrumentSpec, count: number): number[] {
  const rng = mulberry32(hashString(`${spec.symbol}:path:v1`));
  const periodsPerYear = periodsPerYearFor(spec.market);

  const baseVariance = (spec.vol / Math.sqrt(periodsPerYear)) ** 2;
  // Persistence of 0.98 is the range typically estimated on daily equity
  // returns — high enough that a shock is still visible weeks later.
  const alpha = 0.08;
  const beta = 0.9;
  const omega = baseVariance * (1 - alpha - beta);

  const drift = spec.drift / periodsPerYear;

  /**
   * A hard ceiling on the variance, at five times the instrument's own
   * volatility.
   *
   * Belt to the braces below. α + β = 0.98 makes the recursion stationary *in
   * expectation*, which is not the same as bounded — a long enough run of
   * large residuals can still walk it up faster than β decays it, and a
   * hundred instruments over a thousand bars is a great many more chances for
   * that than thirteen were. Once `variance` overflows, `exp(−variance/2)`
   * underflows to zero, the rescale divides by that zero, and the whole series
   * comes out `NaN`.
   *
   * Five standard deviations of daily move is already far outside anything a
   * real instrument sustains, so the clamp cannot bind on a realistic path —
   * it exists so that no seed, on no instrument ever added to the universe,
   * can produce a series of `NaN` prices that the engine then silently
   * consumes.
   */
  const maxVariance = baseVariance * 25;

  const out: number[] = [];
  let variance = baseVariance;
  let previousDiffusion = 0;

  for (let i = 0; i < count; i++) {
    variance = Math.min(
      omega + alpha * previousDiffusion ** 2 + beta * variance,
      maxVariance,
    );
    const sd = Math.sqrt(variance);

    // The −σ²/2 term keeps the arithmetic mean at the intended drift once
    // exponentiated, rather than letting convexity inflate it.
    const diffusion = sd * gaussian(rng);
    let r = drift - variance / 2 + diffusion;

    if (rng() < spec.jumpRate) {
      // Slightly down-skewed: markets fall faster than they rise.
      const direction = rng() < 0.45 ? -1 : 1;
      r += direction * sd * (2 + rng() * 3);
    }

    /**
     * **Only the diffusive residual feeds the variance recursion.**
     *
     * Feeding the whole return back in — jump included — was the actual
     * instability, and it is a modelling error rather than a numerical one. A
     * jump is 2–5σ *by construction*, so `α · jump²` is between 0.32 and 2.0
     * times the current variance: every single jump ratcheted the volatility
     * level permanently upward, and because β = 0.9 decays it far slower than
     * the next jump arrives, the process compounded instead of clustering. In
     * a GARCH-with-jumps specification the variance is driven by the diffusion
     * and the jump component sits beside it, which is what this now does.
     *
     * Clustering — the entire reason for GARCH here — is unaffected: a large
     * diffusive shock still raises the variance and still decays slowly. What
     * stops is the one-way ratchet.
     */
    previousDiffusion = diffusion;
    out.push(r);
  }
  return out;
}

/** Build OHLCV bars around a close path. */
function buildCandles(
  spec: InstrumentSpec,
  timestamps: readonly number[],
  closes: readonly number[],
): Candle[] {
  const rng = mulberry32(hashString(`${spec.symbol}:bars:v1`));
  const periodsPerYear = periodsPerYearFor(spec.market);
  const dailyVol = spec.vol / Math.sqrt(periodsPerYear);

  return timestamps.map((t, i) => {
    const close = closes[i];
    const previous = i === 0 ? close : closes[i - 1];

    // Equities gap overnight; crypto and FX trade through, so their opens sit
    // much closer to the prior close.
    const gapScale = spec.market === "equity" ? 0.4 : 0.12;
    const open = previous * (1 + gapScale * dailyVol * gaussian(rng));

    const body = Math.abs(close - open);
    const wick = close * dailyVol * (0.5 + rng() * 0.8);

    const high = Math.max(open, close) + wick * rng();
    const low = Math.min(open, close) - wick * rng();

    // Volume follows the move — quiet days are thin, big days are heavy.
    const move = Math.abs(close / previous - 1) / dailyVol;
    const volume =
      spec.baseVolume === 0
        ? 0
        : Math.round(spec.baseVolume * Math.exp(0.3 * gaussian(rng)) * (0.7 + move * 0.5));

    return {
      t,
      o: open,
      h: Math.max(high, open, close),
      l: Math.min(low, open, close, body === 0 ? close : low),
      c: close,
      v: volume,
    };
  });
}

/**
 * Completed daily bars, oldest first.
 *
 * The whole path is rescaled so the final close lands on `anchorPrice`.
 * Multiplying by a constant leaves every return untouched, so the indicators
 * see exactly the path that was generated — only the level moves, and current
 * prices end up somewhere plausible instead of wherever the walk drifted.
 */
function generateDaily(spec: InstrumentSpec, at: number): Candle[] {
  const timestamps = tradingDayGrid(spec.market, HISTORY_BARS, at);
  const returns = generateReturns(spec, HISTORY_BARS);

  const closes: number[] = [];
  let price = spec.anchorPrice;
  for (const r of returns) {
    price *= Math.exp(r);
    closes.push(price);
  }

  const scale = spec.anchorPrice / closes[closes.length - 1];
  const scaled = closes.map((c) => c * scale);

  return buildCandles(spec, timestamps, scaled);
}

/** Regenerating 1,000 bars per request would be wasteful; the path is fixed. */
const dailyCache = new Map<string, Candle[]>();

export function dailyCandles(spec: InstrumentSpec, at: number): Candle[] {
  const key = `${spec.symbol}:${Math.floor(at / DAY)}`;
  let cached = dailyCache.get(key);
  if (!cached) {
    cached = generateDaily(spec, at);
    // The grid rolls daily, so only the current day's series is worth holding.
    if (dailyCache.size > 40) dailyCache.clear();
    dailyCache.set(key, cached);
  }
  return cached;
}

/* ── The live session ───────────────────────────────────────────────────── */

interface Session {
  start: number;
  lengthMinutes: number;
  /** 0…1 through the session. */
  progress: number;
}

/**
 * Where we are in today's session, or null if this market isn't trading today.
 *
 * The completed history stops at yesterday, so today's bar is built live from
 * the noise path. That's what makes the price move while the app is open
 * rather than sitting at a fixed close.
 */
function currentSession(at: number, market: MarketKind): Session | null {
  if (market === "equity") {
    const t = zonedTime(at, "America/New_York");
    if (t.weekday === 0 || t.weekday === 6) return null;
    const openMinutes = 9 * 60 + 30;
    const elapsed = t.minutes - openMinutes;
    if (elapsed <= 0) return null;

    const start = at - elapsed * MINUTE;

    // The daily grid already holds every session before today *in UTC*, while
    // the New York session is defined in Eastern time. Between 00:00 UTC and
    // the following open — 19:00 to 04:30 in New York — the UTC day has rolled
    // but the Eastern one hasn't, so this would report a session the grid has
    // already closed out. The live bar would then be stamped on a date that
    // already has a bar, and every indicator downstream would read two closes
    // on one day. That session is history; say so.
    if (Math.floor(start / DAY) !== Math.floor(at / DAY)) return null;

    return {
      start,
      lengthMinutes: 390,
      progress: Math.min(elapsed / 390, 1),
    };
  }

  const t = zonedTime(at, "UTC");
  if (market === "fx" && t.weekday === 6) return null;
  if (t.minutes <= 0) return null;

  return {
    start: at - t.minutes * MINUTE,
    lengthMinutes: 1_440,
    progress: Math.min(t.minutes / 1_440, 1),
  };
}

/** Proportional move from the session open, at an instant. */
function intradayPath(spec: InstrumentSpec, session: Session, at: number): number {
  const seed = hashString(`${spec.symbol}:intraday:${Math.floor(session.start / DAY)}`);
  const dailyVol = spec.vol / Math.sqrt(periodsPerYearFor(spec.market));
  // Clamped to the session: after the closing bell the price is the close, not
  // wherever the noise path would have wandered by 8pm.
  const elapsed = Math.min(at - session.start, session.lengthMinutes * MINUTE);

  // A full session's worth of wander is roughly one daily standard deviation.
  return fractalNoise(seed, elapsed, session.lengthMinutes * MINUTE * 0.55, 4) * dailyVol;
}

/**
 * Today's in-progress bar.
 *
 * High and low are sampled along the path rather than guessed, so the bar is
 * internally consistent: the range genuinely contains every price the
 * instrument has printed today.
 */
export function liveBar(
  spec: InstrumentSpec,
  at: number,
  previousClose: number,
): Candle | null {
  const session = currentSession(at, spec.market);
  if (!session) return null;

  const rng = mulberry32(hashString(`${spec.symbol}:gap:${Math.floor(session.start / DAY)}`));
  const dailyVol = spec.vol / Math.sqrt(periodsPerYearFor(spec.market));
  const gapScale = spec.market === "equity" ? 0.4 : 0.12;
  const open = previousClose * (1 + gapScale * dailyVol * gaussian(rng));

  const samples = 48;
  let high = open;
  let low = open;
  let close = open;

  for (let i = 1; i <= samples; i++) {
    const t = session.start + ((at - session.start) * i) / samples;
    const price = open * (1 + intradayPath(spec, session, t));
    if (price > high) high = price;
    if (price < low) low = price;
    close = price;
  }

  return {
    t: Math.floor(session.start / DAY) * DAY,
    o: open,
    h: high,
    l: low,
    c: close,
    v: Math.round(spec.baseVolume * session.progress),
  };
}

/** Completed history plus today's live bar — what the engine consumes. */
export function candlesAsOf(spec: InstrumentSpec, at: number): Candle[] {
  const completed = dailyCandles(spec, at);
  const live = liveBar(spec, at, completed[completed.length - 1].c);
  return live ? [...completed, live] : completed;
}

/**
 * Minute bars for today, for the 1D chart range.
 *
 * Sampled from the same path as the live bar, so the intraday chart and the
 * quote can't disagree.
 */
export function intradayCandles(spec: InstrumentSpec, at: number): Candle[] {
  const session = currentSession(at, spec.market);
  if (!session) return [];

  const completed = dailyCandles(spec, at);
  const previousClose = completed[completed.length - 1].c;

  const rng = mulberry32(hashString(`${spec.symbol}:gap:${Math.floor(session.start / DAY)}`));
  const dailyVol = spec.vol / Math.sqrt(periodsPerYearFor(spec.market));
  const gapScale = spec.market === "equity" ? 0.4 : 0.12;
  const open = previousClose * (1 + gapScale * dailyVol * gaussian(rng));

  const stepMinutes = 5;
  const elapsed = (at - session.start) / MINUTE;
  // Never past the bell — an equity chart running to 20:30 would be nonsense.
  const steps = Math.max(
    1,
    Math.min(Math.floor(elapsed / stepMinutes), session.lengthMinutes / stepMinutes),
  );
  const volumeRng = mulberry32(hashString(`${spec.symbol}:intraday-volume:${session.start}`));
  const perBarVolume = spec.baseVolume / (session.lengthMinutes / stepMinutes);

  const bars: Candle[] = [];
  let barOpen = open;

  for (let i = 0; i < steps; i++) {
    const from = session.start + i * stepMinutes * MINUTE;
    const to = from + stepMinutes * MINUTE;

    let high = barOpen;
    let low = barOpen;
    let close = barOpen;

    for (let s = 1; s <= 6; s++) {
      const price = open * (1 + intradayPath(spec, session, from + ((to - from) * s) / 6));
      if (price > high) high = price;
      if (price < low) low = price;
      close = price;
    }

    bars.push({
      t: from,
      o: barOpen,
      h: high,
      l: low,
      c: close,
      v: Math.round(perBarVolume * (0.5 + volumeRng() * 1.2)),
    });
    barOpen = close;
  }

  return bars;
}
