/**
 * Sector rotation engine — standalone lib to avoid circular imports.
 */
import { fetchYahooChart } from "./providers/yahoo";

const SECTOR_ETFS: Record<string, string> = {
  XLK: "Technology", XLY: "Consumer Discretionary", XLC: "Communication Services",
  XLF: "Financials", XLV: "Healthcare", XLI: "Industrials",
  XLP: "Consumer Staples", XLU: "Utilities", XLE: "Energy",
  XLB: "Materials", XLRE: "Real Estate",
};

async function fetchReturn(symbol: string, days: number): Promise<number | null> {
  try {
    const range = days <= 5 ? "1mo" : "3mo";
    const chart = await fetchYahooChart(symbol, range);
    if (!chart || chart.closes.length < days + 1) return null;
    const closes = chart.closes;
    const prev = closes[closes.length - 1 - days];
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
      const rs1 = r1 - spyR1, rs5 = r5 - spyR5;
      return {
        etf, name,
        ret1d: parseFloat((r1 * 100).toFixed(2)),
        ret5d: parseFloat((r5 * 100).toFixed(2)),
        ret20d: parseFloat((r20 * 100).toFixed(2)),
        rs1d: parseFloat((rs1 * 100).toFixed(2)),
        rs5d: parseFloat((rs5 * 100).toFixed(2)),
        rs20d: parseFloat(((r20 - spyR20) * 100).toFixed(2)),
        leader: rs5 > 0 && (r20 - spyR20) > 0,
        laggard: rs5 < 0 && (r20 - spyR20) < 0,
      };
    }).sort((a, b) => b.rs5d - a.rs5d);

    const cyclical = ["XLK", "XLY", "XLC", "XLF", "XLI"];
    const defensive = ["XLP", "XLU", "XLV", "XLRE"];
    const cycRs = sectors.filter((s) => cyclical.includes(s.etf)).reduce((a, b, _, arr) => a + b.rs5d / arr.length, 0);
    const defRs = sectors.filter((s) => defensive.includes(s.etf)).reduce((a, b, _, arr) => a + b.rs5d / arr.length, 0);
    const regime = cycRs > defRs + 0.3 ? "RISK_ON" : defRs > cycRs + 0.3 ? "RISK_OFF" : "NEUTRAL";

    return {
      ok: true, regime,
      cyclicalRs: parseFloat(cycRs.toFixed(2)),
      defensiveRs: parseFloat(defRs.toFixed(2)),
      sectors,
      leaders: sectors.filter((s) => s.leader).slice(0, 3),
      laggards: sectors.filter((s) => s.laggard).slice(-3),
      spyReturns: { ret1d: spyR1, ret5d: spyR5, ret20d: spyR20 },
    };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}
