/**
 * Motion Scanner v3.0 — multi-provider scanning engine.
 * Yahoo Finance: free baseline (always active).
 * Polygon.io: real-time quotes, options flow, news.
 * Finnhub: real-time quote, news sentiment, earnings, company profile.
 */
import {
  fetchYahooChart, fetchYahooFundamentals, fetchSpyReturn,
  fetchPolygonData, fetchFinnhubData,
  TenantProviderKeys,
} from "./providers";

// ── Default config ───────────────────────────────────────────────────────────
export const DEFAULT_CONFIG: Record<string, unknown> = {
  universe: { price_min: 1.0, price_max: 2000.0, market_cap_min: 50_000_000, adv_min: 500_000 },
  technical: { rvol_min: 1.2, atr_pct_min: 0.01, ema_stack_required: false, rsi_band: [30, 85] },
  fundamental: { earnings_blackout_days: 2 },
  flow_motion: { dollar_volume_min: 1_000_000 },
  indicators: {
    require_bull_stack: false, min_bull_stack: 0.6, min_stoch_bull_heat: 0.0,
    avoid_overbought: false, require_macd_above_zero: false,
    require_above_cloud: false, min_composite_bull: 0.0,
    veto_sector_headwind: false,
  },
  options: { enabled: true, min_flow_bull_score: 0.0 },
  sector: { enabled: true },
  execution: { enabled: false, paper_only: true, min_score_to_fire: 0.5, slippage_buffer_pct: 0.005 },
  risk: { max_position_usd: 2000, max_concurrent_positions: 5, max_daily_loss_pct: 0.02 },
  monte_carlo: { simulations: 500, holding_days: 5, target_R: 2.0 },
  scoring_weights: { technical: 0.25, flow: 0.15, fundamental: 0.10, monte_carlo: 0.20, options: 0.15, sentiment: 0.10, sector: 0.05 },
  notifications: { enabled: false, notify_on: "GO" },
};

// ── Types ────────────────────────────────────────────────────────────────────
export interface TechData {
  ok: boolean;
  price: number;
  close: number;
  high: number;
  low: number;
  open: number;
  volume: number;
  rvol: number;
  atr: number;
  atr_pct: number;
  ema9: number;
  ema21: number;
  ema50: number;
  ema200: number;
  ema_stack_ok: boolean;
  rsi: number;
  macd: number;
  macdSignal: number;
  macdHist: number;
  adx: number;
  stochK: number;
  stochD: number;
  breakout: boolean;
  breakout52w: boolean;
  dollar_volume: number;
  change: number;
  changePct: number;
}

export interface FlowData {
  ok: boolean;
  dollar_volume: number;
  rel_strength_spy: number;
  news_velocity: number;
  volumeSpike: boolean;
}

export interface FundData {
  ok: boolean;
  days_to_earnings: number | null;
  short_interest: number | null;
  float: number | null;
  market_cap: number | null;
  pe_ratio: number | null;
  beta: number | null;
  sector: string | null;
  industry: string | null;
  eps_surprise_pct: number | null;
}

export interface OptionsData {
  ok: boolean;
  putCallRatio: number | null;
  impliedVolatility: number | null;
  callVolume: number | null;
  putVolume: number | null;
  flowScore: number;
  unusualActivity: boolean;
}

export interface SentimentData {
  ok: boolean;
  score: number | null;
  bullishPct: number | null;
  bearishPct: number | null;
  buzz: number | null;
  articleCount: number;
  latestHeadline: string | null;
}

export interface TriState { state: "GO" | "HOLD" | "ABORT"; reason: string; }

// ── Technical indicators ─────────────────────────────────────────────────────
function ema(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  const k = 2 / (period + 1);
  let e = prices[0];
  for (let i = 1; i < prices.length; i++) e = prices[i] * k + e * (1 - k);
  return e;
}

function rsi(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
}

function macd(prices: number[]): { macd: number; signal: number; hist: number } {
  const fast = ema(prices, 12);
  const slow = ema(prices, 26);
  const macdLine = fast - slow;
  // Approximate signal with last 9 values of macd
  const signal = macdLine * (2 / 10);
  return { macd: macdLine, signal, hist: macdLine - signal };
}

function atr(highs: number[], lows: number[], closes: number[], period = 14): number {
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / Math.max(slice.length, 1);
}

function rvol(volumes: number[], period = 20): number {
  if (volumes.length < 2) return 1;
  const recent = volumes[volumes.length - 1];
  const avg = volumes.slice(-period - 1, -1).reduce((a, b) => a + b, 0) / Math.max(period, 1);
  return avg > 0 ? recent / avg : 1;
}

function adx(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (highs.length < period * 2) return 20;
  const dmPlus: number[] = [], dmMinus: number[] = [], trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    dmPlus.push(upMove > downMove && upMove > 0 ? upMove : 0);
    dmMinus.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  const slice = (arr: number[]) => arr.slice(-period).reduce((a, b) => a + b, 0);
  const trSum = slice(trs), dmpSum = slice(dmPlus), dmmSum = slice(dmMinus);
  if (trSum === 0) return 20;
  const diPlus = (dmpSum / trSum) * 100;
  const diMinus = (dmmSum / trSum) * 100;
  const diSum = diPlus + diMinus;
  if (diSum === 0) return 20;
  return Math.abs(diPlus - diMinus) / diSum * 100;
}

function stochastic(highs: number[], lows: number[], closes: number[], kPeriod = 14, dPeriod = 3): { k: number; d: number } {
  const slice = closes.slice(-kPeriod);
  const highSlice = highs.slice(-kPeriod);
  const lowSlice = lows.slice(-kPeriod);
  const highestHigh = Math.max(...highSlice);
  const lowestLow = Math.min(...lowSlice);
  const range = highestHigh - lowestLow;
  const k = range > 0 ? ((slice[slice.length - 1] - lowestLow) / range) * 100 : 50;
  return { k, d: k }; // simplified
}

function isBreakout(closes: number[], period = 20): boolean {
  if (closes.length < period + 1) return false;
  return closes[closes.length - 1] > Math.max(...closes.slice(-period - 1, -1));
}

function isBreakout52w(closes: number[]): boolean {
  const slice = closes.slice(-252);
  if (slice.length < 20) return false;
  return closes[closes.length - 1] >= Math.max(...slice.slice(0, -1)) * 0.97;
}

// ── Technical data ────────────────────────────────────────────────────────────
export async function getTechnical(ticker: string): Promise<TechData> {
  const chart = await fetchYahooChart(ticker, "1y");
  if (!chart || chart.closes.length < 20) return { ok: false } as unknown as TechData;
  try {
    const { closes, highs, lows, opens, volumes } = chart;
    const close = closes[closes.length - 1];
    const high = highs[highs.length - 1];
    const low = lows[lows.length - 1];
    const open = opens[opens.length - 1] ?? close;
    const volume = volumes[volumes.length - 1];
    const prevClose = closes[closes.length - 2] ?? close;

    const e9 = ema(closes, 9), e21 = ema(closes, 21), e50 = ema(closes, 50), e200 = ema(closes, 200);
    const atrVal = atr(highs, lows, closes);
    const rvolVal = rvol(volumes);
    const rsiVal = rsi(closes);
    const macdVals = macd(closes);
    const adxVal = adx(highs, lows, closes);
    const stoch = stochastic(highs, lows, closes);
    const dolVol = close * volume;

    return {
      ok: true, price: close, close, high, low, open, volume,
      rvol: parseFloat(rvolVal.toFixed(2)),
      atr: parseFloat(atrVal.toFixed(4)),
      atr_pct: parseFloat((atrVal / close).toFixed(4)),
      ema9: parseFloat(e9.toFixed(2)), ema21: parseFloat(e21.toFixed(2)),
      ema50: parseFloat(e50.toFixed(2)), ema200: parseFloat(e200.toFixed(2)),
      ema_stack_ok: close > e9 && e9 > e21 && e21 > e50,
      rsi: parseFloat(rsiVal.toFixed(1)),
      macd: parseFloat(macdVals.macd.toFixed(4)),
      macdSignal: parseFloat(macdVals.signal.toFixed(4)),
      macdHist: parseFloat(macdVals.hist.toFixed(4)),
      adx: parseFloat(adxVal.toFixed(1)),
      stochK: parseFloat(stoch.k.toFixed(1)),
      stochD: parseFloat(stoch.d.toFixed(1)),
      breakout: isBreakout(closes),
      breakout52w: isBreakout52w(closes),
      dollar_volume: dolVol,
      change: parseFloat((close - prevClose).toFixed(2)),
      changePct: parseFloat(((close - prevClose) / prevClose).toFixed(4)),
    };
  } catch { return { ok: false } as unknown as TechData; }
}

// ── Fundamental data ──────────────────────────────────────────────────────────
export async function getFundamentals(ticker: string, finnhub: FinnhubDataResult | null): Promise<FundData> {
  // Yahoo fundamentals as baseline
  const yf = await fetchYahooFundamentals(ticker);

  // Merge with Finnhub if available
  const dte = finnhub?.earnings?.daysToEarnings ?? yf?.daysToEarnings ?? null;
  const epsSurprise = finnhub?.earnings?.epsSurprisePct ?? null;

  return {
    ok: true,
    days_to_earnings: dte,
    short_interest: yf?.shortInterest ?? null,
    float: yf?.floatShares ?? null,
    market_cap: finnhub?.profile?.marketCap ?? yf?.marketCap ?? null,
    pe_ratio: finnhub?.profile?.peRatio ?? yf?.peRatio ?? null,
    beta: finnhub?.profile?.beta ?? yf?.beta ?? null,
    sector: finnhub?.profile?.sector ?? yf?.sector ?? null,
    industry: finnhub?.profile?.industry ?? yf?.industry ?? null,
    eps_surprise_pct: epsSurprise,
  };
}

interface FinnhubDataResult {
  quote: { price: number; change: number; changePct: number } | null;
  earnings: { daysToEarnings: number | null; epsEstimate: number | null; epsSurprisePct: number | null } | null;
  profile: { marketCap: number | null; sector: string | null; industry: string | null; beta: number | null; peRatio: number | null; name: string | null } | null;
  sentiment: { score: number | null; bullishPct: number | null; bearishPct: number | null; buzz: number | null; weeklyAvg: number | null } | null;
}

// ── Flow data ─────────────────────────────────────────────────────────────────
export async function getFlow(ticker: string, spyReturn: number, chart?: { closes: number[]; volumes: number[] }): Promise<FlowData> {
  try {
    const { closes, volumes } = chart ?? { closes: [], volumes: [] };
    if (closes.length < 5) return { ok: false } as unknown as FlowData;
    const close = closes[closes.length - 1];
    const volume = volumes[volumes.length - 1];
    const dolVol = close * volume;
    const lookback = Math.min(5, closes.length - 1);
    const prev = closes[closes.length - 1 - lookback];
    const ret = prev > 0 ? (close - prev) / prev : 0;
    const rvolVal = rvol(volumes);
    return {
      ok: true,
      dollar_volume: dolVol,
      rel_strength_spy: parseFloat((ret - spyReturn).toFixed(4)),
      news_velocity: 0.5,
      volumeSpike: rvolVal > 2,
    };
  } catch { return { ok: false } as unknown as FlowData; }
}

// ── Qualification engine ──────────────────────────────────────────────────────
export function qualify(tech: TechData, fund: FundData, flow: FlowData, cfg: Record<string, unknown>): TriState {
  if (!tech?.ok) return { state: "ABORT", reason: "NO_TECHNICAL_DATA" };

  const uni = cfg.universe as any ?? {};
  if (tech.close < (uni.price_min ?? 1)) return { state: "ABORT", reason: "PRICE_BELOW_FLOOR" };
  if (tech.close > (uni.price_max ?? 2000)) return { state: "ABORT", reason: "PRICE_ABOVE_CEILING" };

  if (flow?.ok && flow.dollar_volume < ((cfg.flow_motion as any)?.dollar_volume_min ?? 1_000_000)) {
    return { state: "ABORT", reason: "DOLLAR_VOL_TOO_LOW" };
  }

  if (fund?.ok && fund.days_to_earnings !== null) {
    const blackout = (cfg.fundamental as any)?.earnings_blackout_days ?? 2;
    if (fund.days_to_earnings >= 0 && fund.days_to_earnings <= blackout) {
      return { state: "ABORT", reason: `EARNINGS_BLACKOUT_${fund.days_to_earnings}D` };
    }
  }

  const tcfg = cfg.technical as any ?? {};
  if (tech.rvol < (tcfg.rvol_min ?? 1.2)) return { state: "HOLD", reason: `RVOL_LOW_${tech.rvol.toFixed(2)}` };
  if (tech.atr_pct < (tcfg.atr_pct_min ?? 0.01)) return { state: "HOLD", reason: "ATR_BELOW_MIN" };
  if ((tcfg.ema_stack_required ?? false) && !tech.ema_stack_ok) return { state: "HOLD", reason: "EMA_STACK_BROKEN" };

  const [rsiLo, rsiHi] = (tcfg.rsi_band as [number, number]) ?? [30, 85];
  if (tech.rsi < rsiLo || tech.rsi > rsiHi) {
    return { state: "HOLD", reason: `RSI_OUT_OF_BAND_${tech.rsi.toFixed(1)}` };
  }

  return { state: "GO", reason: "ALL_GATES_PASS" };
}

// ── Monte Carlo ────────────────────────────────────────────────────────────────
export function monteCarlo(tech: TechData, cfg: Record<string, unknown>): Record<string, unknown> {
  const mcCfg = cfg.monte_carlo as any ?? {};
  const sims = Math.min(mcCfg.simulations ?? 500, 500);
  const days = mcCfg.holding_days ?? 5;
  const targetR = mcCfg.target_R ?? 2;
  const vol = Math.max(tech.atr_pct, 0.005);
  const drift = 0.0003;
  const entry = tech.close;
  const stop = entry * (1 - vol * 1.5);
  const target = entry + (entry - stop) * targetR;
  const risk = entry - stop;

  let wins = 0;
  const finalPrices: number[] = [];
  for (let s = 0; s < sims; s++) {
    let price = entry;
    let stopped = false;
    for (let d = 0; d < days; d++) {
      const ret = drift + vol * (Math.random() * 2 - 1) * Math.sqrt(1 / 252);
      price *= (1 + ret);
      if (price <= stop) { stopped = true; break; }
    }
    finalPrices.push(stopped ? stop : price);
    if (!stopped && price >= target) wins++;
  }
  finalPrices.sort((a, b) => a - b);
  const expectedPnl = finalPrices.reduce((a, b) => a + b, 0) / finalPrices.length - entry;
  const expectedR = risk > 0 ? expectedPnl / risk : 0;

  return {
    ok: true, simulations: sims, holding_days: days,
    entry_price: parseFloat(entry.toFixed(2)),
    stop_price: parseFloat(stop.toFixed(2)),
    target_price: parseFloat(target.toFixed(2)),
    win_rate: parseFloat((wins / sims).toFixed(3)),
    expected_R: parseFloat(Math.max(0, expectedR).toFixed(3)),
    p10: parseFloat(finalPrices[Math.floor(finalPrices.length * 0.1)].toFixed(2)),
    p50: parseFloat(finalPrices[Math.floor(finalPrices.length * 0.5)].toFixed(2)),
    p90: parseFloat(finalPrices[Math.floor(finalPrices.length * 0.9)].toFixed(2)),
  };
}

// ── Composite score ────────────────────────────────────────────────────────────
export function compositeScore(
  tech: TechData,
  flow: FlowData,
  fund: FundData,
  mc: Record<string, unknown> | null,
  options: OptionsData | null,
  sentiment: SentimentData | null,
  cfg: Record<string, unknown>
): number {
  const w = cfg.scoring_weights as any ?? {};

  const tScore = tech?.ok ? (
    Math.min(1, tech.rvol / 4) * 0.30 +
    Math.min(1, tech.atr_pct / 0.08) * 0.20 +
    (tech.ema_stack_ok ? 1 : 0.3) * 0.20 +
    (tech.breakout ? 1 : 0.2) * 0.15 +
    (tech.adx > 25 ? Math.min(1, tech.adx / 50) : 0) * 0.15
  ) : 0;

  const fScore = flow?.ok ? (
    Math.min(1, flow.dollar_volume / 30_000_000) * 0.5 +
    Math.min(1, Math.max(0, flow.rel_strength_spy + 0.02) / 0.05) * 0.3 +
    (flow.volumeSpike ? 0.2 : 0)
  ) : 0;

  const fuScore = fund?.ok ? (
    (fund.eps_surprise_pct != null ? Math.min(1, Math.max(0, fund.eps_surprise_pct) / 20) * 0.4 : 0.2) +
    (fund.short_interest != null ? Math.min(1, fund.short_interest / 0.2) * 0.3 : 0.15) +
    (fund.market_cap != null && fund.market_cap > 1_000_000_000 ? 0.3 : 0.1)
  ) : 0;

  const mcScore = mc ? Math.max(0, Math.min(1, (mc.expected_R as number) / 1.5)) : 0;

  const optScore = options?.ok ? options.flowScore : 0.5;

  const sentScore = sentiment?.ok && sentiment.score != null
    ? Math.max(0, Math.min(1, (sentiment.score + 0.5) / 1.0))
    : 0.5;

  const wT = parseFloat(String(w.technical ?? 0.25));
  const wF = parseFloat(String(w.flow ?? 0.15));
  const wFu = parseFloat(String(w.fundamental ?? 0.10));
  const wMc = parseFloat(String(w.monte_carlo ?? 0.20));
  const wOpt = parseFloat(String(w.options ?? 0.15));
  const wSent = parseFloat(String(w.sentiment ?? 0.10));
  const wSect = parseFloat(String(w.sector ?? 0.05));

  const total = wT + wF + wFu + wMc + wOpt + wSent + wSect;
  const raw = (wT * tScore + wF * fScore + wFu * fuScore + wMc * mcScore + wOpt * optScore + wSent * sentScore) / (total || 1);
  return Math.max(0, Math.min(1, raw));
}

// ── Sector rotation (re-exported for route use) ────────────────────────────────
export { getSectorRotation } from "./sector";

// ── Main scan function ────────────────────────────────────────────────────────
interface CandRecord {
  ticker: string;
  verdict: "GO" | "HOLD" | "ABORT";
  score: number;
  reason: string;
  technical?: TechData;
  flow?: FlowData;
  fundamentals?: FundData;
  options?: OptionsData;
  sentiment?: SentimentData;
  monteCarlo?: Record<string, unknown>;
  [key: string]: unknown;
}

export async function runScan(
  tickers: string[],
  cfg: Record<string, unknown>,
  computeSectors: boolean,
  providerKeys: TenantProviderKeys = {}
): Promise<{ candidates: CandRecord[]; hold: CandRecord[]; rejected: CandRecord[]; sectorRotation: Record<string, unknown> | null; activeProviders: string[] }> {
  const activeProviders: string[] = ["yahoo_finance"];
  if (providerKeys.polygonKey) activeProviders.push("polygon");
  if (providerKeys.finnhubKey) activeProviders.push("finnhub");

  const [spyReturn] = await Promise.all([fetchSpyReturn()]);

  const results = await Promise.allSettled(
    tickers.map((tk) => scanTicker(tk.toUpperCase(), cfg, spyReturn, providerKeys))
  );

  const records: CandRecord[] = results.map((r, i) =>
    r.status === "fulfilled" ? r.value : { ticker: tickers[i], verdict: "ABORT" as const, score: 0, reason: "SCAN_ERROR" }
  );
  records.sort((a, b) => b.score - a.score);

  let sectorRotation: Record<string, unknown> | null = null;
  if (computeSectors) {
    const { getSectorRotation: getSector } = await import("./sector");
    sectorRotation = await getSector();
  }

  return {
    candidates: records.filter((r) => r.verdict === "GO"),
    hold: records.filter((r) => r.verdict === "HOLD"),
    rejected: records.filter((r) => r.verdict === "ABORT"),
    sectorRotation,
    activeProviders,
  };
}

async function scanTicker(ticker: string, cfg: Record<string, unknown>, spyReturn: number, keys: TenantProviderKeys): Promise<CandRecord> {
  // Fetch all provider data in parallel
  const [tech, polygonData, finnhubData] = await Promise.all([
    getTechnical(ticker),
    keys.polygonKey ? fetchPolygonData(ticker, keys.polygonKey) : Promise.resolve(null),
    keys.finnhubKey ? fetchFinnhubData(ticker, keys.finnhubKey) : Promise.resolve(null),
  ]);

  // Enrich tech data with Polygon or Finnhub real-time price if available
  if (tech.ok) {
    const livePrice = polygonData?.quote?.price ?? finnhubData?.quote?.price ?? null;
    if (livePrice && livePrice > 0) {
      tech.price = livePrice;
      tech.close = livePrice;
    }
    if (polygonData?.quote?.changePct != null) tech.changePct = polygonData.quote.changePct;
    else if (finnhubData?.quote?.changePct != null) tech.changePct = finnhubData.quote.changePct;
  }

  // Build flow data from Yahoo chart (already fetched inside getTechnical)
  const chart = await fetchYahooChart(ticker, "1y").catch(() => null);
  const flow = await getFlow(ticker, spyReturn, chart ?? undefined);

  // Fundamentals: merge Yahoo + Finnhub
  const finnhubResult: FinnhubDataResult | null = finnhubData ? {
    quote: finnhubData.quote ? { price: finnhubData.quote.price, change: finnhubData.quote.change, changePct: finnhubData.quote.changePct } : null,
    earnings: finnhubData.earnings,
    profile: finnhubData.profile,
    sentiment: finnhubData.sentiment,
  } : null;

  const fund = await getFundamentals(ticker, finnhubResult);

  // Options flow from Polygon
  const options: OptionsData = polygonData?.optionsFlow
    ? {
        ok: true,
        putCallRatio: polygonData.optionsFlow.putCallRatio,
        impliedVolatility: polygonData.optionsFlow.impliedVolatility,
        callVolume: polygonData.optionsFlow.totalCallVolume,
        putVolume: polygonData.optionsFlow.totalPutVolume,
        flowScore: polygonData.optionsFlow.flowScore,
        unusualActivity: polygonData.optionsFlow.unusualActivity,
      }
    : { ok: false, putCallRatio: null, impliedVolatility: null, callVolume: null, putVolume: null, flowScore: 0.5, unusualActivity: false };

  // Sentiment: merge Polygon news + Finnhub sentiment
  const sentimentScore = finnhubData?.sentiment?.score ?? null;
  const polygonSentiment = polygonData?.news?.sentiment ?? null;
  const mergedSentimentScore = sentimentScore !== null ? sentimentScore
    : polygonSentiment !== null ? polygonSentiment
    : null;

  const sentiment: SentimentData = {
    ok: sentimentScore !== null || polygonSentiment !== null,
    score: mergedSentimentScore,
    bullishPct: finnhubData?.sentiment?.bullishPct ?? null,
    bearishPct: finnhubData?.sentiment?.bearishPct ?? null,
    buzz: finnhubData?.sentiment?.buzz ?? null,
    articleCount: polygonData?.news?.articleCount ?? 0,
    latestHeadline: polygonData?.news?.headline ?? null,
  };

  const qResult = qualify(tech, fund, flow, cfg);
  let mc: Record<string, unknown> | null = null;
  if (qResult.state !== "ABORT" && tech.ok) {
    mc = monteCarlo(tech, cfg);
  }

  const score = qResult.state === "ABORT" ? 0
    : compositeScore(tech, flow, fund, mc, options.ok ? options : null, sentiment.ok ? sentiment : null, cfg);

  return {
    ticker,
    verdict: qResult.state,
    score: parseFloat(score.toFixed(4)),
    reason: qResult.reason,
    technical: tech,
    flow,
    fundamentals: fund,
    options: options.ok ? options : undefined,
    sentiment: sentiment.ok ? sentiment : undefined,
    monteCarlo: mc ?? undefined,
  };
}
