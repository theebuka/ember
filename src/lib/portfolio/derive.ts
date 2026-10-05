import type {
  BaseCurrency,
  Candle,
  Currency,
  Instrument,
  Quote,
  Transaction,
} from "@/lib/api/types";

/**
 * Everything about what the user owns, computed from the transaction log.
 *
 * **Holdings are derived, never stored** (CLAUDE.md §5). Quantity, average
 * cost, unrealized and realized P&L all fall out of the trades that produced
 * them, so they cannot drift out of sync with each other — which is exactly
 * what happens the first time a stored `holdings` row is updated and its
 * originating transaction isn't.
 *
 * Every function here is pure. Given the same log, quotes and rates it returns
 * the same numbers, which is what makes it testable against a hand calculation.
 */

/* ── Currency conversion ───────────────────────────────────────────────── */

export type Rates = Record<Currency, number>;

/** `rates` is USD per one unit of each currency. */
export function convert(
  value: number,
  from: Currency,
  to: Currency,
  rates: Rates,
): number {
  if (from === to) return value;
  const usd = value * rates[from];
  return usd / rates[to];
}

/* ── Positions ─────────────────────────────────────────────────────────── */

export interface Position {
  instrument: Instrument;
  symbol: string;
  quantity: number;
  /** Average cost per unit, in the instrument's quote currency. */
  averageCost: number;
  /** All figures below are in the user's base currency. */
  costBasis: number;
  price: number;
  marketValue: number;
  unrealized: number;
  /** Against cost basis. Null when the position is fully closed. */
  unrealizedPct: number | null;
  dayChange: number;
  dayChangePct: number;
  /** Lifetime realized P&L on this symbol, including closed lots. */
  realized: number;
  /** Share of total market value, 0…1. */
  weight: number;
  /** Epoch millis of the most recent trade in this symbol. */
  lastTradedAt: number;
  /**
   * Epoch millis of the trade that opened the position ember is looking at.
   *
   * Not the first trade in the symbol — the first trade of the *current*
   * exposure. Someone who bought AAPL in 2019, sold out entirely in 2023 and
   * bought back last month has held this position for a month, and the risk
   * engine measures a drawdown and a regime change from when the exposure
   * actually began.
   */
  openedAt: number;
}

export interface PortfolioSummary {
  base: BaseCurrency;
  positions: Position[];
  /** Symbols the user has traded but no longer holds. */
  closed: { symbol: string; realized: number }[];
  totalValue: number;
  totalCost: number;
  unrealized: number;
  unrealizedPct: number | null;
  realized: number;
  dayChange: number;
  dayChangePct: number | null;
  /** True when there is no transaction log at all — drives the empty state. */
  isEmpty: boolean;
}

/** Chronological, with a stable tiebreak so the result never depends on input order. */
function chronological(a: Transaction, b: Transaction): number {
  const byDate = Date.parse(a.date) - Date.parse(b.date);
  return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
}

interface Lot {
  quantity: number;
  /** Total cost of the open quantity, in the instrument's quote currency. */
  cost: number;
  realized: number;
  lastTradedAt: number;
  /** When the *current* exposure began. Reset by a full exit. */
  openedAt: number;
}

/**
 * Walk the log, average-cost basis.
 *
 * Average cost rather than FIFO in v1 because it needs one number per symbol
 * rather than a lot table, and the two only diverge on partial sells of a
 * position built in tranches. FIFO becomes a settings toggle once there are
 * accounts to store the choice against — the lot detail is all still in the
 * log, so switching is a recomputation, not a migration.
 */
function walkLots(transactions: readonly Transaction[]): Map<string, Lot> {
  const lots = new Map<string, Lot>();

  for (const tx of [...transactions].sort(chronological)) {
    const at = Date.parse(tx.date);
    const lot = lots.get(tx.symbol) ?? {
      quantity: 0,
      cost: 0,
      realized: 0,
      lastTradedAt: at,
      openedAt: at,
    };
    const fees = tx.fees ?? 0;

    if (tx.side === "buy") {
      // Opening from flat starts a new exposure. Adding to one that's already
      // open does not — a top-up doesn't reset how long you've held it.
      if (lot.quantity === 0) lot.openedAt = at;
      lot.quantity += tx.quantity;
      lot.cost += tx.quantity * tx.price + fees;
    } else {
      // A sell larger than the holding would imply a short, which v1 doesn't
      // model — the transaction form rejects it at entry. Clamping here keeps
      // a hand-edited or imported log from producing a negative position that
      // silently poisons every downstream figure.
      const sold = Math.min(tx.quantity, lot.quantity);
      const averageCost = lot.quantity > 0 ? lot.cost / lot.quantity : 0;

      lot.realized += sold * (tx.price - averageCost) - fees;
      lot.cost -= sold * averageCost;
      lot.quantity -= sold;

      // Floating-point residue on a full exit shows as a 3e-16 position.
      if (lot.quantity < 1e-12) {
        lot.quantity = 0;
        lot.cost = 0;
      }
    }

    lot.lastTradedAt = Math.max(lot.lastTradedAt, at);
    lots.set(tx.symbol, lot);
  }

  return lots;
}

export function derivePortfolio({
  transactions,
  quotes,
  instruments,
  rates,
  base,
}: {
  transactions: readonly Transaction[];
  quotes: readonly Quote[];
  instruments: readonly Instrument[];
  rates: Rates;
  base: BaseCurrency;
}): PortfolioSummary {
  const bySymbol = new Map(instruments.map((i) => [i.symbol, i]));
  const quoteBy = new Map(quotes.map((q) => [q.symbol, q]));
  const lots = walkLots(transactions);

  const positions: Position[] = [];
  const closed: { symbol: string; realized: number }[] = [];

  let totalValue = 0;
  let totalCost = 0;
  let dayChange = 0;
  let previousValue = 0;
  let realized = 0;

  for (const [symbol, lot] of lots) {
    const instrument = bySymbol.get(symbol);
    // An unknown symbol is a stale import or a delisting. Its realized P&L is
    // still real and still counts; it just can't be valued.
    if (!instrument) {
      realized += lot.realized;
      if (lot.realized !== 0) closed.push({ symbol, realized: lot.realized });
      continue;
    }

    const toBase = (value: number) => convert(value, instrument.currency, base, rates);
    const realizedBase = toBase(lot.realized);
    realized += realizedBase;

    if (lot.quantity === 0) {
      if (lot.realized !== 0) closed.push({ symbol, realized: realizedBase });
      continue;
    }

    const quote = quoteBy.get(symbol);
    // No quote yet: hold the position at cost rather than at zero. Showing a
    // −100% line while a fetch is in flight would be alarming and false.
    const price = quote?.price ?? lot.cost / lot.quantity;
    const previousClose = quote?.previousClose ?? price;

    const marketValue = toBase(lot.quantity * price);
    const costBasis = toBase(lot.cost);
    const previousMarketValue = toBase(lot.quantity * previousClose);

    totalValue += marketValue;
    totalCost += costBasis;
    previousValue += previousMarketValue;
    dayChange += marketValue - previousMarketValue;

    positions.push({
      instrument,
      symbol,
      quantity: lot.quantity,
      averageCost: lot.cost / lot.quantity,
      costBasis,
      price,
      marketValue,
      unrealized: marketValue - costBasis,
      unrealizedPct: costBasis === 0 ? null : (marketValue - costBasis) / costBasis,
      dayChange: marketValue - previousMarketValue,
      dayChangePct:
        previousMarketValue === 0 ? 0 : (marketValue - previousMarketValue) / previousMarketValue,
      realized: realizedBase,
      weight: 0,
      lastTradedAt: lot.lastTradedAt,
      openedAt: lot.openedAt,
    });
  }

  for (const position of positions) {
    position.weight = totalValue === 0 ? 0 : position.marketValue / totalValue;
  }
  positions.sort((a, b) => b.marketValue - a.marketValue);
  closed.sort((a, b) => b.realized - a.realized);

  return {
    base,
    positions,
    closed,
    totalValue,
    totalCost,
    unrealized: totalValue - totalCost,
    unrealizedPct: totalCost === 0 ? null : (totalValue - totalCost) / totalCost,
    realized,
    dayChange,
    dayChangePct: previousValue === 0 ? null : dayChange / previousValue,
    isEmpty: transactions.length === 0,
  };
}

/**
 * The book, reduced to what the findings route is allowed to see.
 *
 * Four numbers per open position and nothing else — no transaction log, no
 * fees, no accounts, no closed positions, no realised P&L, no base currency.
 * Kept here, beside the derivation, so there is exactly one place that decides
 * what leaves the device and it sits next to everything it is choosing not to
 * send. ADR 0025.
 */
export function positionInputs(positions: readonly Position[]): {
  symbol: string;
  quantity: number;
  averageCost: number;
  openedAt: number;
}[] {
  return positions.map((position) => ({
    symbol: position.symbol,
    quantity: position.quantity,
    averageCost: position.averageCost,
    openedAt: position.openedAt,
  }));
}

/* ── Ledger validation ─────────────────────────────────────────────────── */

export interface OversellIssue {
  transactionId: string;
  symbol: string;
  date: string;
  /** Quantity the sell asks for. */
  requested: number;
  /** Quantity actually held at that moment. */
  available: number;
}

/**
 * The first point at which the log sells something it doesn't hold.
 *
 * `walkLots` clamps defensively so a bad row can't poison every downstream
 * figure, but clamping *silently* is the wrong behaviour for a ledger — the
 * user's numbers would quietly stop matching their broker with nothing on
 * screen to explain it. This is what the transaction form and the CSV importer
 * check against so the problem is named at the point of entry.
 *
 * It validates the whole log rather than just the row being added, because
 * editing an existing buy downward can invalidate a sell three months later.
 * That failure is invisible to a check that only looks at the row in hand.
 */
export function findOversell(
  transactions: readonly Transaction[],
  symbol?: string,
): OversellIssue | null {
  const scoped = symbol
    ? transactions.filter((t) => t.symbol === symbol)
    : transactions;

  const held = new Map<string, number>();

  for (const tx of [...scoped].sort(chronological)) {
    const quantity = held.get(tx.symbol) ?? 0;

    if (tx.side === "buy") {
      held.set(tx.symbol, quantity + tx.quantity);
      continue;
    }

    // A hair of tolerance: a full exit entered as 0.30000000000000004 after a
    // floating-point round trip is not an oversell.
    if (tx.quantity > quantity + 1e-9) {
      return {
        transactionId: tx.id,
        symbol: tx.symbol,
        date: tx.date,
        requested: tx.quantity,
        available: quantity,
      };
    }

    held.set(tx.symbol, quantity - tx.quantity);
  }

  return null;
}

/** How much of a symbol was held immediately before `at`. Drives the form's hint. */
export function quantityHeldAt(
  transactions: readonly Transaction[],
  symbol: string,
  at: number,
  excludeId?: string,
): number {
  let quantity = 0;

  for (const tx of [...transactions].sort(chronological)) {
    if (tx.symbol !== symbol || tx.id === excludeId) continue;
    if (Date.parse(tx.date) > at) break;
    quantity += tx.side === "buy" ? tx.quantity : -Math.min(tx.quantity, quantity);
  }

  return Math.max(0, quantity);
}

/** Symbols with a quantity still held at the end of the ledger. */
export function openSymbols(transactions: readonly Transaction[]): Set<string> {
  const symbols = new Set(transactions.map((t) => t.symbol));
  return new Set(
    [...symbols].filter((symbol) => quantityHeldAt(transactions, symbol, Infinity) > 0),
  );
}

/**
 * The ledger cut to a plan's holdings limit: the `limit` open positions worth
 * most (cost breaks a tie, and stands in while prices load), and every row of
 * any symbol not open. The rest are returned by name, largest first. Pure, so
 * the rule is tested rather than trusted (decision 289).
 */
export function keepLargest(
  transactions: readonly Transaction[],
  positions: readonly { symbol: string; quantity: number; marketValue: number; costBasis: number }[],
  limit: number,
): { transactions: Transaction[]; locked: string[] } {
  const ranked = positions
    .filter((p) => p.quantity > 0)
    .sort((a, b) => b.marketValue - a.marketValue || b.costBasis - a.costBasis)
    .map((p) => p.symbol);
  const locked = ranked.slice(limit);
  const hidden = new Set(locked);
  return { transactions: transactions.filter((t) => !hidden.has(t.symbol)), locked };
}

/* ── Value over time ───────────────────────────────────────────────────── */

export interface ValuePoint {
  t: number;
  /** Market value of everything held on that date, in base currency. */
  value: number;
  /** What it had cost to that date — the invested line under the value line. */
  cost: number;
}

/**
 * The portfolio's actual history, not today's book projected backwards.
 *
 * The quantity at each date comes from the transactions settled by that date,
 * so a position bought last week doesn't appear in last month's value. Valuing
 * current holdings back through time would be much simpler and would draw a
 * chart of a portfolio the user never owned — it would show gains they didn't
 * capture and hide the moment they bought in.
 *
 * Markets keep different calendars — crypto trades weekends, equities don't —
 * so the grid is the union of every series' timestamps and each symbol is
 * carried forward at its last known close.
 */
export function portfolioValueSeries({
  transactions,
  candles,
  instruments,
  rates,
  base,
  quotes,
}: {
  transactions: readonly Transaction[];
  /** Daily closes per symbol, oldest first. */
  candles: ReadonlyMap<string, readonly Candle[]>;
  instruments: readonly Instrument[];
  rates: Rates;
  base: BaseCurrency;
  /**
   * Live prices, used for the final point only.
   *
   * Without these the chart ends at the last daily *close* while the hero
   * above it reads the live tick — two figures for the same quantity, a
   * centimetre apart, that don't agree. The gap is small on a quiet day and
   * embarrassing on a fast one.
   */
  quotes?: readonly Quote[];
}): ValuePoint[] {
  if (transactions.length === 0) return [];

  const bySymbol = new Map(instruments.map((i) => [i.symbol, i]));
  const ordered = [...transactions].sort(chronological);

  const grid = new Set<number>();
  for (const series of candles.values()) {
    for (const candle of series) grid.add(candle.t);
  }
  const timestamps = [...grid].sort((a, b) => a - b);
  if (timestamps.length === 0) return [];

  // Nothing before the first trade is portfolio history — it's an empty
  // account, and charting a flat zero implies a period of holding nothing when
  // really the user just hadn't started.
  const firstTrade = Date.parse(ordered[0].date);
  const start = timestamps.findIndex((t) => t >= firstTrade);
  if (start === -1) return [];

  /** Per-symbol cursor into its own candle array — the grid is a merge, not a join. */
  const cursors = new Map<string, number>();
  const lastClose = new Map<string, number>();

  let txIndex = 0;
  const held = new Map<string, { quantity: number; cost: number }>();

  const points: ValuePoint[] = [];
  /** Whether every holding had a close at the matching point. */
  const completeAt: boolean[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];

    // Advance each symbol to its most recent close at or before `t`.
    for (const [symbol, series] of candles) {
      let cursor = cursors.get(symbol) ?? 0;
      while (cursor < series.length && series[cursor].t <= t) {
        lastClose.set(symbol, series[cursor].c);
        cursor++;
      }
      cursors.set(symbol, cursor);
    }

    // Apply every trade settled by the end of this bar.
    while (txIndex < ordered.length && Date.parse(ordered[txIndex].date) <= t) {
      const tx = ordered[txIndex++];
      const lot = held.get(tx.symbol) ?? { quantity: 0, cost: 0 };
      const fees = tx.fees ?? 0;

      if (tx.side === "buy") {
        lot.quantity += tx.quantity;
        lot.cost += tx.quantity * tx.price + fees;
      } else {
        const sold = Math.min(tx.quantity, lot.quantity);
        const averageCost = lot.quantity > 0 ? lot.cost / lot.quantity : 0;
        lot.cost -= sold * averageCost;
        lot.quantity -= sold;
        if (lot.quantity < 1e-12) {
          lot.quantity = 0;
          lot.cost = 0;
        }
      }
      held.set(tx.symbol, lot);
    }

    if (i < start) continue;

    let value = 0;
    let cost = 0;
    let complete = true;
    for (const [symbol, lot] of held) {
      if (lot.quantity === 0) continue;
      const instrument = bySymbol.get(symbol);
      const close = lastClose.get(symbol);
      if (!instrument || close === undefined) {
        complete = false;
        continue;
      }

      value += convert(lot.quantity * close, instrument.currency, base, rates);
      cost += convert(lot.cost, instrument.currency, base, rates);
    }

    points.push({ t, value, cost });
    completeAt.push(complete);
  }

  /**
   * Start where the whole book is priced.
   *
   * A range's series don't begin on the same day — crypto trades the weekend
   * before an equity's first bar, an FX series starts a day later again — so the
   * first few grid points valued only whichever holdings already had a close.
   * The line opened at the floor of the chart and leapt as the rest arrived, and
   * the period change beside it was measured from that partial book: the sample
   * read +$26,802 over three months against a total unrealized gain of $16,323.
   * Leading points are dropped until every holding has a price; after that each
   * symbol carries forward at its last close as before. A holding that never
   * gets a series (an instrument still collecting) must not empty the chart, so
   * if no point is ever complete, nothing is dropped.
   */
  const firstComplete = completeAt.indexOf(true);
  if (firstComplete > 0) points.splice(0, firstComplete);

  /**
   * Re-price the last point at the live quote.
   *
   * Cost is untouched — what you paid doesn't move with the market — so this
   * only slides the end of the value line onto the number the hero is
   * showing. Every earlier point stays on closes, which is what a daily
   * series should be.
   */
  const lastPoint = points[points.length - 1];
  if (quotes && quotes.length > 0 && lastPoint) {
    const priceBy = new Map(quotes.map((q) => [q.symbol, q.price]));
    let value = 0;
    for (const [symbol, lot] of held) {
      if (lot.quantity === 0) continue;
      const instrument = bySymbol.get(symbol);
      const price = priceBy.get(symbol) ?? lastClose.get(symbol);
      if (!instrument || price === undefined) continue;
      value += convert(lot.quantity * price, instrument.currency, base, rates);
    }
    points[points.length - 1] = { ...lastPoint, value };
  }

  return points;
}
