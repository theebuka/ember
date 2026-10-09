import type { Candle, Instrument, MarketKind } from "@/lib/api/types";
import { periodsPerYearFor } from "@/lib/market/universe";
import { momentumRank } from "./indicators/regression";

/**
 * What a whole market looked like on one day.
 *
 * Five of the six strategies added in phase 24 are cross-sectional: they don't
 * ask "is this instrument going up", they ask "where does this instrument sit
 * among its peers". Every one of them therefore needs a measure computed for
 * every peer, and computing those inside each strategy would mean the same
 * 164-name sweep run five times per assessment and 214 times per evaluation
 * date — a quarter of a billion redundant passes over a walk-forward backtest
 * that already costs eighteen seconds.
 *
 * So the sweep happens once. **A cross-section is a property of a market on a
 * date, not of the instrument being assessed**, which is exactly why it can be
 * shared: `assess("AAPL")` and `assess("MSFT")` on the same bar are looking at
 * the same table.
 *
 * Two invariants this file exists to hold:
 *
 * **Nothing is read past `asOfDay`.** The same no-lookahead rule `buildContext`
 * enforces for the subject, enforced here for every peer — measured by UTC day
 * rather than by array index, for the reason below.
 *
 * **Peers are aligned by date, never by index.** Before the universe went
 * global every equity had the same number of bars, so index `k` meant the same
 * calendar day for all of them and slicing by index was accidentally correct.
 * It stopped being correct in phase 23: Yahoo returns 1,214 bars for one
 * listing and 1,280 for another, so the last element of a shorter series is not
 * today — it is up to three months ago. Every cross-sectional rule in the
 * engine was comparing a Tokyo name's return-to-February against a New York
 * name's return-to-today, and nothing failed.
 */

const DAY_MS = 86_400_000;

/**
 * The UTC day a bar belongs to.
 *
 * Yahoo stamps a daily bar at the venue's *opening instant*, so Tokyo's
 * 2026-08-14 session arrives as `00:00Z` and New York's as `13:30Z` — the same
 * trading day carrying two timestamps that differ by half a day. Every venue
 * ember lists opens between 00:00Z and 08:00Z, so flooring to the UTC day maps
 * all sixteen onto one grid. A venue further east than Tokyo would break that
 * and would need a real session-date field on the bar.
 */
export function utcDay(t: number): number {
  return Math.floor(t / DAY_MS);
}

/* ── The shape of a market on a date ───────────────────────────────────── */

export interface CrossSectionRow {
  symbol: string;
  sector?: string;
  /** Twelve-month total return skipping the most recent month (Jegadeesh–Titman). */
  momentum12_1: number | null;
  /** Twelve-month total return with no skip — what dual momentum ranks on. */
  momentum12: number | null;
  /** One-month total return. Short-term reversal reads this and inverts it. */
  reversal21: number | null;
  /**
   * The largest single-day return in the past month (Bali, Cakici & Whitelaw's
   * MAX). Close to close, so a gap over a weekend counts as the day it lands on.
   */
  maxDaily21: number | null;
  /** Close as a fraction of the highest high in the trailing year, 0…1. */
  highProximity: number | null;
  /** Frazzini–Pedersen beta against the equal-weight market, shrunk toward 1. */
  beta: number | null;
  /** The correlation term behind that beta — how much of the name the market explains. */
  betaCorrelation: number | null;
  /** Twelve-one residual return as a t-statistic. See `residualMomentumOf`. */
  residualT: number | null;
  /**
   * Clenow's ranking value — annualised 90-day regression slope × R².
   *
   * The one measure here that a pre-existing strategy asked for. It lives in the
   * snapshot for the reason the whole file exists: `clenow` was recomputing it for
   * all 176 peers on every assessment, and profiled over 1,760 contexts that one
   * loop cost 811ms against 257ms for the entire rest of the engine. Computed by
   * date instead, the same sweep runs 579 times over a backtest rather than
   * 20,416 — and returns the identical number, because it reads the identical
   * bars.
   */
  clenowScore: number | null;
  /**
   * Da, Gurun & Warachka's information discreteness over the 12-1 window:
   * sign(return) × (share of down days − share of up days). Negative when the
   * move was made steadily, on many small days; near zero or positive when it
   * came on a few large ones.
   */
  discreteness: number | null;
}

export interface SectorRow {
  sector: string;
  /** Equal-weight mean of member `momentum12_1`. */
  momentum: number;
  members: number;
}

export interface CrossSection {
  market: MarketKind;
  asOfDay: number;
  rows: Map<string, CrossSectionRow>;
  /** Strongest first. Sectors below `MIN_SECTOR_MEMBERS` are omitted entirely. */
  sectors: SectorRow[];
  /**
   * Non-null values of each measure across the market, ready for percentile
   * ranking. Precomputed because five strategies each want the whole column.
   */
  distributions: {
    momentum12_1: number[];
    momentum12: number[];
    reversal21: number[];
    maxDaily21: number[];
    highProximity: number[];
    beta: number[];
    residualT: number[];
    clenowScore: number[];
    discreteness: number[];
  };
  /**
   * How far to scale cross-sectional momentum down because momentum itself has
   * been volatile, 0.5…1, or null without enough history. Equities only. See
   * `momentumRiskOf`.
   */
  momentumScale: number | null;
}

/** What the snapshot needs from a universe. Narrow, so `context.ts` can import it without a cycle. */
export interface CrossSectionSource {
  instruments: readonly Instrument[];
  candles: ReadonlyMap<string, Candle[]>;
}

/* ── Windows ───────────────────────────────────────────────────────────── */

/**
 * The hard ceiling on how far back any measure here may look.
 *
 * Mirrors `CONTEXT_BARS`, and deliberately duplicated rather than imported —
 * `context.ts` imports this module, and the two constants mean different
 * things that happen to share a value (one bounds what a *subject* sees, the
 * other what a *peer* contributes). What matters is that a live evaluation and
 * a backtest evaluation see the same amount of history, which is the property
 * that makes the track record describe the live engine.
 */
const MAX_LOOKBACK = 420;

const MOMENTUM_LOOKBACK = 231; // 12 months less the skipped month
const MOMENTUM_SKIP = 21;
const REVERSAL = 21;
const YEAR = 252;
/** Clenow ranks over 90 bars. The strategy's own constant, and it must match. */
const CLENOW_WINDOW = 90;
/** Below this a "sector" is two companies, and its mean is a coin flip. */
const MIN_SECTOR_MEMBERS = 4;
/** Frazzini–Pedersen use three-day overlapping returns for the correlation. */
const OVERLAP = 3;
/** Their shrinkage: 0.6 of the estimate, 0.4 of the 1.0 prior. */
const BETA_SHRINK = 0.6;

/* ── Cache ─────────────────────────────────────────────────────────────── */

interface UniverseCache {
  /** market → UTC day → equal-weight simple return of that market on that day. */
  factor: Map<MarketKind, Map<number, number>>;
  /** market → the winners-minus-losers series and its volatility. */
  wml: Map<MarketKind, WmlSeries | null>;
  /** symbol → the market's return on each of that symbol's own bars. */
  aligned: Map<string, number[]>;
  sections: Map<string, CrossSection>;
}

/**
 * Keyed on the universe object itself.
 *
 * A `WeakMap` rather than a bounded LRU because the backtest walks one symbol
 * all the way to the present before starting the next, so every section the
 * first symbol builds is wanted again by the other 213. An eviction policy
 * would throw away exactly the entries about to be asked for, and the whole
 * table is a few tens of megabytes that vanish with the universe.
 */
const CACHE = new WeakMap<object, UniverseCache>();

function cacheFor(source: CrossSectionSource): UniverseCache {
  let entry = CACHE.get(source);
  if (!entry) {
    entry = { factor: new Map(), aligned: new Map(), wml: new Map(), sections: new Map() };
    CACHE.set(source, entry);
  }
  return entry;
}

/* ── The market factor ─────────────────────────────────────────────────── */

/**
 * An equal-weight index of the market, as a return per UTC day.
 *
 * Equal-weight rather than capitalisation-weight because ember has no share
 * counts for 92 of its 164 listings (phase 23 measured filed accounts at zero
 * of twelve international names), and an index weighted by whichever companies
 * happen to file with the SEC is not a market proxy — it is a US proxy wearing
 * a global label. Frazzini & Pedersen's own tests use equal-weight and
 * value-weight variants and report both.
 */
function factorFor(source: CrossSectionSource, market: MarketKind): Map<number, number> {
  const cache = cacheFor(source);
  const hit = cache.factor.get(market);
  if (hit) return hit;

  const sum = new Map<number, number>();
  const count = new Map<number, number>();

  for (const instrument of source.instruments) {
    if (instrument.market !== market) continue;
    const candles = source.candles.get(instrument.symbol);
    if (!candles || candles.length < 2) continue;

    for (let i = 1; i < candles.length; i++) {
      const prev = candles[i - 1].c;
      const now = candles[i].c;
      if (prev <= 0 || now <= 0) continue;
      const day = utcDay(candles[i].t);
      sum.set(day, (sum.get(day) ?? 0) + (now / prev - 1));
      count.set(day, (count.get(day) ?? 0) + 1);
    }
  }

  const out = new Map<number, number>();
  for (const [day, total] of sum) out.set(day, total / (count.get(day) ?? 1));

  cache.factor.set(market, out);
  return out;
}

/** The market's return on each of one symbol's own bars, so the two align element-for-element. */
function alignedFactor(
  source: CrossSectionSource,
  market: MarketKind,
  symbol: string,
  candles: readonly Candle[],
): number[] {
  const cache = cacheFor(source);
  const hit = cache.aligned.get(symbol);
  if (hit) return hit;

  const byDay = factorFor(source, market);
  const out = new Array<number>(candles.length);
  for (let i = 0; i < candles.length; i++) out[i] = byDay.get(utcDay(candles[i].t)) ?? 0;

  cache.aligned.set(symbol, out);
  return out;
}

/* ── Momentum's own risk ────────────────────────────────────────────────── */

/**
 * Barroso & Santa-Clara's window for momentum's realised volatility: six months
 * of daily returns.
 */
const WML_VOL_WINDOW = 126;
/** Deciles, as in the paper. Below this many ranked names a decile is one stock. */
const WML_MIN_RANKED = 20;
/** The scale never goes below half: a damper, not a switch. */
const WML_MIN_SCALE = 0.5;

interface WmlSeries {
  /** UTC days with a winners-minus-losers return, ascending. */
  days: number[];
  /** Annualised realised volatility over the trailing window, per day; NaN before it fills. */
  vol: number[];
  /** The mean of every `vol` up to and including that day; NaN before the first. */
  typical: number[];
}

/**
 * A winners-minus-losers portfolio for one market, as a daily series.
 *
 * Rebalanced on the first trading day of each UTC month: the top tenth on 12-1
 * momentum long, the bottom tenth short, equal weight. Membership is decided
 * from closes up to that day, and each day's return is read from that day's
 * bars, so the series never knows anything a reader on that day would not.
 * Computed once per universe per market and read by date.
 */
function wmlFor(source: CrossSectionSource, market: MarketKind): WmlSeries | null {
  const cache = cacheFor(source);
  if (cache.wml.has(market)) return cache.wml.get(market)!;

  const members = source.instruments
    .filter((i) => i.market === market)
    .map((i) => source.candles.get(i.symbol))
    .filter((c): c is Candle[] => !!c && c.length > MOMENTUM_LOOKBACK + MOMENTUM_SKIP + 1);

  const dayset = new Set<number>();
  for (const candles of members) for (const bar of candles) dayset.add(utcDay(bar.t));
  const grid = [...dayset].sort((a, b) => a - b);

  /** Each member's return on each day it traded. */
  const returns = members.map((candles) => {
    const byDay = new Map<number, number>();
    for (let i = 1; i < candles.length; i++) {
      const prev = candles[i - 1].c;
      if (prev > 0 && candles[i].c > 0) byDay.set(utcDay(candles[i].t), candles[i].c / prev - 1);
    }
    return byDay;
  });

  const monthOf = (day: number) => {
    const date = new Date(day * DAY_MS);
    return date.getUTCFullYear() * 12 + date.getUTCMonth();
  };

  const days: number[] = [];
  const wml: number[] = [];
  let winners: number[] = [];
  let losers: number[] = [];
  let month = -1;

  for (const day of grid) {
    if (monthOf(day) !== month) {
      month = monthOf(day);
      const ranked: { index: number; momentum: number }[] = [];
      members.forEach((candles, index) => {
        const end = indexAsOf(candles, day);
        const momentum = end < 0 ? null : totalReturn(candles, end, MOMENTUM_LOOKBACK, MOMENTUM_SKIP);
        if (momentum !== null && Number.isFinite(momentum)) ranked.push({ index, momentum });
      });
      if (ranked.length >= WML_MIN_RANKED) {
        ranked.sort((a, b) => b.momentum - a.momentum);
        const tenth = Math.floor(ranked.length / 10);
        winners = ranked.slice(0, tenth).map((r) => r.index);
        losers = ranked.slice(-tenth).map((r) => r.index);
      } else {
        winners = [];
        losers = [];
      }
    }
    if (winners.length === 0) continue;

    const mean = (group: number[]) => {
      let sum = 0;
      let count = 0;
      for (const index of group) {
        const r = returns[index].get(day);
        if (r !== undefined) {
          sum += r;
          count++;
        }
      }
      return count > 0 ? sum / count : null;
    };
    const long = mean(winners);
    const short = mean(losers);
    if (long === null || short === null) continue;
    days.push(day);
    wml.push(long - short);
  }

  if (days.length <= WML_VOL_WINDOW) {
    cache.wml.set(market, null);
    return null;
  }

  // Rolling volatility, then its running mean as the "usual" level. The running
  // mean only ever reads the past, which is the property that keeps a backtest
  // from scaling 2019 by how volatile 2022 turned out to be.
  const vol = new Array<number>(days.length).fill(Number.NaN);
  const typical = new Array<number>(days.length).fill(Number.NaN);
  let sum = 0;
  let sumSq = 0;
  let volTotal = 0;
  let volCount = 0;
  for (let i = 0; i < days.length; i++) {
    sum += wml[i];
    sumSq += wml[i] ** 2;
    if (i >= WML_VOL_WINDOW) {
      sum -= wml[i - WML_VOL_WINDOW];
      sumSq -= wml[i - WML_VOL_WINDOW] ** 2;
    }
    if (i >= WML_VOL_WINDOW - 1) {
      const n = WML_VOL_WINDOW;
      const variance = Math.max(0, (sumSq - (sum * sum) / n) / (n - 1));
      vol[i] = Math.sqrt(variance * 252);
      volTotal += vol[i];
      volCount++;
      typical[i] = volTotal / volCount;
    }
  }

  const series = { days, vol, typical };
  cache.wml.set(market, series);
  return series;
}

/**
 * How much to trust cross-sectional momentum today, from how volatile momentum
 * itself has been.
 *
 * Barroso & Santa-Clara found momentum's risk is highly variable and
 * predictable, and that its crashes arrive when its own recent volatility is
 * high; scaling exposure by that volatility nearly doubled the strategy's Sharpe
 * ratio and removed most of the crashes. Daniel & Moskowitz trace the crashes to
 * rebounds after a fall, which is exactly when the losers' leg is most volatile.
 *
 * The paper scales to a fixed 12% target. ember scales to the series' own usual
 * level (the running mean of its six-month volatility), because an equal-weight
 * decile portfolio over 176 names has a different natural volatility from the
 * paper's, and a fixed number chosen for theirs would be a number chosen for
 * nothing here. **It only ever scales down**, like the regime filter: calm
 * momentum is not evidence that the call is better, only that it is not in the
 * conditions where momentum has failed worst. Cederburg et al. (2020) found
 * volatility scaling adds nothing out of sample for most strategies; momentum is
 * one of the few where it holds, which is why it is applied here and nowhere else.
 */
export function momentumRiskOf(
  source: CrossSectionSource,
  market: MarketKind,
  asOfDay: number,
): number | null {
  if (market !== "equity") return null;
  const series = wmlFor(source, market);
  if (!series) return null;

  // The last day on or before `asOfDay`.
  let lo = 0;
  let hi = series.days.length - 1;
  let at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series.days[mid] <= asOfDay) {
      at = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (at < 0) return null;

  const vol = series.vol[at];
  const typical = series.typical[at];
  if (!Number.isFinite(vol) || !Number.isFinite(typical) || vol <= 0) return null;
  return Math.min(1, Math.max(WML_MIN_SCALE, typical / vol));
}

/* ── Measures ──────────────────────────────────────────────────────────── */

/** Index of the last bar on or before `day`, or −1. */
export function indexAsOf(candles: readonly Candle[], day: number): number {
  let lo = 0;
  let hi = candles.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (utcDay(candles[mid].t) <= day) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

function totalReturn(candles: readonly Candle[], end: number, lookback: number, skip = 0): number | null {
  const to = end - skip;
  const from = to - lookback;
  if (from < 0 || to < 0) return null;
  const base = candles[from].c;
  if (base <= 0) return null;
  return candles[to].c / base - 1;
}

/**
 * Frazzini–Pedersen beta: correlation from overlapping returns, volatility from
 * daily ones, then shrunk toward the market.
 *
 * The two windows are not a simplification of one estimate — they are the
 * paper's answer to two different problems. Correlation is estimated on
 * three-day overlapping log returns because **non-synchronous trading biases a
 * daily beta downward**, and that bias is not hypothetical here: Tokyo closes
 * six hours before New York opens, so a Japanese listing's response to a US
 * move lands on the following bar and a same-day regression simply misses it.
 * Volatility, which has no such problem, is estimated on plain daily returns
 * where the sample is larger.
 *
 * The shrinkage toward 1 is theirs too, and it is what makes a beta estimated
 * on ember's 420-bar ceiling usable where the paper had five years.
 */
function betaOf(
  own: readonly number[],
  market: readonly number[],
): { beta: number; correlation: number } | null {
  const n = Math.min(own.length, market.length);
  if (n < YEAR) return null;

  const volWindow = Math.min(n, YEAR);
  const ownVol = stdevOf(own.slice(-volWindow));
  const marketVol = stdevOf(market.slice(-volWindow));
  if (ownVol === null || marketVol === null || marketVol === 0 || ownVol === 0) return null;

  // Three-day overlapping sums of log returns, over everything available.
  const ownOverlap: number[] = [];
  const marketOverlap: number[] = [];
  for (let i = OVERLAP - 1; i < n; i++) {
    let a = 0;
    let b = 0;
    for (let k = 0; k < OVERLAP; k++) {
      a += own[i - k];
      b += market[i - k];
    }
    ownOverlap.push(a);
    marketOverlap.push(b);
  }

  const correlation = correlationOf(ownOverlap, marketOverlap);
  if (correlation === null) return null;

  const raw = correlation * (ownVol / marketVol);
  return { beta: BETA_SHRINK * raw + (1 - BETA_SHRINK), correlation };
}

/**
 * Momentum on what the market did not explain, as a t-statistic.
 *
 * Blitz, Huij & Martens' finding is that raw momentum is partly a disguised
 * bet on whatever factor happened to run, so its returns arrive with large
 * factor-driven swings; stripping those out roughly doubles the Sharpe ratio
 * of the same signal. Scaling by residual volatility is half the effect and
 * not an afterthought — a name whose residuals are enormous has not
 * demonstrated anything by drifting up.
 *
 * **Two documented departures from the paper.** It regresses on Fama–French
 * three factors; ember regresses on one, an equal-weight market, because SMB
 * and HML need book values and market caps that do not exist for 92 of 164
 * listings — a three-factor version would silently be US-only, which is the
 * problem this phase exists to avoid. And it estimates over 36 months of
 * monthly data where ember uses its 420-bar daily ceiling. Both are stated on
 * the methodology page rather than glossed.
 */
function residualMomentumOf(
  own: readonly number[],
  market: readonly number[],
): number | null {
  const n = Math.min(own.length, market.length);
  if (n < MOMENTUM_LOOKBACK + MOMENTUM_SKIP + 1) return null;

  const y = own.slice(-n);
  const x = market.slice(-n);

  const meanY = y.reduce((a, b) => a + b, 0) / n;
  const meanX = x.reduce((a, b) => a + b, 0) / n;

  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - meanX) * (y[i] - meanY);
    sxx += (x[i] - meanX) ** 2;
  }
  if (sxx === 0) return null;

  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;

  const residual = new Array<number>(n);
  for (let i = 0; i < n; i++) residual[i] = y[i] - intercept - slope * x[i];

  const dispersion = stdevOf(residual);
  if (dispersion === null || dispersion === 0) return null;

  /**
   * The 12-1 window, measured *inside* the longer estimation window.
   *
   * The intercept forces the residuals to sum to zero over the estimation window
   * as a whole, so measuring over a sub-window is not an approximation of
   * measuring over all of it — it is the only thing that can carry a signal at
   * all. Which has a consequence worth stating plainly, because it is easy to
   * misread the measure: **this detects a change in drift, not a level of it.** A
   * name that has out-drifted its market by a steady two percent a year for the
   * whole window scores zero here, correctly — momentum is a statement about the
   * recent past against the less-recent past, and a constant is neither.
   *
   * It is also why the estimation window wants to be several times the
   * measurement window. Blitz et al. get 3× (36 months against 12); ember's
   * 420-bar ceiling gives 1.8×, so the signal arrives attenuated. Recorded rather
   * than tuned around: raising the ceiling would let a live evaluation see more
   * history than a backtest evaluation, and that gap is the one thing that would
   * stop the track record describing the live engine.
   */
  const to = n - MOMENTUM_SKIP;
  const from = to - MOMENTUM_LOOKBACK;
  let cumulative = 0;
  for (let i = from; i < to; i++) cumulative += residual[i];

  return cumulative / (dispersion * Math.sqrt(MOMENTUM_LOOKBACK));
}

function stdevOf(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function correlationOf(a: readonly number[], b: readonly number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  const meanA = a.reduce((x, y) => x + y, 0) / n;
  const meanB = b.reduce((x, y) => x + y, 0) / n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  if (saa === 0 || sbb === 0) return null;
  return sab / Math.sqrt(saa * sbb);
}

/* ── Building one ──────────────────────────────────────────────────────── */

function rowFor(
  source: CrossSectionSource,
  instrument: Instrument,
  candles: readonly Candle[],
  asOfDay: number,
): CrossSectionRow | null {
  const end = indexAsOf(candles, asOfDay);
  if (end < REVERSAL) return null;

  const first = Math.max(0, end - MAX_LOOKBACK + 1);
  const bars = end - first + 1;

  const momentum12_1 = totalReturn(candles, end, MOMENTUM_LOOKBACK, MOMENTUM_SKIP);
  const momentum12 = totalReturn(candles, end, YEAR);
  const reversal21 = totalReturn(candles, end, REVERSAL);

  let maxDaily21: number | null = null;
  for (let i = end - REVERSAL + 1; i <= end; i++) {
    const prev = candles[i - 1].c;
    if (prev <= 0) continue;
    const r = candles[i].c / prev - 1;
    if (maxDaily21 === null || r > maxDaily21) maxDaily21 = r;
  }

  let highProximity: number | null = null;
  if (end >= YEAR) {
    let high = 0;
    for (let i = end - YEAR + 1; i <= end; i++) if (candles[i].h > high) high = candles[i].h;
    highProximity = high > 0 ? candles[end].c / high : null;
  }

  let clenowScore: number | null = null;
  if (end >= CLENOW_WINDOW - 1) {
    const window: number[] = [];
    for (let i = end - CLENOW_WINDOW + 1; i <= end; i++) window.push(candles[i].c);
    const rank = momentumRank(
      window,
      CLENOW_WINDOW,
      periodsPerYearFor(instrument.market),
    );
    clenowScore = rank[rank.length - 1]?.score ?? null;
  }

  // Information discreteness over the same 12-1 window the momentum rules read.
  let discreteness: number | null = null;
  if (momentum12_1 !== null && end - MOMENTUM_SKIP - MOMENTUM_LOOKBACK >= 1) {
    let up = 0;
    let down = 0;
    const to = end - MOMENTUM_SKIP;
    for (let i = to - MOMENTUM_LOOKBACK + 1; i <= to; i++) {
      const move = candles[i].c - candles[i - 1].c;
      if (move > 0) up++;
      else if (move < 0) down++;
    }
    discreteness = Math.sign(momentum12_1) * ((down - up) / MOMENTUM_LOOKBACK);
  }

  let beta: number | null = null;
  let betaCorrelation: number | null = null;
  let residualT: number | null = null;

  if (bars > YEAR) {
    const factor = alignedFactor(source, instrument.market, instrument.symbol, candles);
    const ownLog: number[] = [];
    const marketLog: number[] = [];
    for (let i = Math.max(first, 1); i <= end; i++) {
      const prev = candles[i - 1].c;
      const now = candles[i].c;
      if (prev <= 0 || now <= 0) continue;
      ownLog.push(Math.log(now / prev));
      marketLog.push(Math.log(1 + factor[i]));
    }

    const estimate = betaOf(ownLog, marketLog);
    if (estimate) {
      beta = estimate.beta;
      betaCorrelation = estimate.correlation;
    }
    residualT = residualMomentumOf(ownLog, marketLog);
  }

  return {
    symbol: instrument.symbol,
    sector: instrument.sector,
    momentum12_1,
    momentum12,
    reversal21,
    maxDaily21,
    highProximity,
    beta,
    betaCorrelation,
    residualT,
    clenowScore,
    discreteness,
  };
}

/**
 * The market's cross-section on one day, computed once and shared.
 *
 * `asOfDay` is the UTC day of the *subject's* evaluation bar, and every peer is
 * read up to its own last bar on or before it. A peer that has not traded since
 * — a suspended listing, or simply a venue on holiday — contributes its most
 * recent session, which is what a real ranking would use.
 */
export function crossSectionOf(
  source: CrossSectionSource,
  market: MarketKind,
  asOfDay: number,
): CrossSection {
  const cache = cacheFor(source);
  const key = `${market}:${asOfDay}`;
  const hit = cache.sections.get(key);
  if (hit) return hit;

  const rows = new Map<string, CrossSectionRow>();
  for (const instrument of source.instruments) {
    if (instrument.market !== market) continue;
    const candles = source.candles.get(instrument.symbol);
    if (!candles || candles.length === 0) continue;
    const row = rowFor(source, instrument, candles, asOfDay);
    if (row) rows.set(instrument.symbol, row);
  }

  const all = [...rows.values()];
  const column = (pick: (row: CrossSectionRow) => number | null): number[] =>
    all.map(pick).filter((v): v is number => v !== null && Number.isFinite(v));

  const bySector = new Map<string, number[]>();
  for (const row of all) {
    if (!row.sector || row.momentum12_1 === null) continue;
    const list = bySector.get(row.sector) ?? [];
    list.push(row.momentum12_1);
    bySector.set(row.sector, list);
  }

  const sectors: SectorRow[] = [...bySector.entries()]
    .filter(([, values]) => values.length >= MIN_SECTOR_MEMBERS)
    .map(([sector, values]) => ({
      sector,
      momentum: values.reduce((a, b) => a + b, 0) / values.length,
      members: values.length,
    }))
    // Ties broken by name so the ranking is stable between identical requests,
    // the same reason `trendingFrom` has a tiebreak.
    .sort((a, b) => b.momentum - a.momentum || a.sector.localeCompare(b.sector));

  const section: CrossSection = {
    market,
    asOfDay,
    rows,
    sectors,
    distributions: {
      momentum12_1: column((r) => r.momentum12_1),
      momentum12: column((r) => r.momentum12),
      reversal21: column((r) => r.reversal21),
      maxDaily21: column((r) => r.maxDaily21),
      highProximity: column((r) => r.highProximity),
      beta: column((r) => r.beta),
      residualT: column((r) => r.residualT),
      clenowScore: column((r) => r.clenowScore),
      discreteness: column((r) => r.discreteness),
    },
    momentumScale: momentumRiskOf(source, market, asOfDay),
  };

  cache.sections.set(key, section);
  return section;
}
