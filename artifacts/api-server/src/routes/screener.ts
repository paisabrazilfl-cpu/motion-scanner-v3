import { Router } from "express";
import { db, apiKeysTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { runScan, DEFAULT_CONFIG } from "../lib/scanner";
import { decrypt } from "../lib/crypto";
import type { TenantProviderKeys } from "../lib/providers";

const router = Router();

// ── Universe definitions ──────────────────────────────────────────────────
const UNIVERSE_SP100 = [
  "AAPL","MSFT","NVDA","AMZN","GOOGL","META","LLY","AVGO","JPM",
  "TSLA","UNH","XOM","V","COST","NFLX","ORCL","MA","WMT","JNJ",
  "PG","HD","ABBV","BAC","KO","MRK","CVX","CRM","PEP","AMD",
  "TMO","CSCO","ADBE","ACN","MCD","ABT","PM","NEE","NKE","WFC",
  "LIN","DIS","DHR","TXN","AMGN","UPS","LOW","INTU","QCOM","IBM",
  "GS","BLK","CAT","SPGI","AXP","GILD","MDT","PLD","DE",
  "SBUX","ADI","ADP","MMC","CB","NOW","ISRG","BKNG","REGN","VRTX",
  "SYK","C","GE","MO","CI","ETN","SCHW","LRCX","T","ZTS",
  "PGR","USB","TJX","EOG","SO","DUK","PNC","NSC","VZ","BMY",
  "CME","CL","FISV","AON","ITW","F","GM","FCX","PYPL","UBER",
];

const UNIVERSE_TECH = [
  "AAPL","MSFT","NVDA","GOOGL","META","AVGO","ORCL","CSCO","ADBE","AMD",
  "INTU","QCOM","ADI","TXN","CRM","NOW","LRCX","AMAT","KLAC","SNPS",
  "CDNS","MRVL","PANW","FTNT","CRWD","ZS","NET","SNOW","MDB","DDOG",
  "PLTR","APP","TTD","COIN","UBER","LYFT","SHOP","SPOT","SQ","HOOD",
];

const UNIVERSE_FINANCE = [
  "JPM","BAC","WFC","GS","MS","C","BLK","SCHW","AXP","V","MA",
  "USB","PNC","COF","DFS","SPGI","MCO","ICE","CME","CB",
  "MMC","AON","MET","PRU","AFL","ALL","PGR","AIG","TROW",
];

const UNIVERSE_HEALTH = [
  "UNH","JNJ","ABBV","LLY","MRK","TMO","ABT","DHR","AMGN","GILD",
  "MDT","SYK","ISRG","REGN","VRTX","CI","BMY","ZTS","BIIB",
  "ILMN","BDX","DXCM","IDXX","IQV","HCA","DGX","LH","CAH","MCK",
];

const UNIVERSE_ENERGY = [
  "XOM","CVX","EOG","COP","SLB","MPC","PSX","VLO","OXY",
  "HES","DVN","BKR","HAL","MRO","APA","CTRA","NOV","HP","TRGP","KMI",
];

const UNIVERSE_CONSUMER = [
  "AMZN","TSLA","COST","HD","MCD","NKE","SBUX","LOW","TJX","TGT",
  "DIS","NFLX","BKNG","MAR","HLT","YUM","LULU","ROST","ULTA","DG",
  "DLTR","POOL","WSM","RH","ORLY","AZO","CASY","WBA","KR","SYY",
];

const UNIVERSES: Record<string, string[]> = {
  sp100: UNIVERSE_SP100,
  tech: UNIVERSE_TECH,
  finance: UNIVERSE_FINANCE,
  health: UNIVERSE_HEALTH,
  energy: UNIVERSE_ENERGY,
  consumer: UNIVERSE_CONSUMER,
  all: [...new Set([...UNIVERSE_SP100,...UNIVERSE_TECH,...UNIVERSE_FINANCE,...UNIVERSE_HEALTH,...UNIVERSE_ENERGY,...UNIVERSE_CONSUMER])],
};

// ── Per-tenant cache (5-min TTL) ──────────────────────────────────────────
interface CacheEntry {
  records: Record<string, unknown>[];
  cachedAt: Date;
}
const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;

async function getTenantKeys(tenantId: number): Promise<TenantProviderKeys> {
  try {
    const rows = await db.select().from(apiKeysTable).where(eq(apiKeysTable.tenantId, tenantId)).limit(1);
    const row = rows[0];
    if (!row) return {};
    const safe = (enc: string | null | undefined): string | undefined => {
      if (!enc) return undefined;
      try { return decrypt(enc); } catch { return undefined; }
    };
    return { polygonKey: safe(row.polygonApiKeyEnc), finnhubKey: safe(row.finnhubApiKeyEnc) };
  } catch { return {}; }
}

// ── GET /api/screener ─────────────────────────────────────────────────────
router.get("/screener", async (req, res): Promise<void> => {
  const q = req.query as Record<string, string | undefined>;

  const universeKey   = (q.universe ?? "sp100") as string;
  const bust          = q.bust === "true";

  const priceMin  = parseFloat(q.priceMin  ?? "1");
  const priceMax  = parseFloat(q.priceMax  ?? "10000");
  const rsiMin    = parseFloat(q.rsiMin    ?? "0");
  const rsiMax    = parseFloat(q.rsiMax    ?? "100");
  const adxMin    = parseFloat(q.adxMin    ?? "0");
  const rvolMin   = parseFloat(q.rvolMin   ?? "0");
  const scoreMin  = parseFloat(q.scoreMin  ?? "0");
  const stochMin  = q.stochMin  != null ? parseFloat(q.stochMin)  : null;
  const stochMax  = q.stochMax  != null ? parseFloat(q.stochMax)  : null;

  const verdictFilter    = q.verdictFilter     ?? "all";
  const aboveEma10       = q.aboveEma10        === "true";
  const aboveSma20       = q.aboveSma20        === "true";
  const emaStackRequired = q.emaStackRequired  === "true";
  const macd3mAboveZero  = q.macd3mAboveZero   === "true";
  const macd3mHistPos    = q.macd3mHistPositive === "true";
  const breakoutOnly     = q.breakoutOnly      === "true";

  const tickers = UNIVERSES[universeKey] ?? UNIVERSES.sp100;
  const key = `${req.tenantId}:${universeKey}`;
  const cached = cache.get(key);
  const stale = !cached || bust || Date.now() - cached.cachedAt.getTime() > TTL_MS;

  let allRecords: Record<string, unknown>[];

  if (stale) {
    req.log.info({ universe: universeKey, count: tickers.length }, "screener: scanning universe");
    const providerKeys = await getTenantKeys(req.tenantId);
    const result = await runScan(tickers, DEFAULT_CONFIG, false, providerKeys);
    allRecords = [
      ...result.candidates,
      ...result.hold,
      ...result.rejected,
    ] as unknown as Record<string, unknown>[];
    cache.set(key, { records: allRecords, cachedAt: new Date() });
    req.log.info({ scanned: allRecords.length }, "screener: cache populated");
  } else {
    allRecords = cached!.records;
  }

  // ── Apply user filters ────────────────────────────────────────────────
  type AnyRec = {
    verdict: string;
    score: number;
    technical?: Record<string, unknown> | null;
  };

  const filtered = (allRecords as AnyRec[]).filter((c) => {
    const tech = (c.technical ?? {}) as Record<string, unknown>;
    const price      = tech.price      as number | undefined;
    const rsi        = tech.rsi        as number | undefined;
    const adx        = tech.adx        as number | undefined;
    const rvol       = tech.rvol       as number | undefined;
    const ema10      = tech.ema10      as number | undefined;
    const sma20      = tech.sma20      as number | undefined;
    const stochSlowK = tech.stochSlowK as number | undefined;
    const macd3mLine = tech.macd3m     as number | undefined;
    const macd3mHist = tech.macd3mHist as number | undefined;
    const emaStackOk = Boolean(tech.ema_stack_ok);
    const breakout   = Boolean(tech.breakout);

    if (price  != null && (price  < priceMin || price  > priceMax)) return false;
    if (rsi    != null && (rsi    < rsiMin   || rsi    > rsiMax  )) return false;
    if (adx    != null &&  adx    < adxMin                        ) return false;
    if (rvol   != null &&  rvol   < rvolMin                       ) return false;
    if (c.score < scoreMin) return false;

    if (verdictFilter === "go"      && c.verdict !== "GO"                         ) return false;
    if (verdictFilter === "go_hold" && c.verdict !== "GO" && c.verdict !== "HOLD") return false;

    if (aboveEma10       && ema10 != null && price != null && price < ema10) return false;
    if (aboveSma20       && sma20 != null && price != null && price < sma20) return false;
    if (emaStackRequired && !emaStackOk) return false;
    if (breakoutOnly     && !breakout  ) return false;

    if (stochMin != null && stochSlowK != null && stochSlowK < stochMin) return false;
    if (stochMax != null && stochSlowK != null && stochSlowK > stochMax) return false;

    if (macd3mAboveZero && macd3mLine != null && macd3mLine < 0) return false;
    if (macd3mHistPos   && macd3mHist != null && macd3mHist < 0) return false;

    return true;
  });

  filtered.sort((a, b) => b.score - a.score);

  const entry = cache.get(key);
  res.json({
    results: filtered,
    total: filtered.length,
    scanned: allRecords.length,
    cachedAt: entry?.cachedAt.toISOString() ?? new Date().toISOString(),
  });
});

export default router;
