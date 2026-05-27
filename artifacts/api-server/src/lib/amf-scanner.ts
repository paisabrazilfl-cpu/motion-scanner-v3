/**
 * A.M.F. Scanner — 52-period Range Phase Classifier
 *
 * Low-to-High phases:  DOWNTREND → ACCUMULATION → REVERSAL → BREAKOUT → MOMENTUM_TREND
 * High-to-Low mirror:  BULL_RUN  → DISTRIBUTION → ROLLOVER  → BREAKDOWN → BEAR_TREND
 *
 * All OHLCV data sourced from Yahoo Finance (no API key required).
 * The `period` parameter controls the rolling high/low window (default 252 = 52 weeks).
 */
import { fetchYahooChart } from "./providers";

// ── Config ────────────────────────────────────────────────────────────────────

export interface AmfConfig {
  period: number;
  minHistoryDays: number;
  minPrice: number;
  nearLowPct: number;
  nearHighPct: number;
  breakoutBufferPct: number;
  breakoutVolMult: number;
  accMaxRoc63: number;
  accMaxAtrPct: number;
  reversalMinRoc20: number;
  reversalMinRoc63: number;
  momentumMinRoc63: number;
}

export const DEFAULT_AMF_CONFIG: AmfConfig = {
  period: 252,
  minHistoryDays: 180,
  minPrice: 2.0,
  nearLowPct: 0.15,
  nearHighPct: 0.15,
  breakoutBufferPct: 0.005,
  breakoutVolMult: 1.3,
  accMaxRoc63: 0.12,
  accMaxAtrPct: 0.07,
  reversalMinRoc20: 0.04,
  reversalMinRoc63: 0.08,
  momentumMinRoc63: 0.10,
};

// ── Output types ──────────────────────────────────────────────────────────────

export interface AmfRow {
  ticker: string;
  phase: string;
  score: number;
  mirrorPhase: string;
  mirrorScore: number;
  close: number;
  periodLow: number;
  periodHigh: number;
  rangePosition: number;
  pctFromLow: number;
  pctToHigh: number;
  rsi14: number;
  roc20: number;
  roc63: number;
  relVol20: number;
  reason: string;
  mirrorReason: string;
  error?: string;
}

// ── Rolling helpers ───────────────────────────────────────────────────────────

function rollingMax(arr: number[], period: number): number[] {
  return arr.map((_, i) => {
    const start = Math.max(0, i - period + 1);
    let max = -Infinity;
    for (let j = start; j <= i; j++) if (arr[j] > max) max = arr[j];
    return max;
  });
}

function rollingMin(arr: number[], period: number): number[] {
  return arr.map((_, i) => {
    const start = Math.max(0, i - period + 1);
    let min = Infinity;
    for (let j = start; j <= i; j++) if (arr[j] < min) min = arr[j];
    return min;
  });
}

function rollingMean(arr: number[], period: number): number[] {
  const prefix = [0];
  for (let i = 0; i < arr.length; i++) prefix.push(prefix[i] + arr[i]);
  return arr.map((_, i) => {
    const start = Math.max(0, i - period + 1);
    const count = i - start + 1;
    return (prefix[i + 1] - prefix[start]) / count;
  });
}

function calcRoc(arr: number[], period: number): number[] {
  return arr.map((v, i) => {
    const prev = arr[i - period];
    if (prev == null || prev === 0 || !isFinite(prev)) return NaN;
    return (v - prev) / prev;
  });
}

function calcRsi14(closes: number[]): number[] {
  const result = new Array(closes.length).fill(NaN);
  if (closes.length < 15) return result;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= 14; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain += Math.max(0, d);
    avgLoss += Math.max(0, -d);
  }
  avgGain /= 14;
  avgLoss /= 14;
  const toRsi = (g: number, l: number) => (l === 0 ? 100 : 100 - 100 / (1 + g / l));
  result[14] = toRsi(avgGain, avgLoss);
  for (let i = 15; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * 13 + Math.max(0, d)) / 14;
    avgLoss = (avgLoss * 13 + Math.max(0, -d)) / 14;
    result[i] = toRsi(avgGain, avgLoss);
  }
  return result;
}

function calcAtr14(highs: number[], lows: number[], closes: number[]): number[] {
  const trs = closes.map((_, i) => {
    if (i === 0) return highs[0] - lows[0];
    const prev = closes[i - 1];
    return Math.max(highs[i] - lows[i], Math.abs(highs[i] - prev), Math.abs(lows[i] - prev));
  });
  const result = new Array(closes.length).fill(NaN);
  if (closes.length < 15) return result;
  let atr = trs.slice(1, 15).reduce((a, b) => a + b, 0) / 14;
  result[14] = atr;
  for (let i = 15; i < closes.length; i++) {
    atr = (atr * 13 + trs[i]) / 14;
    result[i] = atr;
  }
  return result;
}

// ── Phase snapshots ───────────────────────────────────────────────────────────

interface Snapshot {
  close: number;
  periodHigh: number;
  periodLow: number;
  rangePosition: number;
  pctFromLow: number;
  pctToHigh: number;
  sma20: number;
  sma50: number;
  sma200: number;
  sma50Slope: number;
  sma200Slope: number;
  roc20: number;
  roc63: number;
  roc126: number;
  atrPct: number;
  rsi14: number;
  relVol20: number;
  volMultiple: number;
  resistance60d: number;
  resistance90d: number;
  support60d: number;
  support90d: number;
  historyDays: number;
  aboveSma20: boolean;
  aboveSma50: boolean;
  aboveSma200: boolean;
  bullStack: boolean;
  bearStack: boolean;
  higherHigh20d: boolean;
  lowerLow20d: boolean;
}

function score(conditions: boolean[]): number {
  const pts = 100 / conditions.length;
  return conditions.reduce((acc, c) => acc + (c ? pts : 0), 0);
}

// ── Low-to-High classifier ────────────────────────────────────────────────────

function classifyLowToHigh(
  s: Snapshot,
  cfg: AmfConfig,
): { phase: string; score: number; reason: string } {
  const ok = (x: number) => isFinite(x) && !isNaN(x);

  if (s.historyDays < cfg.minHistoryDays) {
    return { phase: "INSUFFICIENT_DATA", score: 0, reason: "Not enough history." };
  }
  if (s.close < cfg.minPrice) {
    return { phase: "FILTERED", score: 0, reason: `Price below $${cfg.minPrice}.` };
  }
  if (!ok(s.rangePosition)) {
    return { phase: "NO_SETUP", score: 0, reason: "Range unavailable." };
  }

  const resistanceLevel = Math.max(
    ok(s.resistance60d) && s.resistance60d > 0 ? s.resistance60d : -Infinity,
    ok(s.resistance90d) && s.resistance90d > 0 ? s.resistance90d : -Infinity,
  );
  const brokResistance =
    isFinite(resistanceLevel) &&
    s.close > resistanceLevel * (1 + cfg.breakoutBufferPct);

  const scores: Record<string, number> = {
    MOMENTUM_TREND: score([
      ok(s.pctToHigh) && s.pctToHigh <= cfg.nearHighPct,
      s.rangePosition >= 0.75,
      s.bullStack,
      s.aboveSma20 && s.aboveSma50 && s.aboveSma200,
      ok(s.roc63) && s.roc63 >= cfg.momentumMinRoc63,
      ok(s.sma50Slope) && s.sma50Slope > 0,
    ]),
    BREAKOUT: score([
      brokResistance,
      ok(s.volMultiple) && s.volMultiple >= cfg.breakoutVolMult,
      s.aboveSma50,
      ok(s.roc20) && s.roc20 > 0,
      s.rangePosition >= 0.35 && s.rangePosition <= 0.90,
      ok(s.rsi14) && s.rsi14 >= 50,
    ]),
    REVERSAL: score([
      s.rangePosition >= 0.20 && s.rangePosition <= 0.65,
      s.aboveSma50,
      ok(s.roc20) && s.roc20 >= cfg.reversalMinRoc20,
      ok(s.roc63) && s.roc63 >= cfg.reversalMinRoc63,
      s.higherHigh20d,
      ok(s.rsi14) && s.rsi14 >= 50,
    ]),
    ACCUMULATION: score([
      ok(s.pctFromLow) && s.pctFromLow <= cfg.nearLowPct,
      s.rangePosition <= 0.30,
      ok(s.roc63) && Math.abs(s.roc63) <= cfg.accMaxRoc63,
      ok(s.atrPct) && s.atrPct <= cfg.accMaxAtrPct,
      !s.bearStack || s.aboveSma20,
    ]),
    DOWNTREND: score([
      s.rangePosition <= 0.35,
      s.bearStack || (!s.aboveSma50 && !s.aboveSma200),
      ok(s.roc63) && s.roc63 < 0,
      ok(s.roc126) && s.roc126 < 0,
      ok(s.sma50Slope) && s.sma50Slope < 0,
      ok(s.sma200Slope) && s.sma200Slope <= 0,
    ]),
  };

  const phase = Object.keys(scores).reduce((a, b) => (scores[a] > scores[b] ? a : b));
  const phaseScore = Math.round(scores[phase] * 10) / 10;
  if (phaseScore < 60) {
    return { phase: "NO_SETUP", score: phaseScore, reason: "No phase reached 60% confidence." };
  }

  const parts: string[] = [];
  if (ok(s.pctFromLow)) parts.push(`${(s.pctFromLow * 100).toFixed(1)}% above ${cfg.period}d low`);
  if (ok(s.pctToHigh)) parts.push(`${(s.pctToHigh * 100).toFixed(1)}% below ${cfg.period}d high`);
  parts.push(`pos ${s.rangePosition.toFixed(2)}`);
  if (ok(s.roc63)) parts.push(`ROC63 ${(s.roc63 * 100).toFixed(1)}%`);
  if (ok(s.relVol20)) parts.push(`rvol ${s.relVol20.toFixed(2)}x`);

  return { phase, score: phaseScore, reason: parts.join(" · ") };
}

// ── High-to-Low mirror classifier ─────────────────────────────────────────────

function classifyHighToLow(
  s: Snapshot,
  cfg: AmfConfig,
): { phase: string; score: number; reason: string } {
  const ok = (x: number) => isFinite(x) && !isNaN(x);

  if (s.historyDays < cfg.minHistoryDays) {
    return { phase: "INSUFFICIENT_DATA", score: 0, reason: "Not enough history." };
  }
  if (s.close < cfg.minPrice) {
    return { phase: "FILTERED", score: 0, reason: `Price below $${cfg.minPrice}.` };
  }
  if (!ok(s.rangePosition)) {
    return { phase: "NO_SETUP", score: 0, reason: "Range unavailable." };
  }

  const supportLevel = Math.min(
    ok(s.support60d) && s.support60d > 0 ? s.support60d : Infinity,
    ok(s.support90d) && s.support90d > 0 ? s.support90d : Infinity,
  );
  const brokSupport =
    isFinite(supportLevel) &&
    s.close < supportLevel * (1 - cfg.breakoutBufferPct);

  const scores: Record<string, number> = {
    BEAR_TREND: score([
      ok(s.pctFromLow) && s.pctFromLow <= cfg.nearLowPct,
      s.rangePosition <= 0.25,
      s.bearStack,
      !s.aboveSma20 && !s.aboveSma50 && !s.aboveSma200,
      ok(s.roc63) && s.roc63 <= -cfg.momentumMinRoc63,
      ok(s.sma50Slope) && s.sma50Slope < 0,
    ]),
    BREAKDOWN: score([
      brokSupport,
      ok(s.volMultiple) && s.volMultiple >= cfg.breakoutVolMult,
      !s.aboveSma50,
      ok(s.roc20) && s.roc20 < 0,
      s.rangePosition >= 0.10 && s.rangePosition <= 0.65,
      ok(s.rsi14) && s.rsi14 <= 50,
    ]),
    ROLLOVER: score([
      s.rangePosition >= 0.35 && s.rangePosition <= 0.80,
      !s.aboveSma50,
      ok(s.roc20) && s.roc20 <= -cfg.reversalMinRoc20,
      ok(s.roc63) && s.roc63 <= -cfg.reversalMinRoc63,
      s.lowerLow20d,
      ok(s.rsi14) && s.rsi14 <= 50,
    ]),
    DISTRIBUTION: score([
      ok(s.pctToHigh) && s.pctToHigh <= cfg.nearHighPct,
      s.rangePosition >= 0.70,
      ok(s.roc63) && Math.abs(s.roc63) <= cfg.accMaxRoc63,
      ok(s.atrPct) && s.atrPct <= cfg.accMaxAtrPct,
      !s.bullStack || !s.aboveSma20,
    ]),
    BULL_RUN: score([
      s.rangePosition >= 0.65,
      s.bullStack || (s.aboveSma50 && s.aboveSma200),
      ok(s.roc63) && s.roc63 > 0,
      ok(s.roc126) && s.roc126 > 0,
      ok(s.sma50Slope) && s.sma50Slope > 0,
      ok(s.sma200Slope) && s.sma200Slope > 0,
    ]),
  };

  const phase = Object.keys(scores).reduce((a, b) => (scores[a] > scores[b] ? a : b));
  const phaseScore = Math.round(scores[phase] * 10) / 10;
  if (phaseScore < 60) {
    return { phase: "NO_SETUP", score: phaseScore, reason: "No phase reached 60% confidence." };
  }

  const parts: string[] = [];
  if (ok(s.pctToHigh)) parts.push(`${(s.pctToHigh * 100).toFixed(1)}% below ${cfg.period}d high`);
  if (ok(s.pctFromLow)) parts.push(`${(s.pctFromLow * 100).toFixed(1)}% above ${cfg.period}d low`);
  parts.push(`pos ${s.rangePosition.toFixed(2)}`);
  if (ok(s.roc63)) parts.push(`ROC63 ${(s.roc63 * 100).toFixed(1)}%`);

  return { phase, score: phaseScore, reason: parts.join(" · ") };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runAmfScan(tickers: string[], cfg: AmfConfig): Promise<AmfRow[]> {
  const range = cfg.period <= 252 ? "2y" : "5y";

  const settled = await Promise.allSettled(
    tickers.map(async (rawTicker): Promise<AmfRow> => {
      const ticker = rawTicker.toUpperCase().trim();
      const raw = await fetchYahooChart(ticker, range);

      if (!raw || raw.closes.length < 60) {
        return {
          ticker, phase: "NO_DATA", score: 0, mirrorPhase: "NO_DATA", mirrorScore: 0,
          close: 0, periodLow: 0, periodHigh: 0, rangePosition: 0,
          pctFromLow: 0, pctToHigh: 0, rsi14: 0, roc20: 0, roc63: 0, relVol20: 0,
          reason: "No Yahoo Finance data.",
          mirrorReason: "No Yahoo Finance data.",
          error: "Insufficient OHLCV data returned.",
        };
      }

      const { closes, highs, lows, volumes } = raw;
      const n = closes.length;
      const last = n - 1;

      const periodHighArr = rollingMax(highs, cfg.period);
      const periodLowArr = rollingMin(lows, cfg.period);
      const sma20Arr = rollingMean(closes, 20);
      const sma50Arr = rollingMean(closes, 50);
      const sma200Arr = rollingMean(closes, 200);
      const roc20Arr = calcRoc(closes, 20);
      const roc63Arr = calcRoc(closes, 63);
      const roc126Arr = calcRoc(closes, 126);
      const rsiArr = calcRsi14(closes);
      const atr14Arr = calcAtr14(highs, lows, closes);
      const vol20Arr = rollingMean(volumes, 20);

      // Resistance (prior rolling max, shifted 1 bar to avoid look-ahead)
      const resistance = (period: number) =>
        highs.map((_, i) => {
          if (i < 1) return NaN;
          const start = Math.max(0, i - period);
          let max = -Infinity;
          for (let j = start; j < i; j++) if (highs[j] > max) max = highs[j];
          return max;
        });

      // Support (prior rolling min, shifted 1 bar)
      const support = (period: number) =>
        lows.map((_, i) => {
          if (i < 1) return NaN;
          const start = Math.max(0, i - period);
          let min = Infinity;
          for (let j = start; j < i; j++) if (lows[j] < min) min = lows[j];
          return min;
        });

      const res60 = resistance(60);
      const res90 = resistance(90);
      const sup60 = support(60);
      const sup90 = support(90);

      const sma50Slope =
        last >= 20 && isFinite(sma50Arr[last - 20]) && sma50Arr[last - 20] > 0
          ? (sma50Arr[last] - sma50Arr[last - 20]) / sma50Arr[last - 20]
          : NaN;
      const sma200Slope =
        last >= 20 && isFinite(sma200Arr[last - 20]) && sma200Arr[last - 20] > 0
          ? (sma200Arr[last] - sma200Arr[last - 20]) / sma200Arr[last - 20]
          : NaN;

      const high20d = (() => {
        if (last < 1) return NaN;
        const start = Math.max(0, last - 20);
        let max = -Infinity;
        for (let j = start; j < last; j++) if (closes[j] > max) max = closes[j];
        return max;
      })();
      const low20d = (() => {
        if (last < 1) return NaN;
        const start = Math.max(0, last - 20);
        let min = Infinity;
        for (let j = start; j < last; j++) if (closes[j] < min) min = closes[j];
        return min;
      })();

      const close = closes[last];
      const pHigh = periodHighArr[last];
      const pLow = periodLowArr[last];
      const rng = pHigh - pLow;
      const rangePosition = rng > 0 ? (close - pLow) / rng : NaN;
      const pctFromLow = pLow > 0 ? (close - pLow) / pLow : NaN;
      const pctToHigh = pHigh > 0 ? (pHigh - close) / close : NaN;
      const atrPct = close > 0 ? atr14Arr[last] / close : NaN;
      const relVol = vol20Arr[last] > 0 ? volumes[last] / vol20Arr[last] : NaN;

      const snap: Snapshot = {
        close,
        periodHigh: pHigh,
        periodLow: pLow,
        rangePosition,
        pctFromLow,
        pctToHigh,
        sma20: sma20Arr[last],
        sma50: sma50Arr[last],
        sma200: sma200Arr[last],
        sma50Slope,
        sma200Slope,
        roc20: roc20Arr[last],
        roc63: roc63Arr[last],
        roc126: roc126Arr[last],
        atrPct,
        rsi14: rsiArr[last],
        relVol20: relVol,
        volMultiple: relVol,
        resistance60d: res60[last],
        resistance90d: res90[last],
        support60d: sup60[last],
        support90d: sup90[last],
        historyDays: n,
        aboveSma20: close > sma20Arr[last],
        aboveSma50: close > sma50Arr[last],
        aboveSma200: close > sma200Arr[last],
        bullStack: sma20Arr[last] > sma50Arr[last] && sma50Arr[last] > sma200Arr[last],
        bearStack: sma20Arr[last] < sma50Arr[last] && sma50Arr[last] < sma200Arr[last],
        higherHigh20d: isFinite(high20d) && close > high20d,
        lowerLow20d: isFinite(low20d) && close < low20d,
      };

      const lth = classifyLowToHigh(snap, cfg);
      const htl = classifyHighToLow(snap, cfg);

      const r2 = (v: number) => (isFinite(v) ? Math.round(v * 100) / 100 : 0);
      const r3 = (v: number) => (isFinite(v) ? Math.round(v * 1000) / 1000 : 0);

      return {
        ticker,
        phase: lth.phase,
        score: lth.score,
        mirrorPhase: htl.phase,
        mirrorScore: htl.score,
        close: r2(close),
        periodLow: r2(pLow),
        periodHigh: r2(pHigh),
        rangePosition: r3(rangePosition),
        pctFromLow: r3(pctFromLow),
        pctToHigh: r3(pctToHigh),
        rsi14: isFinite(rsiArr[last]) ? Math.round(rsiArr[last] * 10) / 10 : 0,
        roc20: r3(roc20Arr[last]),
        roc63: r3(roc63Arr[last]),
        relVol20: r2(relVol),
        reason: lth.reason,
        mirrorReason: htl.reason,
      };
    }),
  );

  return settled.map((r, i) => {
    if (r.status === "rejected") {
      return {
        ticker: tickers[i].toUpperCase().trim(),
        phase: "ERROR", score: 0, mirrorPhase: "ERROR", mirrorScore: 0,
        close: 0, periodLow: 0, periodHigh: 0, rangePosition: 0,
        pctFromLow: 0, pctToHigh: 0, rsi14: 0, roc20: 0, roc63: 0, relVol20: 0,
        reason: "Scan error.",
        mirrorReason: "Scan error.",
        error: String(r.reason),
      };
    }
    return r.value;
  });
}
