import type { Candle } from "@/lib/api/types";
import { sma } from "./moving-averages";
import { stdev } from "./stats";

export interface Channel {
  upper: number;
  lower: number;
  middle: number;
}

/**
 * Donchian channel — the highest high and lowest low over `period` bars.
 *
 * `excludeCurrent` matters and is not cosmetic. The Turtle entry rule is
 * "price exceeds the highest high of the *previous* N days"; if the current
 * bar is inside the window, its own high defines the level it's being tested
 * against and the channel can never be broken. Trading callers must pass
 * true; chart overlays want false.
 */
export function donchian(
  candles: readonly Candle[],
  period: number,
  { excludeCurrent = false }: { excludeCurrent?: boolean } = {},
): (Channel | null)[] {
  const out: (Channel | null)[] = new Array(candles.length).fill(null);
  const offset = excludeCurrent ? 1 : 0;

  for (let i = period - 1 + offset; i < candles.length; i++) {
    const end = i + 1 - offset;
    const start = end - period;

    let upper = -Infinity;
    let lower = Infinity;
    for (let j = start; j < end; j++) {
      if (candles[j].h > upper) upper = candles[j].h;
      if (candles[j].l < lower) lower = candles[j].l;
    }
    out[i] = { upper, lower, middle: (upper + lower) / 2 };
  }
  return out;
}

/** Bollinger bands — an SMA with symmetric standard-deviation envelopes. */
export function bollinger(
  closes: readonly number[],
  period = 20,
  multiplier = 2,
): (Channel | null)[] {
  const middle = sma(closes, period);
  const out: (Channel | null)[] = new Array(closes.length).fill(null);

  for (let i = period - 1; i < closes.length; i++) {
    const m = middle[i];
    if (m === null) continue;
    const sd = stdev(closes.slice(i - period + 1, i + 1));
    if (sd === null) continue;
    out[i] = { upper: m + multiplier * sd, lower: m - multiplier * sd, middle: m };
  }
  return out;
}
