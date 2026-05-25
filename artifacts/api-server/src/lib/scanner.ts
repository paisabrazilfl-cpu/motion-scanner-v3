/**
 * Motion Scanner v3.0 — TypeScript port of the Python engine.
 * Uses Yahoo Finance (yfinance-compatible) public API endpoints.
 */
import axios from "axios";

// ── Default config ───────────────────────────────────────────────────────────
export const DEFAULT_CONFIG: Record<string, unknown> = {
  universe: { price_min: 1.0, price_max: 500.0, market_cap_min: 50_000_000, adv_min: 500_000 },
  technical: { rvol_min: 2.0, atr_pct_min: 0.03, ema_stack_required: true, rsi_band: [40, 80] },
  fundamental: { earnings_blackout_days: 2 },
  flow_motion: { dollar_volume_min: 5_000_000 },
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
  monte_carlo: { simulations: 1000, holding_days: 5, target_R: 2.0 },
  scoring_weights: { technical: 0.20, flow: 0.15, fundamental: 0.10, monte_carlo: 0.25, indicators: 0.15, options: 0.10, sector: 0.05 },
  notifications: { enabled: false, notify_on: "GO" },
};

// ── Types ────────────────────────────────────────────────────────────────────
export interface TechData { ok: boolean; close: number; high: number; low: number; open: number; volume: number; rvol: number; atr: number; atr_pct: number; ema9: number; ema21: number; ema50: number; ema200: number; ema_stack_ok: boolean; rsi: number; breakout: boolean; dollar_volume: number; }
export interface FlowData { ok: boolean; dollar_volume: number; rel_strength_spy: number; news_velocity: number; }
export interface FundData { ok: boolean; days_to_earnings: number | null; short_interest: number | null; float: number | null; }
export interface TriState { state: "GO" | "HOLD" | "ABORT"; reason: string; }

// ── Yahoo Finance fetch ──────────────────────────────────────────────────────
async function fetchYahooQuote(ticker: string): Promise<Record<string, unknown> | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1y&includePrePost=false`;
    const { data } = await axios.get(url, { timeout: 15000, headers: { "User-Agent": "Mozilla/5.0" } });
    return data?.chart?.result?.[0] ?? null;
  } catch { return null; }
}

async function fetchSpyReturn(): Promise<number> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=5d`;
    const { data } = await axios.get(url, { timeout: 10000, headers: { "User-Agent": "Mozilla/5.0" } });
    const result = data?.chart?.result?.[0];
    const closes = result?.indicators?.quote?.[0]?.close?.filter((v: unknown) => v != null) as number[] | undefined;
    if (!closes || closes.length < 2) return 0;
    return (closes[closes.length - 1] - closes[closes.length - 5 < 0 ? 0 : closes.length - 5]) / closes[closes.length - 5 < 0 ? 0 : closes.length - 5];
  } catch { return 0; }
}

// ── EMA ──────────────────────────────────────────────────────────────────────
function ema(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  const k = 2 / (period + 1);
  let e = prices[0];
  for (let i = 1; i < prices.length; i++) e = prices[i] * k + e * (1 - k);
  return e;
}

// ── RSI ───────────────────────────────────────────────────────────────────────
function rsi(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

// ── ATR ───────────────────────────────────────────────────────────────────────
function atr(highs: number[], lows: number[], closes: number[], period = 14): number {
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / Math.max(slice.length, 1);
}

// ── RVOL ──────────────────────────────────────────────────────────────────────
function rvol(volumes: number[], period = 20): number {
  if (volumes.length < 2) return 1;
  const recent = volumes[volumes.length - 1];
  const avg = volumes.slice(-period - 1, -1).reduce((a, b) => a + b, 0) / Math.max(period, 1);
  return avg > 0 ? recent / avg : 1;
}

// ── Breakout ──────────────────────────────────────────────────────────────────
function isBreakout(closes: number[], period = 20): boolean {
  if (closes.length < period + 1) return false;
  const recent = closes[closes.length - 1];
  const high20 = Math.max(...closes.slice(-period - 1, -1));
  return recent > high20;
}

// ── Technical data ────────────────────────────────────────────────────────────
export async function getTechnical(ticker: string): Promise<TechData> {
  const result = await fetchYahooQuote(ticker);
  if (!result) return { ok: false } as unknown as TechData;
  try {
    const q = (result as any).indicators?.quote?.[0] ?? {};
    const closes: number[] = (q.close as (number | null)[])?.filter((v) => v != null) as number[] ?? [];
    const highs: number[] = (q.high as (number | null)[])?.filter((v) => v != null) as number[] ?? [];
    const lows: number[] = (q.low as (number | null)[])?.filter((v) => v != null) as number[] ?? [];
    const volumes: number[] = (q.volume as (number | null)[])?.filter((v) => v != null) as number[] ?? [];
    if (closes.length < 20) return { ok: false } as unknown as TechData;

    const close = closes[closes.length - 1];
    const high = highs[highs.length - 1];
    const low = lows[lows.length - 1];
    const open = (q.open as number[])?.[q.open?.length - 1] ?? close;
    const volume = volumes[volumes.length - 1];
    const e9 = ema(closes, 9), e21 = ema(closes, 21), e50 = ema(closes, 50), e200 = ema(closes, 200);
    const atrVal = atr(highs, lows, closes);
    const rvolVal = rvol(volumes);
    const rsiVal = rsi(closes);
    const dolVol = close * volume;

    return {
      ok: true, close, high, low, open, volume,
      rvol: rvolVal, atr: atrVal, atr_pct: atrVal / close,
      ema9: e9, ema21: e21, ema50: e50, ema200: e200,
      ema_stack_ok: close > e9 && e9 > e21 && e21 > e50 && e50 > e200,
      rsi: rsiVal, breakout: isBreakout(closes),
      dollar_volume: dolVol,
    };
  } catch { return { ok: false } as unknown as TechData; }
}

// ── Flow data ─────────────────────────────────────────────────────────────────
export async function getFlow(ticker: string, spyReturn: number): Promise<FlowData> {
  try {
    const result = await fetchYahooQuote(ticker);
    if (!result) return { ok: false } as unknown as FlowData;
    const q = (result as any).indicators?.quote?.[0] ?? {};
    const closes: number[] = (q.close as (number | null)[])?.filter((v) => v != null) as number[] ?? [];
    const volumes: number[] = (q.volume as (number | null)[])?.filter((v) => v != null) as number[] ?? [];
    if (closes.length < 5 || volumes.length < 5) return { ok: false } as unknown as FlowData;
    const close = closes[closes.length - 1];
    const volume = volumes[volumes.length - 1];
    const dolVol = close * volume;
    const ret5 = (closes[closes.length - 1] - closes[closes.length - 6 < 0 ? 0 : closes.length - 6]) / (closes[closes.length - 6 < 0 ? 0 : closes.length - 6] || 1);
    const relStrength = ret5 - spyReturn;
    return { ok: true, dollar_volume: dolVol, rel_strength_spy: relStrength, news_velocity: 0.5 };
  } catch { return { ok: false } as unknown as FlowData; }
}

// ── Fundamental data ──────────────────────────────────────────────────────────
export async function getFundamentals(ticker: string): Promise<FundData> {
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=defaultKeyStatistics,calendarEvents`;
    const { data } = await axios.get(url, { timeout: 12000, headers: { "User-Agent": "Mozilla/5.0" } });
    const ks = data?.quoteSummary?.result?.[0]?.defaultKeyStatistics ?? {};
    const cal = data?.quoteSummary?.result?.[0]?.calendarEvents ?? {};
    const earningsDate = cal?.earnings?.earningsDate?.[0]?.raw;
    let daysToEarnings: number | null = null;
    if (earningsDate) {
      const diff = (earningsDate * 1000 - Date.now()) / 86400000;
      daysToEarnings = Math.round(diff);
    }
    return {
      ok: true,
      days_to_earnings: daysToEarnings,
      short_interest: ks.shortPercentOfFloat?.raw ?? null,
      float: ks.floatShares?.raw ?? null,
    };
  } catch { return { ok: true, days_to_earnings: null, short_interest: null, float: null }; }
}

// ── Qualification engine ──────────────────────────────────────────────────────
export function qualify(tech: TechData, fund: FundData, flow: FlowData, cfg: Record<string, unknown>): TriState {
  if (!tech?.ok) return { state: "ABORT", reason: "NO_TECHNICAL_DATA" };
  if (!flow?.ok) return { state: "ABORT", reason: "NO_FLOW_DATA" };

  if (fund?.ok) {
    const blackout = (cfg.fundamental as any)?.earnings_blackout_days ?? 2;
    const dte = fund.days_to_earnings;
    if (dte !== null && dte >= 0 && dte <= blackout) return { state: "ABORT", reason: `EARNINGS_BLACKOUT_${dte}D` };
  }

  const uni = cfg.universe as any ?? {};
  if (tech.close < (uni.price_min ?? 1)) return { state: "ABORT", reason: "PRICE_BELOW_FLOOR" };
  if (tech.close > (uni.price_max ?? 500)) return { state: "ABORT", reason: "PRICE_ABOVE_CEILING" };
  if (flow.dollar_volume < ((cfg.flow_motion as any)?.dollar_volume_min ?? 5_000_000)) return { state: "ABORT", reason: "DOLLAR_VOL_TOO_LOW" };

  const tcfg = cfg.technical as any ?? {};
  if (tech.rvol < (tcfg.rvol_min ?? 2)) return { state: "HOLD", reason: "RVOL_BELOW_MIN" };
  if (tech.atr_pct < (tcfg.atr_pct_min ?? 0.03)) return { state: "HOLD", reason: "ATR_BELOW_MIN" };
  if ((tcfg.ema_stack_required ?? true) && !tech.ema_stack_ok) return { state: "HOLD", reason: "EMA_STACK_BROKEN" };

  const [rsiLo, rsiHi] = (tcfg.rsi_band as [number, number]) ?? [40, 80];
  if (tech.rsi < rsiLo || tech.rsi > rsiHi) return { state: "HOLD", reason: `RSI_OUT_OF_BAND_${tech.rsi.toFixed(1)}` };

  return { state: "GO", reason: "ALL_GATES_PASS" };
}

// ── Monte Carlo ────────────────────────────────────────────────────────────────
export function monteCarlo(tech: TechData, cfg: Record<string, unknown>): Record<string, unknown> {
  const mcCfg = cfg.monte_carlo as any ?? {};
  const sims = Math.min(mcCfg.simulations ?? 500, 500);
  const days = mcCfg.holding_days ?? 5;
  const targetR = mcCfg.target_R ?? 2;
  const vol = tech.atr_pct;
  const drift = 0.0005;
  const entry = tech.close;
  const stop = entry * (1 - tech.atr_pct * 1.5);
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
    entry_price: entry, stop_price: stop, target_price: target,
    win_rate: wins / sims, expected_R: Math.max(0, expectedR),
    p10: finalPrices[Math.floor(finalPrices.length * 0.1)],
    p50: finalPrices[Math.floor(finalPrices.length * 0.5)],
    p90: finalPrices[Math.floor(finalPrices.length * 0.9)],
  };
}

// ── Composite score ────────────────────────────────────────────────────────────
export function compositeScore(
  tech: TechData, flow: FlowData, fund: FundData,
  mc: Record<string, unknown> | null, cfg: Record<string, unknown>
): number {
  const w = cfg.scoring_weights as any ?? {};

  const tScore = tech?.ok ? (
    Math.min(1, tech.rvol / 5) * 0.35 +
    Math.min(1, tech.atr_pct / 0.10) * 0.25 +
    (tech.ema_stack_ok ? 1 : 0) * 0.20 +
    (tech.breakout ? 1 : 0) * 0.20
  ) : 0;

  const fScore = flow?.ok ? (
    Math.min(1, flow.dollar_volume / 50_000_000) * 0.5 +
    Math.min(1, Math.max(0, flow.rel_strength_spy) / 3) * 0.3 +
    Math.min(1, flow.news_velocity) * 0.2
  ) : 0;

  const fuScore = fund?.ok ? (
    Math.min(1, (fund.short_interest ?? 0) / 0.3) * 0.5 +
    (fund.float ? 0.5 : 0)
  ) : 0;

  const mcScore = mc ? Math.max(0, Math.min(1, (mc.expected_R as number) / 1.0)) : 0;

  const wT = parseFloat(w.technical ?? 0.20);
  const wF = parseFloat(w.flow ?? 0.15);
  const wFu = parseFloat(w.fundamental ?? 0.10);
  const wMc = parseFloat(w.monte_carlo ?? 0.25);
  const wInd = parseFloat(w.indicators ?? 0.15);
  const wOpt = parseFloat(w.options ?? 0.10);
  const wSect = parseFloat(w.sector ?? 0.05);
  const base = wT + wF + wFu + wMc;
  const overhead = wInd + wOpt + wSect;
  const scale = base > 0 ? Math.max(0, 1 - overhead) / base : 0;

  const raw = wT * scale * tScore + wF * scale * fScore + wFu * scale * fuScore + wMc * scale * mcScore;
  return Math.max(0, Math.min(1, raw));
}

// ── Sector rotation ────────────────────────────────────────────────────────────
const SECTOR_ETFS: Record<string, string> = {
  XLK: "Technology", XLY: "Consumer Discretionary", XLC: "Communication Services",
  XLF: "Financials", XLV: "Healthcare", XLI: "Industrials",
  XLP: "Consumer Staples", XLU: "Utilities", XLE: "Energy",
  XLB: "Materials", XLRE: "Real Estate",
};

async function fetchReturn(symbol: string, days: 1 | 5 | 20): Promise<number | null> {
  try {
    const range = days <= 5 ? "1mo" : "3mo";
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=${range}`;
    const { data } = await axios.get(url, { timeout: 12000, headers: { "User-Agent": "Mozilla/5.0" } });
    const closes: number[] = ((data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close as (number | null)[]) ?? []).filter((v) => v != null) as number[];
    if (closes.length < days + 1) return null;
    const prev = closes[closes.length - days - 1];
    return (closes[closes.length - 1] - prev) / prev;
  } catch { return null; }
}

export async function getSectorRotation(): Promise<Record<string, unknown>> {
  try {
    const tickers = [...Object.keys(SECTOR_ETFS), "SPY"];
    const [ret1d, ret5d, ret20d] = await Promise.all([
      Promise.all(tickers.map((t) => fetchReturn(t, 1))),
      Promise.all(tickers.map((t) => fetchReturn(t, 5))),
      Promise.all(tickers.map((t) => fetchReturn(t, 20))),
    ]);

    const spyIdx = tickers.indexOf("SPY");
    const spyR1 = ret1d[spyIdx] ?? 0;
    const spyR5 = ret5d[spyIdx] ?? 0;
    const spyR20 = ret20d[spyIdx] ?? 0;

    const sectors = Object.entries(SECTOR_ETFS).map(([etf, name], i) => {
      const r1 = ret1d[i] ?? 0, r5 = ret5d[i] ?? 0, r20 = ret20d[i] ?? 0;
      const rs1 = r1 - spyR1, rs5 = r5 - spyR5, rs20 = r20 - spyR20;
      return {
        etf, name,
        ret1d: parseFloat((r1 * 100).toFixed(2)), ret5d: parseFloat((r5 * 100).toFixed(2)), ret20d: parseFloat((r20 * 100).toFixed(2)),
        rs1d: parseFloat((rs1 * 100).toFixed(2)), rs5d: parseFloat((rs5 * 100).toFixed(2)), rs20d: parseFloat((rs20 * 100).toFixed(2)),
        leader: rs5 > 0 && rs20 > 0, laggard: rs5 < 0 && rs20 < 0,
      };
    }).sort((a, b) => b.rs5d - a.rs5d);

    const cyclical = ["XLK", "XLY", "XLC", "XLF", "XLI"];
    const defensive = ["XLP", "XLU", "XLV", "XLRE"];
    const cycRs = sectors.filter((s) => cyclical.includes(s.etf)).reduce((a, b, _, arr) => a + b.rs5d / arr.length, 0);
    const defRs = sectors.filter((s) => defensive.includes(s.etf)).reduce((a, b, _, arr) => a + b.rs5d / arr.length, 0);
    const regime = cycRs > defRs + 0.3 ? "RISK_ON" : defRs > cycRs + 0.3 ? "RISK_OFF" : "NEUTRAL";

    return {
      ok: true, regime,
      cyclicalRs: parseFloat(cycRs.toFixed(2)), defensiveRs: parseFloat(defRs.toFixed(2)),
      sectors, leaders: sectors.filter((s) => s.leader).slice(0, 3),
      laggards: sectors.filter((s) => s.laggard).slice(-3),
      spyReturns: { ret1d: spyR1, ret5d: spyR5, ret20d: spyR20 },
    };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

// ── Main scan function ────────────────────────────────────────────────────────
export async function runScan(
  tickers: string[],
  cfg: Record<string, unknown>,
  computeSectors: boolean
): Promise<{ candidates: CandRecord[]; hold: CandRecord[]; rejected: CandRecord[]; sectorRotation: Record<string, unknown> | null; activeProviders: string[] }> {
  const [spyReturn, sectorRotation] = await Promise.all([
    fetchSpyReturn(),
    computeSectors ? getSectorRotation() : Promise.resolve(null),
  ]);

  const results = await Promise.allSettled(
    tickers.map((tk) => scanTicker(tk.toUpperCase(), cfg, spyReturn))
  );

  const records: CandRecord[] = results.map((r, i) =>
    r.status === "fulfilled" ? r.value : { ticker: tickers[i], verdict: "ABORT" as const, score: 0, reason: "SCAN_ERROR" }
  );
  records.sort((a, b) => b.score - a.score);

  return {
    candidates: records.filter((r) => r.verdict === "GO"),
    hold: records.filter((r) => r.verdict === "HOLD"),
    rejected: records.filter((r) => r.verdict === "ABORT"),
    sectorRotation,
    activeProviders: ["yahoo_finance"],
  };
}

interface CandRecord {
  ticker: string;
  verdict: "GO" | "HOLD" | "ABORT";
  score: number;
  reason: string;
  technical?: TechData;
  flow?: FlowData;
  fundamentals?: FundData;
  monteCarlo?: Record<string, unknown>;
  [key: string]: unknown;
}

async function scanTicker(ticker: string, cfg: Record<string, unknown>, spyReturn: number): Promise<CandRecord> {
  const [tech, fund, flow] = await Promise.all([
    getTechnical(ticker),
    getFundamentals(ticker),
    getFlow(ticker, spyReturn),
  ]);

  const qResult = qualify(tech, fund, flow, cfg);
  let mc: Record<string, unknown> | null = null;
  if (qResult.state === "GO" && tech.ok) {
    mc = monteCarlo(tech, cfg);
  }

  const score = qResult.state === "ABORT" ? 0 : compositeScore(tech, flow, fund, mc, cfg);

  return {
    ticker,
    verdict: qResult.state,
    score: parseFloat(score.toFixed(4)),
    reason: qResult.reason,
    technical: tech,
    flow,
    fundamentals: fund,
    monteCarlo: mc ?? undefined,
  };
}
