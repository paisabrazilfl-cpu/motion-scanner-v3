// Regenerates `src/lib/universe-data.ts` from the NASDAQ Trader public symbol
// directory. Run with: pnpm --filter @workspace/api-server run gen:universe
//
// Keeps only ordinary common shares: plain 1–5 letter symbols, excluding test
// issues and ETFs (matches the historical fetch behaviour exactly).

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const NASDAQ_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
const OTHER_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt";
const COMMON_SYMBOL = /^[A-Z]{1,5}$/;

async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parsePipeFile(text, symbolCol, testIssueCol, etfCol) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.startsWith("File Creation Time")) continue;
    const cols = line.split("|");
    const symbol = (cols[symbolCol] ?? "").trim().toUpperCase();
    const testIssue = (cols[testIssueCol] ?? "").trim().toUpperCase();
    const etf = (cols[etfCol] ?? "").trim().toUpperCase();
    if (!symbol) continue;
    if (testIssue === "Y") continue;
    if (etf === "Y") continue;
    if (!COMMON_SYMBOL.test(symbol)) continue;
    out.push(symbol);
  }
  return out;
}

async function main() {
  const [nasdaqTxt, otherTxt] = await Promise.all([
    fetchText(NASDAQ_LISTED),
    fetchText(OTHER_LISTED),
  ]);
  // nasdaqlisted.txt: Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares
  const nasdaq = parsePipeFile(nasdaqTxt, 0, 3, 6);
  // otherlisted.txt: ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol
  const other = parsePipeFile(otherTxt, 0, 6, 4);
  const tickers = [...new Set([...nasdaq, ...other])].sort();

  const rows = [];
  for (let i = 0; i < tickers.length; i += 12) {
    rows.push("  " + tickers.slice(i, i + 12).map((t) => `"${t}"`).join(", ") + ",");
  }
  const out = `// AUTO-GENERATED — do not edit by hand.
// Full US-market common-stock universe (NASDAQ + NYSE + NYSE American),
// parsed from the NASDAQ Trader public symbol directory and baked in so the
// scanner needs no network fetch at run time.
// Regenerate with: pnpm --filter @workspace/api-server run gen:universe
// Generated: ${new Date().toISOString().slice(0, 10)} — ${tickers.length} tickers.

export const FULL_MARKET_TICKERS: readonly string[] = [
${rows.join("\n")}
];
`;
  const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "universe-data.ts");
  writeFileSync(dest, out);
  console.log(`universe: wrote ${tickers.length} tickers (nasdaq ${nasdaq.length}, other ${other.length}) -> ${dest}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
