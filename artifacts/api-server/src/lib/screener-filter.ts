// Shared screener filtering used by both the live /screener route and the
// full-market background scan-job results endpoint, so filter semantics stay
// identical across both surfaces.

export interface ScreenerFilterParams {
  priceMin: number;
  priceMax: number;
  rsiMin: number;
  rsiMax: number;
  adxMin: number;
  rvolMin: number;
  scoreMin: number;
  stochMin: number | null;
  stochMax: number | null;
  verdictFilter: string;
  aboveEma10: boolean;
  aboveSma20: boolean;
  emaStackRequired: boolean;
  macd3mAboveZero: boolean;
  macd3mHistPositive: boolean;
  breakoutOnly: boolean;
}

type Q = Record<string, string | undefined>;

export function parseScreenerQuery(q: Q): ScreenerFilterParams {
  return {
    priceMin: parseFloat(q.priceMin ?? "1"),
    priceMax: parseFloat(q.priceMax ?? "10000"),
    rsiMin: parseFloat(q.rsiMin ?? "0"),
    rsiMax: parseFloat(q.rsiMax ?? "100"),
    adxMin: parseFloat(q.adxMin ?? "0"),
    rvolMin: parseFloat(q.rvolMin ?? "0"),
    scoreMin: parseFloat(q.scoreMin ?? "0"),
    stochMin: q.stochMin != null ? parseFloat(q.stochMin) : null,
    stochMax: q.stochMax != null ? parseFloat(q.stochMax) : null,
    verdictFilter: q.verdictFilter ?? "all",
    aboveEma10: q.aboveEma10 === "true",
    aboveSma20: q.aboveSma20 === "true",
    emaStackRequired: q.emaStackRequired === "true",
    macd3mAboveZero: q.macd3mAboveZero === "true",
    macd3mHistPositive: q.macd3mHistPositive === "true",
    breakoutOnly: q.breakoutOnly === "true",
  };
}

interface AnyRec {
  verdict: string;
  score: number;
  reason?: string;
  technical?: Record<string, unknown> | null;
}

/** Keep only records with a valid Yahoo Finance OHLCV dataset (Tier-1 gate). */
export function tier1Gate<T extends AnyRec>(records: T[]): T[] {
  return records.filter((c) => {
    const tech = (c.technical ?? {}) as Record<string, unknown>;
    return tech.ok === true && c.reason !== "SCAN_ERROR";
  });
}

/** Apply user filters and sort by score descending. */
export function applyScreenerFilters<T extends AnyRec>(records: T[], p: ScreenerFilterParams): T[] {
  const filtered = records.filter((c) => {
    const tech = (c.technical ?? {}) as Record<string, unknown>;
    const price = tech.price as number | undefined;
    const rsi = tech.rsi as number | undefined;
    const adx = tech.adx as number | undefined;
    const rvol = tech.rvol as number | undefined;
    const ema10 = tech.ema10 as number | undefined;
    const sma20 = tech.sma20 as number | undefined;
    const stochSlowK = tech.stochSlowK as number | undefined;
    const macd3mLine = tech.macd3m as number | undefined;
    const macd3mHist = tech.macd3mHist as number | undefined;
    const emaStackOk = Boolean(tech.ema_stack_ok);
    const breakout = Boolean(tech.breakout);

    if (price != null && (price < p.priceMin || price > p.priceMax)) return false;
    if (rsi != null && (rsi < p.rsiMin || rsi > p.rsiMax)) return false;
    if (adx != null && adx < p.adxMin) return false;
    if (rvol != null && rvol < p.rvolMin) return false;
    if (c.score < p.scoreMin) return false;

    if (p.verdictFilter === "go" && c.verdict !== "GO") return false;
    if (p.verdictFilter === "go_hold" && c.verdict !== "GO" && c.verdict !== "HOLD") return false;

    if (p.aboveEma10 && ema10 != null && price != null && price < ema10) return false;
    if (p.aboveSma20 && sma20 != null && price != null && price < sma20) return false;
    if (p.emaStackRequired && !emaStackOk) return false;
    if (p.breakoutOnly && !breakout) return false;

    if (p.stochMin != null && stochSlowK != null && stochSlowK < p.stochMin) return false;
    if (p.stochMax != null && stochSlowK != null && stochSlowK > p.stochMax) return false;

    if (p.macd3mAboveZero && macd3mLine != null && macd3mLine < 0) return false;
    if (p.macd3mHistPositive && macd3mHist != null && macd3mHist < 0) return false;

    return true;
  });
  filtered.sort((a, b) => b.score - a.score);
  return filtered;
}
