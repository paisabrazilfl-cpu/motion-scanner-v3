import { Router } from "express";
import { db, apiKeysTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { runScan, DEFAULT_CONFIG } from "../lib/scanner";
import { decrypt } from "../lib/crypto";
import type { TenantProviderKeys } from "../lib/providers";

const router = Router();

// ── Universe definitions ──────────────────────────────────────────────────

// ─ Broad indices ─────────────────────────────────────────────────────────
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

const UNIVERSE_NASDAQ100 = [
  "AAPL","MSFT","NVDA","AMZN","META","GOOGL","AVGO","TSLA","COST","NFLX",
  "ORCL","ADBE","AMD","QCOM","INTU","TXN","CSCO","AMGN","ISRG","HON",
  "BKNG","VRTX","REGN","PANW","LRCX","KLAC","AMAT","SNPS","CDNS","MRVL",
  "ADI","CRWD","MELI","ASML","MDB","DDOG","TEAM","WDAY","ZS","FTNT",
  "PCAR","PAYX","CTAS","FAST","ODFL","BIIB","IDXX","GEHC","EXC","FANG",
  "DLTR","WBD","VRSK","ON","ALGN","ROST","AEP","XEL","CTSH","ANSS",
  "ILMN","MRNA","TTWO","SIRI","NXPI","APP","PLTR","ABNB","CEG","MKL",
  "ENPH","CPRT","DXCM","GILD","SBUX","KDP","MAR","PYPL","MDLZ","AZN",
];

const UNIVERSE_DOW30 = [
  "AAPL","MSFT","JPM","V","WMT","MCD","HON","HD","CAT","IBM",
  "GS","BA","UNH","JNJ","PG","CVX","AMGN","DIS","MMM","KO",
  "CRM","AXP","MRK","NKE","TRV","DOW","CSCO","VZ","WBA","INTC",
];

// ─ GICS Sectors ──────────────────────────────────────────────────────────
const UNIVERSE_TECH = [
  "AAPL","MSFT","NVDA","GOOGL","META","AVGO","ORCL","CSCO","ADBE","AMD",
  "INTU","QCOM","ADI","TXN","CRM","NOW","LRCX","AMAT","KLAC","SNPS",
  "CDNS","MRVL","PANW","FTNT","CRWD","ZS","NET","SNOW","MDB","DDOG",
  "PLTR","APP","TTD","COIN","UBER","LYFT","SHOP","SPOT","SQ","HOOD",
];

const UNIVERSE_FINANCE = [
  "JPM","BAC","WFC","GS","MS","C","BLK","SCHW","AXP","V","MA",
  "USB","PNC","COF","DFS","SPGI","MCO","ICE","CME","CB",
  "MMC","AON","MET","PRU","AFL","ALL","PGR","AIG","TROW","CINF",
  "FDS","RJF","SF","NTRS","STT","BK","FITB","RF","HBAN","CFG",
];

const UNIVERSE_HEALTH = [
  "UNH","JNJ","ABBV","LLY","MRK","TMO","ABT","DHR","AMGN","GILD",
  "MDT","SYK","ISRG","REGN","VRTX","CI","BMY","ZTS","BIIB",
  "ILMN","BDX","DXCM","IDXX","IQV","HCA","DGX","LH","CAH","MCK",
  "CNC","MOH","HUM","CVS","GEHC","SOLV","PODD","ALGN","EW","BAX",
];

const UNIVERSE_ENERGY = [
  "XOM","CVX","EOG","COP","SLB","MPC","PSX","VLO","OXY",
  "HES","DVN","BKR","HAL","MRO","APA","CTRA","NOV","HP","TRGP","KMI",
  "WMB","OKE","LNG","CVI","DINO","SM","PR","CIVI","MGY","VTLE",
];

const UNIVERSE_CONSUMER = [
  "AMZN","TSLA","COST","HD","MCD","NKE","SBUX","LOW","TJX","TGT",
  "DIS","NFLX","BKNG","MAR","HLT","YUM","LULU","ROST","ULTA","DG",
  "DLTR","POOL","WSM","RH","ORLY","AZO","CASY","WBA","KR","SYY",
];

const UNIVERSE_INDUSTRIALS = [
  "HON","UPS","CAT","GE","RTX","DE","LMT","NOC","GD","BA",
  "ETN","EMR","ITW","PH","ROK","AME","FTV","DOV","GNRC","XYL",
  "FAST","ODFL","CHRW","NSC","CSX","UNP","CP","CNI","WAB","EXPD",
  "LHX","LDOS","BAH","SAIC","CACI","DRS","HII","TDG","HEICO","TXT",
];

const UNIVERSE_UTILITIES = [
  "NEE","SO","DUK","AEP","SRE","D","EXC","XEL","PCG","ED",
  "AWK","PPL","FE","ETR","AES","NRG","CMS","LNT","PNW","NI",
  "EVRG","OGE","WEC","WTRG","SWX","AVA","IDA","BKH","POR","NWE",
];

const UNIVERSE_MATERIALS = [
  "LIN","APD","ECL","SHW","PPG","NEM","FCX","NUE","STLD","RS",
  "CF","MOS","FMC","ALB","BALL","PKG","IP","WRK","SEE","SON",
  "VMC","MLM","EXP","SLGN","GEF","CLF","AA","X","CMC","ATI",
];

const UNIVERSE_REALESTATE = [
  "PLD","AMT","EQIX","CCI","WELL","O","SPG","DLR","PSA","AVB",
  "EQR","INVH","NLY","AGNC","MPW","VTR","PEAK","HST","KIM","FRT",
  "REG","BRX","EPR","SKT","NNN","STAG","REXR","EGP","FR","COLD",
];

const UNIVERSE_COMMS = [
  "GOOGL","META","NFLX","DIS","T","VZ","CMCSA","TMUS","CHTR","LYV",
  "EA","TTWO","RBLX","SNAP","PINS","SPOT","WBD","PARA","FOXA","FOX",
  "NYT","NWSA","OMC","IPG","ZETA","IAS","DV","MGNI","TTD","PUBM",
];

// ─ Thematic ──────────────────────────────────────────────────────────────
const UNIVERSE_SEMIS = [
  "NVDA","AVGO","TSM","QCOM","AMD","TXN","ADI","MU","LRCX","AMAT",
  "KLAC","SNPS","CDNS","MRVL","ON","NXPI","SWKS","QRVO","MPWR","WOLF",
  "SLAB","SITM","ALGM","AEHR","FORM","ACLS","UCTT","ONTO","AMBA","SMTC",
  "OLED","MKSI","COHU","ICHR","CAMT","ENTG","AZTA","BRKS","KLIC","CCMP",
];

const UNIVERSE_BIOTECH = [
  "AMGN","GILD","REGN","VRTX","BIIB","MRNA","ILMN","DXCM","IDXX","SGEN",
  "ALNY","BMRN","EXEL","IONS","HALO","SRPT","ARWR","FOLD","KRYS","RARE",
  "ACAD","INVA","ARVN","ROIV","KYMR","BLUE","RCKT","EDIT","NTLA","CRSP",
  "BEAM","PACB","VERV","PRME","TGTX","IMVT","JAZZ","INCY","SRTX","ACAD",
];

const UNIVERSE_SMALLCAP = [
  "AFRM","HOOD","UPST","SOFI","LC","DAVE","OPEN","UWMC","PFSI","GHLD",
  "CELH","USFD","CHWY","W","PRCT","HIMS","ACMR","VLD","SEER","RELY",
  "ASAN","BRZE","CWAN","ALTR","TASK","TASK","GTX","PAGS","CAAP","TFII",
  "COUR","UDMY","DUOL","SMAR","DOMO","YEXT","FSLY","BAND","LPSN","HUBS",
  "MNDY","BILL","PCTY","PAYC","TOST","FOUR","GPN","RPAY","EVERI","PAYO",
];

const UNIVERSE_MAGS7 = [
  "AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA",
];

const UNIVERSE_AICLOUD = [
  "NVDA","MSFT","GOOGL","AMZN","META","ORCL","CRM","NOW","SNOW","MDB",
  "DDOG","PLTR","AI","BBAI","SOUN","GFAI","ARQQ","IQ","PATH","AAON",
  "ANET","SMCI","DELL","HPE","NTAP","PSTG","BOX","OKTA","ZI","GTLB",
];

const UNIVERSE_DIVIDEND = [
  "JNJ","PG","KO","MCD","PEP","MMM","CL","CLX","GIS","MO",
  "PM","T","VZ","O","NNN","STAG","D","SO","DUK","ED",
  "AEP","XEL","WEC","CMS","LNT","PPL","NFG","NI","SWX","PNW",
  "ABBV","BMY","MRK","AMGN","GILD","ABT","MDT","BDX","SYK","ZBH",
];

const ALL_TICKERS = [...new Set([
  ...UNIVERSE_SP100, ...UNIVERSE_NASDAQ100, ...UNIVERSE_DOW30,
  ...UNIVERSE_TECH, ...UNIVERSE_FINANCE, ...UNIVERSE_HEALTH,
  ...UNIVERSE_ENERGY, ...UNIVERSE_CONSUMER, ...UNIVERSE_INDUSTRIALS,
  ...UNIVERSE_UTILITIES, ...UNIVERSE_MATERIALS, ...UNIVERSE_REALESTATE,
  ...UNIVERSE_COMMS, ...UNIVERSE_SEMIS, ...UNIVERSE_BIOTECH,
  ...UNIVERSE_SMALLCAP, ...UNIVERSE_MAGS7, ...UNIVERSE_AICLOUD,
  ...UNIVERSE_DIVIDEND,
])];

const UNIVERSES: Record<string, string[]> = {
  // Broad indices
  sp100:    UNIVERSE_SP100,
  nasdaq100:UNIVERSE_NASDAQ100,
  dow30:    UNIVERSE_DOW30,
  // GICS sectors
  tech:     UNIVERSE_TECH,
  finance:  UNIVERSE_FINANCE,
  health:   UNIVERSE_HEALTH,
  energy:   UNIVERSE_ENERGY,
  consumer: UNIVERSE_CONSUMER,
  industrials: UNIVERSE_INDUSTRIALS,
  utilities:   UNIVERSE_UTILITIES,
  materials:   UNIVERSE_MATERIALS,
  realestate:  UNIVERSE_REALESTATE,
  comms:       UNIVERSE_COMMS,
  // Thematic
  semis:    UNIVERSE_SEMIS,
  biotech:  UNIVERSE_BIOTECH,
  smallcap: UNIVERSE_SMALLCAP,
  mags7:    UNIVERSE_MAGS7,
  aicloud:  UNIVERSE_AICLOUD,
  dividend: UNIVERSE_DIVIDEND,
  // Everything
  all:      ALL_TICKERS,
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
