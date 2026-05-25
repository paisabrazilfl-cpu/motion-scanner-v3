/**
 * News route — tier-1 financial news aggregator.
 *
 * Free baseline (no key):
 *   Yahoo Finance RSS, Reuters RSS, CNBC RSS, MarketWatch RSS
 *
 * Enhanced (with tenant Finnhub key):
 *   Finnhub authenticated market news (general / forex / merger)
 */
import { Router } from "express";
import axios from "axios";
import { db, apiKeysTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { decrypt } from "../lib/crypto";

const router = Router();

// ── Tier-1 RSS sources ────────────────────────────────────────────────────
interface RssFeed {
  url: string;
  sourceLabel: string;
  category: "general" | "forex" | "merger";
}

const RSS_FEEDS: RssFeed[] = [
  // US Markets
  { url: "https://finance.yahoo.com/rss/topstories", sourceLabel: "Yahoo Finance", category: "general" },
  { url: "https://www.cnbc.com/id/10000664/device/rss/rss.html", sourceLabel: "CNBC", category: "general" },
  { url: "https://www.cnbc.com/id/15839135/device/rss/rss.html", sourceLabel: "CNBC", category: "general" }, // market insider
  { url: "https://feeds.marketwatch.com/marketwatch/topstories/", sourceLabel: "MarketWatch", category: "general" },
  // Global / Macro
  { url: "https://feeds.reuters.com/reuters/businessNews", sourceLabel: "Reuters", category: "general" },
  { url: "https://feeds.reuters.com/reuters/USDollarRoundUp", sourceLabel: "Reuters", category: "forex" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", sourceLabel: "CNBC", category: "forex" }, // world markets
  // M&A
  { url: "https://feeds.reuters.com/reuters/mergersNews", sourceLabel: "Reuters", category: "merger" },
];

// ── Simple RSS/XML parser ─────────────────────────────────────────────────
function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i"));
  return (m?.[1] ?? "").trim();
}

function extractAllItems(xml: string): string[] {
  const items: string[] = [];
  const re = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) items.push(m[1]);
  return items;
}

function parseRFC822(dateStr: string): Date {
  try { return new Date(dateStr); } catch { return new Date(); }
}

// ── Tier-1 source domain → display label ─────────────────────────────────
const DOMAIN_LABELS: Record<string, string> = {
  "bloomberg.com": "Bloomberg", "reuters.com": "Reuters", "wsj.com": "WSJ",
  "ft.com": "Financial Times", "cnbc.com": "CNBC", "marketwatch.com": "MarketWatch",
  "finance.yahoo.com": "Yahoo Finance", "yahoo.com": "Yahoo Finance",
  "barrons.com": "Barron's", "fortune.com": "Fortune",
  "businessinsider.com": "Business Insider", "seekingalpha.com": "Seeking Alpha",
  "thestreet.com": "The Street", "investing.com": "Investing.com",
  "benzinga.com": "Benzinga", "economist.com": "The Economist",
};

function domainLabel(url: string, fallback: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    for (const [d, l] of Object.entries(DOMAIN_LABELS)) {
      if (host.includes(d)) return l;
    }
    return fallback;
  } catch { return fallback; }
}

// ── Keyword sentiment ─────────────────────────────────────────────────────
const POS_WORDS = ["surge", "soar", "record", "beat", "growth", "rally", "upgrade", "bullish", "jump", "rise", "gain", "strong", "profit", "expand", "recover"];
const NEG_WORDS = ["crash", "plunge", "miss", "cut", "downgrade", "bearish", "fall", "loss", "decline", "concern", "warn", "recession", "fear", "default", "debt"];

function sentiment(text: string): "bullish" | "bearish" | "neutral" {
  const t = text.toLowerCase();
  const pos = POS_WORDS.filter((w) => t.includes(w)).length;
  const neg = NEG_WORDS.filter((w) => t.includes(w)).length;
  return pos > neg ? "bullish" : neg > pos ? "bearish" : "neutral";
}

// ── Article type ──────────────────────────────────────────────────────────
interface NewsArticle {
  id: string;
  headline: string;
  summary: string;
  source: string;
  sourceLabel: string;
  url: string;
  image: string | null;
  publishedAt: string;
  relatedTickers: string[];
  category: string;
  sentiment: string;
  isBreaking: boolean;
}

// ── Fetch one RSS feed ────────────────────────────────────────────────────
async function fetchRSS(feed: RssFeed): Promise<NewsArticle[]> {
  try {
    const { data: xml } = await axios.get<string>(feed.url, {
      timeout: 8000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MotionScanner/3.0; +https://motionscanner.app)",
        "Accept": "application/rss+xml, application/xml, text/xml",
      },
      responseType: "text",
    });

    const items = extractAllItems(xml);
    const now = Date.now();

    return items.slice(0, 20).map((item, idx) => {
      const headline = extractTag(item, "title");
      const summary = extractTag(item, "description").replace(/<[^>]+>/g, "").slice(0, 400);
      const url = extractTag(item, "link") || extractTag(item, "guid");
      const pubDateStr = extractTag(item, "pubDate") || extractTag(item, "dc:date") || extractTag(item, "published");
      const pubDate = parseRFC822(pubDateStr);
      const mediaUrl = item.match(/url="([^"]+\.(jpg|jpeg|png|webp))"/i)?.[1] ?? null;

      // Extract ticker symbols ($AAPL style) from headline/summary
      const tickers = [...new Set([
        ...(headline + " " + summary).match(/\$([A-Z]{1,5})\b/g)?.map((t) => t.slice(1)) ?? [],
      ])].slice(0, 5);

      return {
        id: `${feed.sourceLabel}-${idx}-${pubDate.getTime()}`,
        headline: headline || "(No title)",
        summary,
        source: feed.sourceLabel,
        sourceLabel: domainLabel(url, feed.sourceLabel),
        url,
        image: mediaUrl,
        publishedAt: pubDate.toISOString(),
        relatedTickers: tickers,
        category: feed.category,
        sentiment: sentiment(headline + " " + summary),
        isBreaking: now - pubDate.getTime() < 3_600_000, // <1h
      } satisfies NewsArticle;
    }).filter((a) => a.headline !== "(No title)" && a.url);
  } catch { return []; }
}

// ── Finnhub enrichment (when tenant key available) ────────────────────────
async function fetchFinnhubNews(finnhubKey: string): Promise<NewsArticle[]> {
  const categories = ["general", "forex", "merger"] as const;
  const results = await Promise.allSettled(
    categories.map(async (cat) => {
      const { data } = await axios.get("https://finnhub.io/api/v1/news", {
        params: { category: cat, token: finnhubKey },
        timeout: 8000,
      });
      if (!Array.isArray(data)) return [] as NewsArticle[];
      return data.filter((a: any) => a.headline && a.url).slice(0, 20).map((a: any): NewsArticle => ({
        id: String(a.id),
        headline: String(a.headline),
        summary: String(a.summary ?? "").slice(0, 400),
        source: String(a.source ?? "Finnhub"),
        sourceLabel: domainLabel(a.url, String(a.source ?? "Finnhub")),
        url: String(a.url),
        image: a.image && String(a.image).startsWith("http") ? String(a.image) : null,
        publishedAt: new Date(a.datetime * 1000).toISOString(),
        relatedTickers: a.related ? String(a.related).split(",").map((t: string) => t.trim()).filter(Boolean) : [],
        category: cat,
        sentiment: sentiment(a.headline + " " + (a.summary ?? "")),
        isBreaking: Date.now() - a.datetime * 1000 < 3_600_000,
      }));
    })
  );
  return results.flatMap((r) => r.status === "fulfilled" ? r.value : []);
}

async function getTenantFinnhubKey(tenantId: number): Promise<string | undefined> {
  try {
    const rows = await db.select().from(apiKeysTable).where(eq(apiKeysTable.tenantId, tenantId)).limit(1);
    const enc = rows[0]?.finnhubApiKeyEnc;
    if (!enc) return undefined;
    return decrypt(enc);
  } catch { return undefined; }
}

// ── 10-min in-memory cache (keyed by tenantId + category) ────────────────
const cache = new Map<string, { data: NewsArticle[]; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

// ── Route ─────────────────────────────────────────────────────────────────
router.get("/news", async (req, res): Promise<void> => {
  const category = (req.query.category as string) || "all";
  const validCategories = ["general", "forex", "merger", "all"];
  const safeCategory = validCategories.includes(category) ? category : "all";
  const bust = req.query.bust === "1";

  const cacheKey = `${req.tenantId}:${safeCategory}`;
  const cached = cache.get(cacheKey);
  if (!bust && cached && cached.data.length > 0 && Date.now() - cached.ts < CACHE_TTL) {
    res.json({ articles: cached.data, source: "cache", category: safeCategory });
    return;
  }

  // Filter RSS feeds by category
  const feeds = safeCategory === "all"
    ? RSS_FEEDS
    : RSS_FEEDS.filter((f) => f.category === safeCategory);

  // Fetch RSS + Finnhub in parallel
  const finnhubKey = await getTenantFinnhubKey(req.tenantId);
  const [rssResults, finnhubArticles] = await Promise.all([
    Promise.all(feeds.map(fetchRSS)),
    finnhubKey ? fetchFinnhubNews(finnhubKey) : Promise.resolve([] as NewsArticle[]),
  ]);

  // Merge, deduplicate by URL, sort newest-first
  const seen = new Set<string>();
  const all = [...rssResults.flat(), ...finnhubArticles];
  const merged: NewsArticle[] = [];
  for (const a of all) {
    if (a.url && !seen.has(a.url)) {
      seen.add(a.url);
      merged.push(a);
    }
  }
  merged.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  // Only cache non-empty results
  if (merged.length > 0) {
    cache.set(cacheKey, { data: merged, ts: Date.now() });
  }

  res.json({
    articles: merged,
    source: finnhubKey ? "rss+finnhub" : "rss",
    category: safeCategory,
  });
});

export default router;
