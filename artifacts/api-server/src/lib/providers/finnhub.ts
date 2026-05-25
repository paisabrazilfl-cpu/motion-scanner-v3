/**
 * Finnhub provider — real-time quote, news sentiment, earnings calendar.
 * Free tier: 60 calls/min. Sign up at finnhub.io.
 */
import axios from "axios";

const BASE = "https://finnhub.io/api/v1";

async function fhGet<T>(path: string, apiKey: string): Promise<T | null> {
  try {
    const { data } = await axios.get(`${BASE}${path}`, {
      timeout: 8000,
      params: { token: apiKey },
    });
    return data as T;
  } catch { return null; }
}

export interface FinnhubQuote {
  price: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  change: number;
  changePct: number;
  timestamp: number;
}

export interface FinnhubSentiment {
  bullishPct: number | null;
  bearishPct: number | null;
  score: number | null; // -1 to +1
  buzz: number | null; // article count normalised 0-1
  weeklyAvg: number | null;
}

export interface FinnhubEarnings {
  daysToEarnings: number | null;
  epsEstimate: number | null;
  epsSurprisePct: number | null; // last quarter actual vs estimate
}

export interface FinnhubProfile {
  marketCap: number | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  exchange: string | null;
  name: string | null;
  beta: number | null;
  peRatio: number | null;
}

export interface FinnhubData {
  ok: boolean;
  quote: FinnhubQuote | null;
  sentiment: FinnhubSentiment | null;
  earnings: FinnhubEarnings | null;
  profile: FinnhubProfile | null;
  source: "finnhub";
}

export async function fetchFinnhubData(ticker: string, apiKey: string): Promise<FinnhubData> {
  const empty: FinnhubData = { ok: false, quote: null, sentiment: null, earnings: null, profile: null, source: "finnhub" };
  if (!apiKey) return empty;

  try {
    const today = new Date();
    const from = new Date(today); from.setDate(today.getDate() - 90);
    const fromStr = from.toISOString().split("T")[0];
    const toStr = today.toISOString().split("T")[0];

    const [quoteData, sentData, earningsData, profileData] = await Promise.allSettled([
      fhGet<any>(`/quote?symbol=${ticker}`, apiKey),
      fhGet<any>(`/news-sentiment?symbol=${ticker}`, apiKey),
      fhGet<any>(`/calendar/earnings?symbol=${ticker}&from=${fromStr}&to=${toStr}`, apiKey),
      fhGet<any>(`/stock/profile2?symbol=${ticker}`, apiKey),
    ]);

    // Quote
    let quote: FinnhubQuote | null = null;
    if (quoteData.status === "fulfilled" && quoteData.value?.c) {
      const q = quoteData.value;
      quote = {
        price: q.c,
        open: q.o,
        high: q.h,
        low: q.l,
        prevClose: q.pc,
        change: q.d ?? (q.c - q.pc),
        changePct: q.dp ?? ((q.c - q.pc) / q.pc),
        timestamp: q.t ?? Date.now() / 1000,
      };
    }

    // News sentiment
    let sentiment: FinnhubSentiment | null = null;
    if (sentData.status === "fulfilled" && sentData.value?.buzz) {
      const s = sentData.value;
      const bull = s.sentiment?.bullishPercent ?? null;
      const bear = s.sentiment?.bearishPercent ?? null;
      const score = bull != null && bear != null ? bull - bear : null;
      sentiment = {
        bullishPct: bull ? parseFloat((bull * 100).toFixed(1)) : null,
        bearishPct: bear ? parseFloat((bear * 100).toFixed(1)) : null,
        score: score != null ? parseFloat(score.toFixed(3)) : null,
        buzz: s.buzz?.weeklyAverage != null ? parseFloat((Math.min(1, s.buzz.weeklyAverage / 20)).toFixed(3)) : null,
        weeklyAvg: s.buzz?.weeklyAverage ?? null,
      };
    }

    // Earnings
    let earnings: FinnhubEarnings | null = null;
    if (earningsData.status === "fulfilled" && earningsData.value?.earningsCalendar) {
      const calendar: any[] = earningsData.value.earningsCalendar ?? [];
      const future = calendar
        .filter((e) => e.date && new Date(e.date) >= today)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const next = future[0];
      if (next) {
        earnings = {
          daysToEarnings: Math.round((new Date(next.date).getTime() - today.getTime()) / 86400000),
          epsEstimate: next.epsEstimate ?? null,
          epsSurprisePct: null,
        };
      }
      // Check last quarter for surprise
      const past = calendar.filter((e) => e.date && new Date(e.date) < today && e.epsActual != null);
      if (past.length > 0) {
        const last = past[past.length - 1];
        if (last.epsEstimate && last.epsActual != null) {
          const surprise = (last.epsActual - last.epsEstimate) / Math.abs(last.epsEstimate || 1);
          if (!earnings) earnings = { daysToEarnings: null, epsEstimate: null, epsSurprisePct: null };
          earnings.epsSurprisePct = parseFloat((surprise * 100).toFixed(1));
        }
      }
    }

    // Profile
    let profile: FinnhubProfile | null = null;
    if (profileData.status === "fulfilled" && profileData.value?.ticker) {
      const p = profileData.value;
      profile = {
        marketCap: p.marketCapitalization ? p.marketCapitalization * 1_000_000 : null,
        sector: p.gsector ?? p.finnhubIndustry ?? null,
        industry: p.finnhubIndustry ?? null,
        country: p.country ?? null,
        exchange: p.exchange ?? null,
        name: p.name ?? null,
        beta: p.beta ?? null,
        peRatio: p.peRatio ?? null,
      };
    }

    return { ok: quote != null || sentiment != null, quote, sentiment, earnings, profile, source: "finnhub" };
  } catch {
    return empty;
  }
}
