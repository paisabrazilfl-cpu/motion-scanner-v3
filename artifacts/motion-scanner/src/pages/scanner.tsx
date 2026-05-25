import { useState, useCallback } from "react";
import { useRunScan, useListWatchlists, useRunScreener } from "@workspace/api-client-react";
import type { ScanResult, CandidateRecord, RunScreenerParams } from "@workspace/api-client-react";
import { TickerChart } from "@/components/TickerChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Filter, SlidersHorizontal, BarChart2 } from "lucide-react";
import { formatPercent, formatCurrency } from "@/lib/format";

// ── Shared sub-components ──────────────────────────────────────────────────

function VerdictBadge({ verdict }: { verdict: string }) {
  const styles: Record<string, string> = {
    GO:   "bg-[hsl(var(--go-color))]/20 text-[hsl(var(--go-color))] border-[hsl(var(--go-color))]/40",
    HOLD: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
    ABORT:"bg-red-500/20 text-red-400 border-red-500/40",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold tracking-wide ${styles[verdict] ?? "bg-muted text-muted-foreground"}`}>
      {verdict}
    </span>
  );
}

function ScoreBar({ score, width = "w-16" }: { score: number; width?: string }) {
  const pct = Math.min(100, Math.max(0, score * 100));
  const color = pct >= 60 ? "bg-[hsl(var(--go-color))]" : pct >= 40 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className={`${width} h-1.5 bg-muted rounded-full overflow-hidden`}>
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono w-8 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

function ProviderChips({ providers }: { providers?: string[] }) {
  if (!providers?.length) return null;
  const labels: Record<string, string> = { yahoo_finance: "YF", polygon: "POLY", finnhub: "FH" };
  const colors: Record<string, string> = {
    yahoo_finance: "border-blue-500/40 text-blue-400",
    polygon:       "border-purple-500/40 text-purple-400",
    finnhub:       "border-orange-500/40 text-orange-400",
  };
  return (
    <div className="flex items-center gap-1.5">
      {providers.map((p) => (
        <span key={p} className={`text-xs border rounded px-1.5 py-0.5 font-mono ${colors[p] ?? "border-border text-muted-foreground"}`}>
          {labels[p] ?? p}
        </span>
      ))}
    </div>
  );
}

function Num({ v, digits = 1, suffix = "", colored = false }: { v: number | null | undefined; digits?: number; suffix?: string; colored?: boolean }) {
  if (v == null) return <span className="text-muted-foreground">—</span>;
  const text = `${v.toFixed(digits)}${suffix}`;
  if (!colored) return <span className="font-mono">{text}</span>;
  const pos = v >= 0;
  return <span className={`font-mono ${pos ? "text-[hsl(var(--go-color))]" : "text-red-400"}`}>{pos ? "+" : ""}{text}</span>;
}

// ── Ticker detail sheet (shared between Manual + Screener) ─────────────────
function TickerDetail({ c }: { c: CandidateRecord }) {
  const tech    = c.technical    as Record<string, number | boolean> | null;
  const flow    = c.flow         as Record<string, number | boolean> | null;
  const fund    = c.fundamentals as Record<string, number | string | null> | null;
  const mc      = c.monteCarlo   as Record<string, number> | null;
  const options = c.options      as Record<string, number | boolean | null> | null;
  const sentiment = c.sentiment  as Record<string, number | string | null> | null;

  return (
    <div className="space-y-4 p-1 text-sm">
      <div className="flex items-center gap-3">
        <span className="text-2xl font-bold">{c.ticker}</span>
        <VerdictBadge verdict={c.verdict} />
        {tech?.price != null && <span className="font-mono text-muted-foreground">${Number(tech.price).toFixed(2)}</span>}
        {tech?.changePct != null && <Num v={Number(tech.changePct) * 100} digits={2} suffix="%" colored />}
      </div>
      <div className="text-xs text-muted-foreground">{c.reason}</div>

      <Tabs defaultValue="chart">
        <TabsList className="w-full">
          <TabsTrigger value="chart"       className="flex-1">Chart</TabsTrigger>
          <TabsTrigger value="technical"   className="flex-1">Technical</TabsTrigger>
          <TabsTrigger value="options"     className="flex-1">Options</TabsTrigger>
          <TabsTrigger value="fundamental" className="flex-1">Fundamentals</TabsTrigger>
          <TabsTrigger value="montecarlo"  className="flex-1">MC</TabsTrigger>
        </TabsList>

        <TabsContent value="chart" className="pt-2">
          <TickerChart ticker={c.ticker} />
        </TabsContent>

        <TabsContent value="technical" className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {[
              ["RSI(14)", tech?.rsi, 1],
              ["ADX(14)", tech?.adx, 1],
              ["RVOL",    tech?.rvol, 2],
              ["ATR %",   tech?.atr_pct != null ? Number(tech.atr_pct)*100 : null, 2],
              ["Stoch %K",tech?.stochK, 1],
              ["MACD Hist",tech?.macdHist, 4],
              ["EMA9",    tech?.ema9, 2],
              ["EMA10",   tech?.ema10, 2],
              ["EMA21",   tech?.ema21, 2],
              ["EMA50",   tech?.ema50, 2],
              ["SMA20",   tech?.sma20, 2],
              ["EMA200",  tech?.ema200, 2],
              ["Vol $M",  tech?.dollar_volume != null ? Number(tech.dollar_volume)/1_000_000 : null, 1],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex justify-between border-b border-border/40 py-1">
                <span className="text-muted-foreground">{label}</span>
                <Num v={val as number | null} digits={2} />
              </div>
            ))}
            <div className="flex justify-between border-b border-border/40 py-1">
              <span className="text-muted-foreground">EMA Stack</span>
              <span className={tech?.ema_stack_ok ? "text-[hsl(var(--go-color))]" : "text-red-400"}>
                {tech?.ema_stack_ok ? "BULL" : "BEAR"}
              </span>
            </div>
            <div className="flex justify-between border-b border-border/40 py-1">
              <span className="text-muted-foreground">Breakout</span>
              <span className={tech?.breakout ? "text-[hsl(var(--go-color))]" : "text-muted-foreground"}>
                {tech?.breakout ? "YES" : "NO"}
              </span>
            </div>
          </div>
          {flow && (
            <div className="mt-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Flow</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">RS vs SPY</span>
                  <Num v={Number(flow.rel_strength_spy)*100} digits={2} suffix="%" colored />
                </div>
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">Vol Spike</span>
                  <span className={flow.volumeSpike ? "text-[hsl(var(--go-color))]" : "text-muted-foreground"}>
                    {flow.volumeSpike ? "YES" : "NO"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="options" className="space-y-3 pt-2">
          {options?.ok ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {[
                ["Flow Score",   <ScoreBar score={Number(options.flowScore)} width="w-20" />],
                ["P/C Ratio",    <Num v={options.putCallRatio as number} digits={2} />],
                ["Impl. Vol",    <Num v={options.impliedVolatility != null ? Number(options.impliedVolatility)*100 : null} digits={1} suffix="%" />],
                ["Call Vol",     <Num v={options.callVolume as number} digits={0} />],
                ["Put Vol",      <Num v={options.putVolume  as number} digits={0} />],
              ].map(([label, el]) => (
                <div key={String(label)} className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">{label}</span>
                  {el}
                </div>
              ))}
              <div className="flex justify-between border-b border-border/40 py-1">
                <span className="text-muted-foreground">Unusual</span>
                <span className={options.unusualActivity ? "text-[hsl(var(--go-color))]" : "text-muted-foreground"}>
                  {options.unusualActivity ? "YES" : "NO"}
                </span>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-muted-foreground text-xs">
              Options flow requires a Polygon.io API key (Settings → API Keys).
            </div>
          )}
          {sentiment && (
            <div className="mt-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">News Sentiment</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {[
                  ["Score",     <Num v={sentiment.score as number} digits={3} colored />],
                  ["Bullish %", <Num v={sentiment.bullishPct as number} digits={1} suffix="%" />],
                  ["Bearish %", <Num v={sentiment.bearishPct as number} digits={1} suffix="%" />],
                  ["Articles",  <span className="font-mono">{sentiment.articleCount ?? 0}</span>],
                ].map(([label, el]) => (
                  <div key={String(label)} className="flex justify-between border-b border-border/40 py-1">
                    <span className="text-muted-foreground">{label}</span>
                    {el}
                  </div>
                ))}
              </div>
              {sentiment.latestHeadline && (
                <div className="mt-2 p-2 bg-muted/20 rounded text-xs text-muted-foreground italic">
                  "{String(sentiment.latestHeadline)}"
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="fundamental" className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {[
              ["Sector",       <span className="font-mono text-xs">{String(fund?.sector ?? "—")}</span>],
              ["Industry",     <span className="font-mono text-xs truncate max-w-28">{String(fund?.industry ?? "—")}</span>],
              ["Mkt Cap",      <span className="font-mono text-xs">{fund?.market_cap != null ? `$${(Number(fund.market_cap)/1e9).toFixed(2)}B` : "—"}</span>],
              ["P/E",          <Num v={fund?.pe_ratio as number}          digits={1} />],
              ["Beta",         <Num v={fund?.beta     as number}          digits={2} />],
              ["Short Int.",   <Num v={fund?.short_interest != null ? Number(fund.short_interest)*100 : null} digits={1} suffix="%" />],
              ["Days to Earn.",<Num v={fund?.days_to_earnings as number}  digits={0} />],
              ["EPS Surprise", <Num v={fund?.eps_surprise_pct as number}  digits={1} suffix="%" colored />],
            ].map(([label, el]) => (
              <div key={String(label)} className="flex justify-between border-b border-border/40 py-1">
                <span className="text-muted-foreground">{label}</span>
                {el}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="montecarlo" className="space-y-3 pt-2">
          {mc ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-red-500/10 border border-red-500/20 rounded p-3">
                  <div className="text-xs text-muted-foreground mb-1">Stop</div>
                  <div className="font-mono text-red-400">${mc.stop_price?.toFixed(2)}</div>
                </div>
                <div className="bg-muted/20 border border-border rounded p-3">
                  <div className="text-xs text-muted-foreground mb-1">Entry</div>
                  <div className="font-mono">${mc.entry_price?.toFixed(2)}</div>
                </div>
                <div className="bg-[hsl(var(--go-color))]/10 border border-[hsl(var(--go-color))]/20 rounded p-3">
                  <div className="text-xs text-muted-foreground mb-1">Target</div>
                  <div className="font-mono text-[hsl(var(--go-color))]">${mc.target_price?.toFixed(2)}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {[
                  ["Win Rate",  <span className="font-mono text-[hsl(var(--go-color))]">{(Number(mc.win_rate)*100).toFixed(1)}%</span>],
                  ["Exp. R",   <Num v={mc.expected_R} digits={2} colored />],
                  ["P10",      <span className="font-mono">${mc.p10?.toFixed(2)}</span>],
                  ["P50",      <span className="font-mono">${mc.p50?.toFixed(2)}</span>],
                  ["P90",      <span className="font-mono">${mc.p90?.toFixed(2)}</span>],
                  ["Sims",     <span className="font-mono">{mc.simulations}</span>],
                ].map(([label, el]) => (
                  <div key={String(label)} className="flex justify-between border-b border-border/40 py-1">
                    <span className="text-muted-foreground">{label}</span>
                    {el}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-muted-foreground text-xs">
              Monte Carlo runs for GO and HOLD candidates only.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Results table (shared) ─────────────────────────────────────────────────
function ResultsTable({
  rows,
  onSelect,
}: {
  rows: CandidateRecord[];
  onSelect: (c: CandidateRecord) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border">
          <TableHead>Ticker</TableHead>
          <TableHead>Verdict</TableHead>
          <TableHead>Score</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Chg%</TableHead>
          <TableHead className="text-right">RSI</TableHead>
          <TableHead className="text-right">ADX</TableHead>
          <TableHead className="text-right">RVOL</TableHead>
          <TableHead className="text-right hidden lg:table-cell">Sector</TableHead>
          <TableHead className="text-right hidden lg:table-cell">Reason</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((c) => {
          const tech = (c.technical ?? {}) as Record<string, unknown>;
          const fund = (c.fundamentals ?? {}) as Record<string, unknown>;
          return (
            <TableRow
              key={c.ticker}
              className="border-border cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => onSelect(c)}
            >
              <TableCell className="font-bold font-mono">{c.ticker}</TableCell>
              <TableCell><VerdictBadge verdict={c.verdict} /></TableCell>
              <TableCell><ScoreBar score={c.score} /></TableCell>
              <TableCell className="text-right font-mono">
                {tech.price != null ? `$${Number(tech.price).toFixed(2)}` : "—"}
              </TableCell>
              <TableCell className="text-right">
                {tech.changePct != null
                  ? <Num v={Number(tech.changePct)*100} digits={2} suffix="%" colored />
                  : "—"}
              </TableCell>
              <TableCell className="text-right font-mono">
                {tech.rsi != null ? Number(tech.rsi).toFixed(1) : "—"}
              </TableCell>
              <TableCell className="text-right font-mono">
                {tech.adx != null ? Number(tech.adx).toFixed(1) : "—"}
              </TableCell>
              <TableCell className="text-right font-mono">
                {tech.rvol != null ? Number(tech.rvol).toFixed(2) : "—"}
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground hidden lg:table-cell">
                {String(fund.sector ?? "—")}
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground max-w-48 truncate hidden lg:table-cell">
                {c.reason}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ── Manual scan tab ────────────────────────────────────────────────────────
function ManualScan() {
  const [tickerInput, setTickerInput] = useState("AAPL,MSFT,NVDA,AMZN,TSLA,META,GOOGL,JPM");
  const [selectedWatchlist, setSelectedWatchlist] = useState<string>("none");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [selected, setSelected] = useState<CandidateRecord | null>(null);

  const { data: watchlists } = useListWatchlists();
  const { mutate: runScan, isPending } = useRunScan({
    mutation: { onSuccess: (data) => setResult(data) },
  });

  const handleScan = () => {
    const wl = selectedWatchlist !== "none"
      ? watchlists?.find((w) => w.id === Number(selectedWatchlist))
      : undefined;
    const tickers = wl
      ? wl.tickers
      : tickerInput.split(/[\s,]+/).map((t) => t.trim().toUpperCase()).filter(Boolean);
    runScan({ data: { tickers, computeSectors: false } });
  };

  const allCandidates = result
    ? [...(result.candidates ?? []), ...(result.hold ?? []), ...(result.rejected ?? [])]
    : [];
  const activeProviders = (result as unknown as Record<string, unknown>)?.activeProviders as string[] | undefined;

  return (
    <div className="space-y-5">
      {/* Config card */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider">Configure Scan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase">Tickers</Label>
              <Input
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value)}
                placeholder="AAPL, MSFT, NVDA..."
                className="font-mono text-sm"
                disabled={selectedWatchlist !== "none"}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase">Or Watchlist</Label>
              <Select value={selectedWatchlist} onValueChange={setSelectedWatchlist}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose watchlist..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (use tickers above)</SelectItem>
                  {watchlists?.map((wl) => (
                    <SelectItem key={wl.id} value={String(wl.id)}>
                      {wl.name} ({wl.tickers.length} tickers)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleScan} disabled={isPending} className="w-full font-mono tracking-widest">
            {isPending ? "SCANNING..." : "▶  RUN SCAN"}
          </Button>
        </CardContent>
      </Card>

      {isPending && (
        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-2">
            {[1,2,3,4].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
          </CardContent>
        </Card>
      )}

      {result && !isPending && (
        <>
          <div className="flex items-center justify-between">
            {activeProviders && <ProviderChips providers={activeProviders} />}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "GO",    count: result.candidates.length, cls: "text-[hsl(var(--go-color))]",   card: "bg-[hsl(var(--go-color))]/10 border-[hsl(var(--go-color))]/25", sub: "All gates pass" },
              { label: "HOLD",  count: result.hold.length,       cls: "text-yellow-400",               card: "bg-yellow-500/10 border-yellow-500/25",                          sub: "Partial qualification" },
              { label: "ABORT", count: result.rejected.length,   cls: "text-red-400",                  card: "bg-red-500/10 border-red-500/25",                                sub: "Failed screening" },
            ].map(({ label, count, cls, card, sub }) => (
              <Card key={label} className={card}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={`text-4xl font-bold ${cls}`}>{count}</div>
                  <div>
                    <div className={`text-sm font-bold ${cls}`}>{label}</div>
                    <div className="text-xs text-muted-foreground">{sub}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
                Results — click row to drill down
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ResultsTable rows={allCandidates} onSelect={setSelected} />
            </CardContent>
          </Card>
        </>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-left">Ticker Detail</SheetTitle>
          </SheetHeader>
          {selected && <TickerDetail c={selected} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Screener filter panel ──────────────────────────────────────────────────
interface ScreenerFilters {
  universe: string;
  priceMin: string;
  priceMax: string;
  rsiMin: string;
  rsiMax: string;
  adxMin: string;
  rvolMin: string;
  scoreMin: string;
  verdictFilter: string;
  aboveEma10: boolean;
  aboveSma20: boolean;
  emaStackRequired: boolean;
  breakoutOnly: boolean;
  stochEnabled: boolean;
  stochMin: string;
  stochMax: string;
  macd3mAboveZero: boolean;
  macd3mHistPositive: boolean;
}

const DEFAULT_FILTERS: ScreenerFilters = {
  universe: "sp100",
  priceMin: "1",
  priceMax: "10000",
  rsiMin: "0",
  rsiMax: "100",
  adxMin: "0",
  rvolMin: "0",
  scoreMin: "0",
  verdictFilter: "all",
  aboveEma10: false,
  aboveSma20: false,
  emaStackRequired: false,
  breakoutOnly: false,
  stochEnabled: false,
  stochMin: "0",
  stochMax: "80",
  macd3mAboveZero: false,
  macd3mHistPositive: false,
};

function activeFilterCount(f: ScreenerFilters): number {
  let n = 0;
  if (parseFloat(f.priceMin) > 1)    n++;
  if (parseFloat(f.priceMax) < 10000) n++;
  if (parseFloat(f.rsiMin) > 0)      n++;
  if (parseFloat(f.rsiMax) < 100)    n++;
  if (parseFloat(f.adxMin) > 0)      n++;
  if (parseFloat(f.rvolMin) > 0)     n++;
  if (parseFloat(f.scoreMin) > 0)    n++;
  if (f.verdictFilter !== "all")     n++;
  if (f.aboveEma10)       n++;
  if (f.aboveSma20)       n++;
  if (f.emaStackRequired) n++;
  if (f.breakoutOnly)     n++;
  if (f.stochEnabled)     n++;
  if (f.macd3mAboveZero)  n++;
  if (f.macd3mHistPositive) n++;
  return n;
}

function FilterPanel({
  filters,
  onChange,
}: {
  filters: ScreenerFilters;
  onChange: (f: ScreenerFilters) => void;
}) {
  const set = <K extends keyof ScreenerFilters>(k: K, v: ScreenerFilters[K]) =>
    onChange({ ...filters, [k]: v });

  return (
    <div className="space-y-5 text-sm">
      {/* Universe */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Universe</Label>
        <Select value={filters.universe} onValueChange={(v) => set("universe", v)}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">⚡ All (~300+ tickers)</SelectItem>
            <div className="px-2 py-1 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-1">Broad Indices</div>
            <SelectItem value="sp100">S&amp;P 100</SelectItem>
            <SelectItem value="nasdaq100">Nasdaq 100</SelectItem>
            <SelectItem value="dow30">Dow Jones 30</SelectItem>
            <div className="px-2 py-1 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-1">GICS Sectors</div>
            <SelectItem value="tech">Technology</SelectItem>
            <SelectItem value="finance">Financials</SelectItem>
            <SelectItem value="health">Healthcare</SelectItem>
            <SelectItem value="energy">Energy</SelectItem>
            <SelectItem value="consumer">Consumer</SelectItem>
            <SelectItem value="industrials">Industrials</SelectItem>
            <SelectItem value="utilities">Utilities</SelectItem>
            <SelectItem value="materials">Materials</SelectItem>
            <SelectItem value="realestate">Real Estate / REITs</SelectItem>
            <SelectItem value="comms">Communication Services</SelectItem>
            <div className="px-2 py-1 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-1">Thematic</div>
            <SelectItem value="semis">Semiconductors</SelectItem>
            <SelectItem value="biotech">Biotech</SelectItem>
            <SelectItem value="smallcap">Small Cap</SelectItem>
            <SelectItem value="mags7">Magnificent 7</SelectItem>
            <SelectItem value="aicloud">AI &amp; Cloud</SelectItem>
            <SelectItem value="dividend">Dividend Leaders</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Verdict */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Verdict</Label>
        <Select value={filters.verdictFilter} onValueChange={(v) => set("verdictFilter", v)}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All (GO + HOLD + ABORT)</SelectItem>
            <SelectItem value="go_hold">GO + HOLD</SelectItem>
            <SelectItem value="go">GO only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Price */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Price Range ($)</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Min</Label>
            <Input value={filters.priceMin} onChange={(e) => set("priceMin", e.target.value)}
              className="h-8 font-mono text-xs" placeholder="1" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Max</Label>
            <Input value={filters.priceMax} onChange={(e) => set("priceMax", e.target.value)}
              className="h-8 font-mono text-xs" placeholder="10000" />
          </div>
        </div>
      </div>

      {/* RSI */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">RSI (14)</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Min</Label>
            <Input value={filters.rsiMin} onChange={(e) => set("rsiMin", e.target.value)}
              className="h-8 font-mono text-xs" placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Max</Label>
            <Input value={filters.rsiMax} onChange={(e) => set("rsiMax", e.target.value)}
              className="h-8 font-mono text-xs" placeholder="100" />
          </div>
        </div>
      </div>

      {/* ADX + RVOL + Score */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground uppercase">ADX Min</Label>
          <Input value={filters.adxMin} onChange={(e) => set("adxMin", e.target.value)}
            className="h-8 font-mono text-xs" placeholder="0" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground uppercase">RVOL Min</Label>
          <Input value={filters.rvolMin} onChange={(e) => set("rvolMin", e.target.value)}
            className="h-8 font-mono text-xs" placeholder="0" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground uppercase">Min Score %</Label>
        <Input value={filters.scoreMin} onChange={(e) => set("scoreMin", e.target.value)}
          className="h-8 font-mono text-xs" placeholder="0" />
      </div>

      <Separator />

      {/* Trend conditions */}
      <div className="space-y-3">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Trend Conditions</div>
        {[
          { key: "aboveEma10"       as const, label: "Price > EMA 10",           sub: "Short-term momentum" },
          { key: "aboveSma20"       as const, label: "Price > SMA 20",           sub: "Medium-term trend" },
          { key: "emaStackRequired" as const, label: "EMA Stack (9>21>50)",      sub: "Full bull alignment" },
          { key: "breakoutOnly"     as const, label: "20-Day Breakout",          sub: "Closing above 20-day high" },
        ].map(({ key, label, sub }) => (
          <div key={key} className="flex items-center justify-between">
            <div>
              <div className="text-sm">{label}</div>
              <div className="text-xs text-muted-foreground">{sub}</div>
            </div>
            <Switch checked={Boolean(filters[key])} onCheckedChange={(v) => set(key, v)} />
          </div>
        ))}
      </div>

      <Separator />

      {/* Stochastic */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Stochastic Range</div>
            <div className="text-xs text-muted-foreground">Filter by Slow %K value</div>
          </div>
          <Switch checked={filters.stochEnabled} onCheckedChange={(v) => set("stochEnabled", v)} />
        </div>
        {filters.stochEnabled && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">%K Min</Label>
              <Input value={filters.stochMin} onChange={(e) => set("stochMin", e.target.value)}
                className="h-8 font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">%K Max</Label>
              <Input value={filters.stochMax} onChange={(e) => set("stochMax", e.target.value)}
                className="h-8 font-mono text-xs" />
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* 3M MACD */}
      <div className="space-y-3">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">3-Month MACD</div>
        {[
          { key: "macd3mAboveZero"   as const, label: "MACD Line > 0",          sub: "Bullish momentum" },
          { key: "macd3mHistPositive"as const, label: "Histogram Positive",     sub: "Accelerating upward" },
        ].map(({ key, label, sub }) => (
          <div key={key} className="flex items-center justify-between">
            <div>
              <div className="text-sm">{label}</div>
              <div className="text-xs text-muted-foreground">{sub}</div>
            </div>
            <Switch checked={Boolean(filters[key])} onCheckedChange={(v) => set(key, v)} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Screener tab ───────────────────────────────────────────────────────────
function Screener() {
  const [filters, setFilters] = useState<ScreenerFilters>(DEFAULT_FILTERS);
  const [activeFilters, setActiveFilters] = useState<ScreenerFilters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<CandidateRecord | null>(null);
  const [bust, setBust] = useState(false);

  const buildParams = useCallback((f: ScreenerFilters, bustCache: boolean): RunScreenerParams => ({
    universe: f.universe as RunScreenerParams["universe"],
    priceMin: parseFloat(f.priceMin) || 1,
    priceMax: parseFloat(f.priceMax) || 10000,
    rsiMin:   parseFloat(f.rsiMin)   || 0,
    rsiMax:   parseFloat(f.rsiMax)   || 100,
    adxMin:   parseFloat(f.adxMin)   || 0,
    rvolMin:  parseFloat(f.rvolMin)  || 0,
    scoreMin: parseFloat(f.scoreMin) / 100 || 0,
    verdictFilter: f.verdictFilter as RunScreenerParams["verdictFilter"],
    aboveEma10:       f.aboveEma10       || undefined,
    aboveSma20:       f.aboveSma20       || undefined,
    emaStackRequired: f.emaStackRequired || undefined,
    breakoutOnly:     f.breakoutOnly     || undefined,
    stochMin: f.stochEnabled ? parseFloat(f.stochMin) : undefined,
    stochMax: f.stochEnabled ? parseFloat(f.stochMax) : undefined,
    macd3mAboveZero:   f.macd3mAboveZero   || undefined,
    macd3mHistPositive: f.macd3mHistPositive || undefined,
    bust: bustCache || undefined,
  }), []);

  const screenerParams = buildParams(activeFilters, bust);
  const { data, isFetching, refetch } = useRunScreener(screenerParams, {
    query: {
      queryKey: ["screener", screenerParams],
      enabled: true,
      staleTime: 4 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  });

  const handleRun = () => {
    setBust(false);
    setActiveFilters(filters);
  };

  const handleRefresh = () => {
    setBust(true);
    setActiveFilters({ ...filters });
  };

  const filterCount = activeFilterCount(filters);
  const results = (data?.results ?? []) as CandidateRecord[];

  return (
    <div className="flex gap-5 h-full">
      {/* ── Left filter panel ─────────────────────────────────────────── */}
      <div className="w-64 flex-shrink-0">
        <Card className="bg-card border-border sticky top-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm uppercase tracking-wider flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {filterCount > 0 && (
                <Badge variant="secondary" className="ml-auto text-xs">{filterCount}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[calc(100vh-220px)] overflow-y-auto pr-2 space-y-0">
            <FilterPanel filters={filters} onChange={setFilters} />
          </CardContent>
          <div className="p-4 pt-0 space-y-2">
            <Button onClick={handleRun} disabled={isFetching} className="w-full font-mono tracking-widest h-9">
              {isFetching ? "SCANNING..." : "▶  FIND STOCKS"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}
              className="w-full text-xs gap-1.5">
              <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
              Refresh Universe Data
            </Button>
          </div>
        </Card>
      </div>

      {/* ── Right results panel ────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Stats bar */}
        {data && !isFetching && (
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1 text-xs border border-blue-500/40 text-blue-400 rounded px-1.5 py-0.5 font-mono">
              YF
            </span>
            <span>
              <span className="text-foreground font-semibold">{data.total}</span> match{data.total !== 1 ? "es" : ""}
            </span>
            <span className="text-border">|</span>
            <span>
              {(data as unknown as Record<string, unknown>).validData as number ?? data.scanned} valid
              <span className="text-border mx-1">/</span>
              {data.scanned} scanned
            </span>
            <span className="text-border">|</span>
            <span>cached {new Date(data.cachedAt).toLocaleTimeString()}</span>
            <div className="ml-auto flex gap-2 text-xs">
              {(["GO","HOLD","ABORT"] as const).map((v) => {
                const cnt = results.filter((r) => r.verdict === v).length;
                const cls = v === "GO" ? "text-[hsl(var(--go-color))]" : v === "HOLD" ? "text-yellow-400" : "text-red-400";
                return (
                  <span key={v} className={cls}>
                    {v} <span className="font-bold">{cnt}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Loading skeletons */}
        {isFetching && (
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-2">
              <div className="text-xs text-muted-foreground mb-3 font-mono animate-pulse">
                Scanning universe... this may take 10-20s on first load
              </div>
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {!isFetching && data && results.length === 0 && (
          <Card className="bg-card border-border">
            <CardContent className="py-16 text-center">
              <Filter className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <div className="text-muted-foreground text-sm">No stocks matched your filters.</div>
              <div className="text-muted-foreground text-xs mt-1">Try loosening the criteria or choosing a broader universe.</div>
            </CardContent>
          </Card>
        )}

        {/* Initial state */}
        {!isFetching && !data && (
          <Card className="bg-card border-border">
            <CardContent className="py-16 text-center">
              <BarChart2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <div className="text-muted-foreground text-sm">Set your filters and click <span className="font-semibold text-foreground">Find Stocks</span>.</div>
              <div className="text-muted-foreground text-xs mt-1">
                First run scans the full universe (~10-20s). Results cache for 5 minutes.
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {!isFetching && results.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
                Matching stocks — click row to drill down
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ResultsTable rows={results} onSelect={setSelected} />
            </CardContent>
          </Card>
        )}
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-left">Ticker Detail</SheetTitle>
          </SheetHeader>
          {selected && <TickerDetail c={selected} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Main "Stock Finder" page ───────────────────────────────────────────────
export function Scanner() {
  return (
    <div className="p-6 space-y-5">
      <h1 className="text-2xl font-bold">Stock Finder</h1>

      <Tabs defaultValue="screener" className="w-full">
        <TabsList className="mb-5">
          <TabsTrigger value="screener" className="gap-2">
            <Filter className="h-3.5 w-3.5" />
            Screener
          </TabsTrigger>
          <TabsTrigger value="manual" className="gap-2">
            <BarChart2 className="h-3.5 w-3.5" />
            Manual Scan
          </TabsTrigger>
        </TabsList>

        <TabsContent value="screener">
          <Screener />
        </TabsContent>

        <TabsContent value="manual">
          <ManualScan />
        </TabsContent>
      </Tabs>
    </div>
  );
}
