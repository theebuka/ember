"use client";

import { createContext, useContext } from "react";

/**
 * Whether this deployment serves generated prices, known before anything loads.
 *
 * **It was read from a query, and that was wrong twice over.** Every screen took
 * `someQuery.data?.synthetic ?? true`, so:
 *
 *   1. The server always rendered "Generated prices", and a live build's client
 *      often had the answer before hydration reached the header — a hydration
 *      mismatch on every screen, which regenerated the whole tree (decision 224).
 *   2. Until the query landed, a live deployment *said its prices were modelled*.
 *      On Signals that query is `/api/advice`, eight seconds cold — eight
 *      seconds of a false disclosure on the one screen people act from.
 *
 * But this is not data. It is `EMBER_DATA_PROVIDER` plus two keys, fixed for the
 * life of the process, so the root layout reads it once on the server and hands
 * it down. Server and client render the same answer from the first byte, and no
 * screen has to wait on a request to know where its prices come from.
 *
 * The default is `true` for anything rendered outside the provider, for the
 * reason the chip gives: a caveat that turns out unnecessary is the safe way
 * round.
 */
const SyntheticContext = createContext(true);

export function DataSourceProvider({
  synthetic,
  children,
}: {
  synthetic: boolean;
  children: React.ReactNode;
}) {
  return <SyntheticContext.Provider value={synthetic}>{children}</SyntheticContext.Provider>;
}

export function useSynthetic(): boolean {
  return useContext(SyntheticContext);
}
