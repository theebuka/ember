import { describe, expect, it } from "vitest";
import { resolveWatchlist } from "./use-watchlist";

/**
 * The `null` sentinel and what it protects against.
 *
 * "Following everything" is a state, not a snapshot of the universe at the
 * moment the store was created. Getting that wrong means an instrument added
 * to `lib/market/universe.ts` never appears for anyone who has already opened
 * the app — a failure that is invisible in development, where storage is
 * usually empty.
 */

const UNIVERSE = ["AAPL", "BTC", "EURUSD"];

describe("resolveWatchlist", () => {
  it("treats null as the whole universe", () => {
    expect(resolveWatchlist(null, UNIVERSE)).toEqual(UNIVERSE);
  });

  it("picks up an instrument added to the universe later", () => {
    const grown = [...UNIVERSE, "SOL"];
    expect(resolveWatchlist(null, grown)).toContain("SOL");
  });

  it("does not pick up new instruments once the list is curated", () => {
    // Deliberate: a user who pruned their list has expressed an opinion, and
    // silently re-adding to it would undo their choice.
    const grown = [...UNIVERSE, "SOL"];
    expect(resolveWatchlist(["AAPL"], grown)).toEqual(["AAPL"]);
  });

  it("drops a symbol that has left the universe", () => {
    // A persisted list outlives a delisting or a rename. Left in, it renders a
    // row with no instrument behind it that the user cannot remove.
    expect(resolveWatchlist(["AAPL", "DELISTED"], UNIVERSE)).toEqual(["AAPL"]);
  });

  it("preserves the user's own ordering", () => {
    expect(resolveWatchlist(["EURUSD", "AAPL"], UNIVERSE)).toEqual(["EURUSD", "AAPL"]);
  });

  it("returns nothing for an empty curated list", () => {
    // Distinct from `null` — this is "I unfollowed everything", which the
    // screen answers with an empty state rather than the full universe.
    expect(resolveWatchlist([], UNIVERSE)).toEqual([]);
  });
});
