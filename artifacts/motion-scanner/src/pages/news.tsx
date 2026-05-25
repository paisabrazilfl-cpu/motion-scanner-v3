import { useState } from "react";
import { useGetNews } from "@workspace/api-client-react";
import type { NewsArticle, NewsArticleSentiment } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExternalLink, Search, Zap, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Category = "all" | "general" | "forex" | "merger";

const CATEGORY_LABELS: Record<Category, string> = {
  all: "All Markets",
  general: "US Markets",
  forex: "Global / FX",
  merger: "M&A",
};

function SentimentIcon({ s }: { s: string }) {
  if (s === "bullish") return <TrendingUp className="h-3 w-3 text-[hsl(var(--go-color))]" />;
  if (s === "bearish") return <TrendingDown className="h-3 w-3 text-red-400" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

function SentimentBadge({ s }: { s: string }) {
  const styles: Record<string, string> = {
    bullish: "border-[hsl(var(--go-color))]/40 text-[hsl(var(--go-color))] bg-[hsl(var(--go-color))]/10",
    bearish: "border-red-500/40 text-red-400 bg-red-500/10",
    neutral: "border-border text-muted-foreground bg-muted/20",
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs border rounded px-1.5 py-0.5 font-mono ${styles[s] ?? styles.neutral}`}>
      <SentimentIcon s={s} />
      {s}
    </span>
  );
}

function SourceBadge({ label }: { label: string }) {
  const tier1 = ["Bloomberg", "Reuters", "WSJ", "Financial Times", "CNBC", "MarketWatch", "Barron's", "The Economist", "Fortune"];
  const isTier1 = tier1.includes(label);
  return (
    <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${
      isTier1
        ? "border-amber-500/40 text-amber-400 bg-amber-500/10"
        : "border-border text-muted-foreground"
    }`}>
      {label}
    </span>
  );
}

function CategoryBadge({ cat }: { cat: string }) {
  const styles: Record<string, string> = {
    general: "border-blue-500/40 text-blue-400",
    forex: "border-purple-500/40 text-purple-400",
    merger: "border-orange-500/40 text-orange-400",
  };
  const labels: Record<string, string> = { general: "US", forex: "GLOBAL", merger: "M&A" };
  return (
    <span className={`text-xs border rounded px-1.5 py-0.5 font-mono ${styles[cat] ?? "border-border text-muted-foreground"}`}>
      {labels[cat] ?? cat.toUpperCase()}
    </span>
  );
}

function ArticleCard({ article }: { article: NewsArticle }) {
  const ageStr = (() => {
    try { return formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true }); }
    catch { return ""; }
  })();

  return (
    <a href={article.url} target="_blank" rel="noopener noreferrer" className="block group">
      <Card className={`bg-card border-border hover:border-[hsl(var(--go-color))]/30 transition-colors ${
        article.isBreaking ? "border-l-2 border-l-amber-500" : ""
      }`}>
        <CardContent className="p-4">
          <div className="flex gap-3">
            {/* Thumbnail */}
            {article.image && (
              <div className="flex-shrink-0 w-20 h-14 rounded overflow-hidden bg-muted/20">
                <img
                  src={article.image}
                  alt=""
                  className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-2">
              {/* Meta row */}
              <div className="flex items-center gap-2 flex-wrap">
                {article.isBreaking && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-400 animate-pulse">
                    <Zap className="h-3 w-3" /> BREAKING
                  </span>
                )}
                <SourceBadge label={article.sourceLabel} />
                <CategoryBadge cat={article.category} />
                <SentimentBadge s={article.sentiment} />
                <span className="text-xs text-muted-foreground ml-auto">{ageStr}</span>
              </div>

              {/* Headline */}
              <p className="text-sm font-medium leading-snug group-hover:text-[hsl(var(--go-color))] transition-colors line-clamp-2">
                {article.headline}
              </p>

              {/* Summary */}
              {article.summary && article.summary !== article.headline && (
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {article.summary}
                </p>
              )}

              {/* Tickers & link */}
              <div className="flex items-center gap-2 flex-wrap">
                {article.relatedTickers.slice(0, 5).map((t) => (
                  <span key={t} className="text-xs font-mono text-[hsl(var(--go-color))]/80 bg-[hsl(var(--go-color))]/5 border border-[hsl(var(--go-color))]/20 px-1.5 py-0.5 rounded">
                    {t}
                  </span>
                ))}
                <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </a>
  );
}

function SkeletonCard() {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex gap-3">
          <Skeleton className="flex-shrink-0 w-20 h-14 rounded" />
          <div className="flex-1 space-y-2">
            <div className="flex gap-2"><Skeleton className="h-5 w-20" /><Skeleton className="h-5 w-14" /></div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-2"><Skeleton className="h-4 w-12" /><Skeleton className="h-4 w-12" /></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function News() {
  const [category, setCategory] = useState<Category>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch, isFetching } = useGetNews(
    { category },
    { query: { staleTime: 10 * 60 * 1000, queryKey: ["/api/news", category] } }
  );

  const articles = (data?.articles ?? []).filter((a: NewsArticle) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.headline.toLowerCase().includes(q) ||
      a.summary.toLowerCase().includes(q) ||
      a.sourceLabel.toLowerCase().includes(q) ||
      a.relatedTickers.some((t: string) => t.toLowerCase().includes(q))
    );
  });

  const breaking = articles.filter((a: NewsArticle) => a.isBreaking);
  const rest = articles.filter((a: NewsArticle) => !a.isBreaking);

  // Stats
  const bullCount = articles.filter((a: NewsArticle) => a.sentiment === "bullish").length;
  const bearCount = articles.filter((a: NewsArticle) => a.sentiment === "bearish").length;
  const sentimentBias = articles.length > 0
    ? (bullCount - bearCount) / articles.length
    : 0;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">News</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tier-1 financial news · Bloomberg · Reuters · WSJ · FT · CNBC · MarketWatch
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="font-mono text-xs"
        >
          {isFetching ? "Refreshing..." : "↺ Refresh"}
        </Button>
      </div>

      {/* Sentiment pulse */}
      {!isLoading && articles.length > 0 && (
        <div className="flex items-center gap-4 p-3 bg-card border border-border rounded-lg text-xs font-mono flex-wrap">
          <span className="text-muted-foreground uppercase tracking-wider">Market Pulse</span>
          <span className="text-[hsl(var(--go-color))]">▲ {bullCount} bullish</span>
          <span className="text-red-400">▼ {bearCount} bearish</span>
          <span className="text-muted-foreground">— {articles.length - bullCount - bearCount} neutral</span>
          <div className="flex-1 min-w-24 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, (bullCount / Math.max(articles.length, 1)) * 100)}%`,
                background: sentimentBias > 0.1 ? "hsl(var(--go-color))" : sentimentBias < -0.1 ? "hsl(0 72% 51%)" : "hsl(45 93% 47%)",
              }}
            />
          </div>
          <span className={`font-bold ${sentimentBias > 0.1 ? "text-[hsl(var(--go-color))]" : sentimentBias < -0.1 ? "text-red-400" : "text-yellow-400"}`}>
            {sentimentBias > 0.1 ? "RISK-ON" : sentimentBias < -0.1 ? "RISK-OFF" : "MIXED"}
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {(Object.entries(CATEGORY_LABELS) as [Category, string][]).map(([cat, label]) => (
            <Button
              key={cat}
              variant="ghost"
              size="sm"
              onClick={() => setCategory(cat)}
              className={`h-8 px-3 text-xs font-mono rounded ${
                category === cat
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by headline, ticker, source…"
            className="pl-8 h-8 text-xs font-mono"
          />
        </div>
        {!isLoading && (
          <span className="text-xs text-muted-foreground ml-auto">
            {articles.length} article{articles.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Breaking news */}
      {!isLoading && breaking.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Breaking — last hour</span>
          </div>
          <div className="space-y-2">
            {breaking.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </div>
      )}

      {/* All articles */}
      {!isLoading && rest.length > 0 && (
        <div className="space-y-2">
          {breaking.length > 0 && (
            <div className="text-xs text-muted-foreground uppercase tracking-wider pt-1">Earlier</div>
          )}
          <div className="space-y-2">
            {rest.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </div>
      )}

      {!isLoading && articles.length === 0 && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          {search ? "No articles match your search." : "No news available — try refreshing."}
        </div>
      )}
    </div>
  );
}
