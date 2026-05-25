/**
 * Polygon.io provider — real-time quotes, options flow, news.
 * Requires a Polygon API key (free tier available at polygon.io).
 * Free tier: 5 calls/min, end-of-day data. Starter+ for real-time.
 */
import axios from "axios";

const BASE = "https://api.polygon.io";

export interface PolygonQuote {
  price: number;
  bid: number;
  ask: number;
  spread: number;
  volume: number;
  vwap: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
}

export interface PolygonOptionsFlow {
  putCallRatio: number | null;
  totalCallVolume: number | null;
  totalPutVolume: number | null;
  impliedVolatility: number | null;
  unusualActivity: boolean;
  flowScore: number; // 0–1, >0.6 = bullish options activity
}

export interface PolygonNews {
  sentiment: number | null; // -1 to +1
  articleCount: number;
  headline: string | null;
}

export interface PolygonData {
  ok: boolean;
  quote: PolygonQuote | null;
  optionsFlow: PolygonOptionsFlow | null;
  news: PolygonNews | null;
  source: "polygon";
}

async function pgGet<T>(path: string, apiKey: string): Promise<T | null> {
  try {
    const { data } = await axios.get(`${BASE}${path}`, {
      timeout: 10000,
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return data as T;
  } catch { return null; }
}

export async function fetchPolygonData(ticker: string, apiKey: string): Promise<PolygonData> {
  const empty: PolygonData = { ok: false, quote: null, optionsFlow: null, news: null, source: "polygon" };
  if (!apiKey) return empty;

  try {
    // Fetch snapshot (real-time on paid, EOD on free)
    const [snapshot, optionsSnap, newsData] = await Promise.allSettled([
      pgGet<any>(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`, apiKey),
      pgGet<any>(`/v3/snapshot/options/${ticker}?limit=50&order=desc&sort=open_interest`, apiKey),
      pgGet<any>(`/v2/reference/news?ticker=${ticker}&limit=5&order=desc`, apiKey),
    ]);

    // Quote
    let quote: PolygonQuote | null = null;
    if (snapshot.status === "fulfilled" && snapshot.value?.ticker) {
      const t = snapshot.value.ticker;
      const day = t.day ?? {};
      const prevDay = t.prevDay ?? {};
      const lastTrade = t.lastTrade ?? {};
      const lastQuote = t.lastQuote ?? {};
      const price = lastTrade.p ?? day.c ?? 0;
      const prevClose = prevDay.c ?? null;
      quote = {
        price,
        bid: lastQuote.P ?? 0,
        ask: lastQuote.p ?? 0,
        spread: lastQuote.p && lastQuote.P ? lastQuote.p - lastQuote.P : 0,
        volume: day.v ?? 0,
        vwap: day.vw ?? null,
        open: day.o ?? null,
        high: day.h ?? null,
        low: day.l ?? null,
        prevClose,
        change: prevClose && price ? price - prevClose : null,
        changePct: prevClose && price ? (price - prevClose) / prevClose : null,
      };
    }

    // Options flow
    let optionsFlow: PolygonOptionsFlow | null = null;
    if (optionsSnap.status === "fulfilled" && optionsSnap.value?.results) {
      const contracts: any[] = optionsSnap.value.results ?? [];
      let callVol = 0, putVol = 0, ivSum = 0, ivCount = 0;
      for (const c of contracts) {
        const vol = c.details?.open_interest ?? c.open_interest ?? 0;
        const iv = c.implied_volatility ?? null;
        if (c.details?.contract_type === "call" || c.contract_type === "call") callVol += vol;
        else putVol += vol;
        if (iv != null) { ivSum += iv; ivCount++; }
      }
      const pcr = callVol > 0 ? putVol / callVol : null;
      const avgIV = ivCount > 0 ? ivSum / ivCount : null;
      // Flow score: low P/C ratio = bullish, high IV = momentum
      const pcrScore = pcr != null ? Math.max(0, 1 - pcr) : 0.5;
      const ivScore = avgIV != null ? Math.min(1, avgIV / 0.6) : 0.5;
      const flowScore = pcrScore * 0.6 + ivScore * 0.4;
      optionsFlow = {
        putCallRatio: pcr,
        totalCallVolume: callVol,
        totalPutVolume: putVol,
        impliedVolatility: avgIV,
        unusualActivity: flowScore > 0.7,
        flowScore: parseFloat(flowScore.toFixed(3)),
      };
    }

    // News sentiment
    let news: PolygonNews | null = null;
    if (newsData.status === "fulfilled" && newsData.value?.results) {
      const articles: any[] = newsData.value.results ?? [];
      // Polygon free tier doesn't include sentiment; we use a keyword heuristic
      let sentimentSum = 0;
      const positiveWords = ["surge", "beat", "record", "growth", "upgrade", "bullish", "rally", "strong", "soar", "jump"];
      const negativeWords = ["miss", "cut", "downgrade", "bearish", "loss", "decline", "fall", "weak", "crash", "plunge"];
      for (const article of articles) {
        const text = ((article.title ?? "") + " " + (article.description ?? "")).toLowerCase();
        const pos = positiveWords.filter((w) => text.includes(w)).length;
        const neg = negativeWords.filter((w) => text.includes(w)).length;
        sentimentSum += (pos - neg) / Math.max(1, pos + neg);
      }
      news = {
        sentiment: articles.length > 0 ? parseFloat((sentimentSum / articles.length).toFixed(3)) : null,
        articleCount: articles.length,
        headline: articles[0]?.title ?? null,
      };
    }

    return { ok: quote != null, quote, optionsFlow, news, source: "polygon" };
  } catch {
    return empty;
  }
}
