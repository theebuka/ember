import type { Transaction } from "@/lib/api/types";

/**
 * A demonstration book.
 *
 * An empty dashboard can't show what the product does — the value hero, the
 * allocation split and the "your positions" cross-reference on advice all need
 * something to work on. Rather than seed silently, this is behind an explicit
 * action, labelled as sample data wherever it appears, and one tap to clear.
 * A finance app that invents holdings you didn't enter is unforgivable; one
 * that offers to show you around is just good onboarding.
 *
 * Prices are plausible entries below the current generated levels, so the book
 * shows a mix of winners and losers rather than a uniformly green screen.
 * Dates are relative to load time so the value chart always has history.
 */

const DAY = 86_400_000;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString();
}

export function sampleTransactions(): Omit<Transaction, "id">[] {
  return [
    {
      symbol: "AAPL",
      side: "buy",
      quantity: 40,
      price: 198.4,
      fees: 1.5,
      date: daysAgo(240),
      account: "Brokerage",
    },
    {
      symbol: "MSFT",
      side: "buy",
      quantity: 12,
      price: 412.75,
      fees: 1.5,
      date: daysAgo(196),
      account: "Brokerage",
    },
    {
      symbol: "NVDA",
      side: "buy",
      quantity: 55,
      price: 121.3,
      fees: 1.5,
      date: daysAgo(154),
      account: "Brokerage",
    },
    {
      symbol: "BTC",
      side: "buy",
      quantity: 0.32,
      price: 68_400,
      fees: 12,
      date: daysAgo(132),
      account: "Exchange",
    },
    {
      symbol: "TSLA",
      side: "buy",
      quantity: 25,
      price: 344.9,
      fees: 1.5,
      date: daysAgo(98),
      account: "Brokerage",
    },
    {
      symbol: "ETH",
      side: "buy",
      quantity: 4.5,
      price: 3_180,
      fees: 8,
      date: daysAgo(76),
      account: "Exchange",
    },
    // A partial exit, so realized P&L isn't zero and the ledger shows both
    // sides of a position rather than a page of one-way buys.
    {
      symbol: "NVDA",
      side: "sell",
      quantity: 20,
      price: 174.6,
      fees: 1.5,
      date: daysAgo(41),
      account: "Brokerage",
      note: "Trimmed after the run.",
    },
    {
      symbol: "SOL",
      side: "buy",
      quantity: 60,
      price: 186.2,
      fees: 4,
      date: daysAgo(28),
      account: "Exchange",
    },
  ];
}
