import { useState } from "react";
import { useRunScan, useListWatchlists } from "@workspace/api-client-react";
import type { ScanResult, CandidateRecord } from "@workspace/api-client-react";
import { TickerChart } from "@/components/TickerChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatPercent, formatCurrency } from "@/lib/format";

// ── Verdict badge ──────────────────────────────────────────────────────────
function VerdictBadge({ verdict }: { verdict: string }) {
  const styles: Record<string, string> = {
    GO: "bg-[hsl(var(--go-color))]/20 text-[hsl(var(--go-color))] border-[hsl(var(--go-color))]/40",
    HOLD: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
    ABORT: "bg-red-500/20 text-red-400 border-red-500/40",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold tracking-wide ${styles[verdict] ?? "bg-muted text-muted-foreground"}`}>
      {verdict}
    </span>
  );
}

// ── Score bar ──────────────────────────────────────────────────────────────
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

// ── Provider chips ─────────────────────────────────────────────────────────
function ProviderChips({ providers }: { providers?: string[] }) {
  if (!providers?.length) return null;
  const labels: Record<string, string> = { yahoo_finance: "YF", polygon: "POLY", finnhub: "FH" };
  const colors: Record<string, string> = {
    yahoo_finance: "border-blue-500/40 text-blue-400",
    polygon: "border-purple-500/40 text-purple-400",
    finnhub: "border-orange-500/40 text-orange-400",
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

// ── Numeric cell ──────────────────────────────────────────────────────────
function Num({ v, digits = 1, suffix = "", colored = false }: { v: number | null | undefined; digits?: number; suffix?: string; colored?: boolean }) {
  if (v == null) return <span className="text-muted-foreground">—</span>;
  const text = `${v.toFixed(digits)}${suffix}`;
  if (!colored) return <span className="font-mono">{text}</span>;
  const pos = v >= 0;
  return <span className={`font-mono ${pos ? "text-[hsl(var(--go-color))]" : "text-red-400"}`}>{pos ? "+" : ""}{text}</span>;
}

// ── Ticker detail sheet ────────────────────────────────────────────────────
function TickerDetail({ c }: { c: CandidateRecord }) {
  const tech = c.technical as Record<string, number | boolean> | null;
  const flow = c.flow as Record<string, number | boolean> | null;
  const fund = c.fundamentals as Record<string, number | string | null> | null;
  const mc = c.monteCarlo as Record<string, number> | null;
  const options = c.options as Record<string, number | boolean | null> | null;
  const sentiment = c.sentiment as Record<string, number | string | null> | null;

  return (
    <div className="space-y-4 p-1 text-sm">
      <div className="flex items-center gap-3">
        <span className="text-2xl font-bold">{c.ticker}</span>
        <VerdictBadge verdict={c.verdict} />
        {tech?.price != null && (
          <span className="font-mono text-muted-foreground">${Number(tech.price).toFixed(2)}</span>
        )}
        {tech?.changePct != null && (
          <Num v={Number(tech.changePct) * 100} digits={2} suffix="%" colored />
        )}
      </div>
      <div className="text-xs text-muted-foreground">{c.reason}</div>

      <Tabs defaultValue="chart">
        <TabsList className="w-full">
          <TabsTrigger value="chart" className="flex-1">Chart</TabsTrigger>
          <TabsTrigger value="technical" className="flex-1">Technical</TabsTrigger>
          <TabsTrigger value="options" className="flex-1">Options</TabsTrigger>
          <TabsTrigger value="fundamental" className="flex-1">Fundamentals</TabsTrigger>
          <TabsTrigger value="montecarlo" className="flex-1">MC</TabsTrigger>
        </TabsList>

        <TabsContent value="chart" className="pt-2">
          <TickerChart ticker={c.ticker} />
        </TabsContent>

        <TabsContent value="technical" className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {[
              ["RSI(14)", tech?.rsi, 1],
              ["ADX(14)", tech?.adx, 1],
              ["RVOL", tech?.rvol, 2],
              ["ATR %", tech?.atr_pct != null ? Number(tech.atr_pct) * 100 : null, 2],
              ["Stoch %K", tech?.stochK, 1],
              ["MACD Hist", tech?.macdHist, 4],
              ["EMA9", tech?.ema9, 2],
              ["EMA21", tech?.ema21, 2],
              ["EMA50", tech?.ema50, 2],
              ["EMA200", tech?.ema200, 2],
              ["Vol $M", tech?.dollar_volume != null ? Number(tech.dollar_volume) / 1_000_000 : null, 1],
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
            <div className="flex justify-between border-b border-border/40 py-1">
              <span className="text-muted-foreground">52W High</span>
              <span className={tech?.breakout52w ? "text-[hsl(var(--go-color))]" : "text-muted-foreground"}>
                {tech?.breakout52w ? "NEAR" : "—"}
              </span>
            </div>
          </div>

          {flow && (
            <div className="mt-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Flow</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">RS vs SPY</span>
                  <Num v={Number(flow.rel_strength_spy) * 100} digits={2} suffix="%" colored />
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
          {options && options.ok ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <div className="flex justify-between border-b border-border/40 py-1">
                <span className="text-muted-foreground">Flow Score</span>
                <ScoreBar score={Number(options.flowScore)} width="w-20" />
              </div>
              <div className="flex justify-between border-b border-border/40 py-1">
                <span className="text-muted-foreground">Put/Call Ratio</span>
                <Num v={options.putCallRatio as number | null} digits={2} />
              </div>
              <div className="flex justify-between border-b border-border/40 py-1">
                <span className="text-muted-foreground">Impl. Vol.</span>
                <Num v={options.impliedVolatility != null ? Number(options.impliedVolatility) * 100 : null} digits={1} suffix="%" />
              </div>
              <div className="flex justify-between border-b border-border/40 py-1">
                <span className="text-muted-foreground">Call Volume</span>
                <Num v={options.callVolume as number | null} digits={0} />
              </div>
              <div className="flex justify-between border-b border-border/40 py-1">
                <span className="text-muted-foreground">Put Volume</span>
                <Num v={options.putVolume as number | null} digits={0} />
              </div>
              <div className="flex justify-between border-b border-border/40 py-1">
                <span className="text-muted-foreground">Unusual Activity</span>
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
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">Score</span>
                  <Num v={sentiment.score as number | null} digits={3} colored />
                </div>
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">Bullish %</span>
                  <Num v={sentiment.bullishPct as number | null} digits={1} suffix="%" />
                </div>
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">Bearish %</span>
                  <Num v={sentiment.bearishPct as number | null} digits={1} suffix="%" />
                </div>
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">Articles</span>
                  <span className="font-mono">{sentiment.articleCount ?? 0}</span>
                </div>
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
            <div className="flex justify-between border-b border-border/40 py-1">
              <span className="text-muted-foreground">Sector</span>
              <span className="font-mono text-xs">{String(fund?.sector ?? "—")}</span>
            </div>
            <div className="flex justify-between border-b border-border/40 py-1">
              <span className="text-muted-foreground">Industry</span>
              <span className="font-mono text-xs truncate max-w-28">{String(fund?.industry ?? "—")}</span>
            </div>
            <div className="flex justify-between border-b border-border/40 py-1">
              <span className="text-muted-foreground">Mkt Cap</span>
              <span className="font-mono text-xs">
                {fund?.market_cap != null ? `$${(Number(fund.market_cap) / 1e9).toFixed(2)}B` : "—"}
              </span>
            </div>
            <div className="flex justify-between border-b border-border/40 py-1">
              <span className="text-muted-foreground">P/E Ratio</span>
              <Num v={fund?.pe_ratio as number | null} digits={1} />
            </div>
            <div className="flex justify-between border-b border-border/40 py-1">
              <span className="text-muted-foreground">Beta</span>
              <Num v={fund?.beta as number | null} digits={2} />
            </div>
            <div className="flex justify-between border-b border-border/40 py-1">
              <span className="text-muted-foreground">Short Int.</span>
              <Num v={fund?.short_interest != null ? Number(fund.short_interest) * 100 : null} digits={1} suffix="%" />
            </div>
            <div className="flex justify-between border-b border-border/40 py-1">
              <span className="text-muted-foreground">Days to Earn.</span>
              <Num v={fund?.days_to_earnings as number | null} digits={0} />
            </div>
            <div className="flex justify-between border-b border-border/40 py-1">
              <span className="text-muted-foreground">EPS Surprise</span>
              <Num v={fund?.eps_surprise_pct as number | null} digits={1} suffix="%" colored />
            </div>
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
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">Win Rate</span>
                  <span className="font-mono text-[hsl(var(--go-color))]">{(Number(mc.win_rate) * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">Expected R</span>
                  <Num v={mc.expected_R as number} digits={2} colored />
                </div>
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">P10 Price</span>
                  <span className="font-mono">${mc.p10?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">P50 Price</span>
                  <span className="font-mono">${mc.p50?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">P90 Price</span>
                  <span className="font-mono">${mc.p90?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">Simulations</span>
                  <span className="font-mono">{mc.simulations}</span>
                </div>
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

// ── Main Scanner page ──────────────────────────────────────────────────────
export function Scanner() {
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

  const activeProviders = (result as any)?.activeProviders as string[] | undefined;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Scanner</h1>
        {activeProviders && <ProviderChips providers={activeProviders} />}
      </div>

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
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
          </CardContent>
        </Card>
      )}

      {result && !isPending && (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="bg-[hsl(var(--go-color))]/10 border-[hsl(var(--go-color))]/25">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="text-4xl font-bold text-[hsl(var(--go-color))]">{result.candidates.length}</div>
                <div>
                  <div className="text-sm font-bold text-[hsl(var(--go-color))]">GO</div>
                  <div className="text-xs text-muted-foreground">All gates pass</div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-yellow-500/10 border-yellow-500/25">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="text-4xl font-bold text-yellow-400">{result.hold.length}</div>
                <div>
                  <div className="text-sm font-bold text-yellow-400">HOLD</div>
                  <div className="text-xs text-muted-foreground">Partial qualification</div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-red-500/10 border-red-500/25">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="text-4xl font-bold text-red-400">{result.rejected.length}</div>
                <div>
                  <div className="text-sm font-bold text-red-400">ABORT</div>
                  <div className="text-xs text-muted-foreground">Failed screening</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Results table */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Results — click row to drill down</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
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
                    <TableHead className="text-right">IV%</TableHead>
                    <TableHead className="text-right">Sent.</TableHead>
                    <TableHead className="text-right">Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allCandidates.map((c: CandidateRecord) => {
                    const tech = c.technical as Record<string, number | boolean> | null;
                    const options = c.options as Record<string, number | boolean | null> | null;
                    const sentiment = c.sentiment as Record<string, number | null> | null;
                    const isGo = c.verdict === "GO";
                    return (
                      <TableRow
                        key={c.ticker}
                        className="border-border cursor-pointer hover:bg-muted/20 transition-colors"
                        onClick={() => setSelected(c)}
                      >
                        <TableCell className={`font-bold ${isGo ? "text-[hsl(var(--go-color))]" : ""}`}>{c.ticker}</TableCell>
                        <TableCell><VerdictBadge verdict={c.verdict} /></TableCell>
                        <TableCell className="min-w-28"><ScoreBar score={c.score} /></TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {tech?.price != null ? `$${Number(tech.price).toFixed(2)}` : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Num v={tech?.changePct != null ? Number(tech.changePct) * 100 : null} digits={2} suffix="%" colored />
                        </TableCell>
                        <TableCell className="text-right">
                          <Num v={tech?.rsi as number | null} digits={1} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Num v={tech?.adx as number | null} digits={1} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Num v={tech?.rvol as number | null} digits={2} />
                        </TableCell>
                        <TableCell className="text-right">
                          {options?.impliedVolatility != null
                            ? <span className="font-mono text-xs">{(Number(options.impliedVolatility) * 100).toFixed(0)}%</span>
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Num v={sentiment?.score as number | null} digits={2} colored />
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground max-w-32 truncate">
                          {c.reason}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Ticker drill-down sheet */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-[500px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Ticker Analysis</SheetTitle>
          </SheetHeader>
          {selected && <TickerDetail c={selected} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
