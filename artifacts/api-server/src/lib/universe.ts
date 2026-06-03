import { logger } from "./logger";
import { FULL_MARKET_TICKERS } from "./universe-data";

// ── Full US-market common-stock universe ──────────────────────────────────
// The universe is BAKED INTO the repo (see `universe-data.ts`) so the scanner
// never hits the network at run time. The data is the NASDAQ Trader public
// symbol directory (nasdaqlisted + otherlisted), filtered to common shares
// (plain 1–5 letter symbols, excluding test issues and ETFs).
//
// To refresh the bundled list, run:
//   pnpm --filter @workspace/api-server run gen:universe

/**
 * Returns every common-stock ticker on the major US exchanges (NASDAQ + NYSE +
 * NYSE American). Served from the bundled list — no network call. Kept async so
 * callers don't need to change if the source ever becomes dynamic again.
 */
export async function getFullMarketUniverse(): Promise<string[]> {
  if (FULL_MARKET_TICKERS.length === 0) {
    // Fail loudly: an empty universe would otherwise let a scan job "complete"
    // with 0 tickers processed (a silent false-success). Regenerate the bundled
    // data with `pnpm --filter @workspace/api-server run gen:universe`.
    logger.error("universe: bundled FULL_MARKET_TICKERS is empty");
    throw new Error("full-market universe is empty (regenerate universe-data.ts)");
  }
  return [...FULL_MARKET_TICKERS];
}
