import { useState } from "react";
import { useRunScan, useListWatchlists } from "@workspace/api-client-react";
import type { ScanResult, CandidateRecord } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPercent } from "@/lib/format";

function VerdictBadge({ verdict }: { verdict: string }) {
  const colors: Record<string, string> = {
    GO: "bg-[hsl(var(--go-color))]/20 text-[hsl(var(--go-color))] border-[hsl(var(--go-color))]/30",
    HOLD: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    ABORT: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold ${colors[verdict] ?? "bg-muted text-muted-foreground"}`}>
      {verdict}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-[hsl(var(--go-color))] rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs w-10 text-right">{formatPercent(score)}</span>
    </div>
  );
}

export function Scanner() {
  const [tickerInput, setTickerInput] = useState("AAPL,MSFT,NVDA,AMZN,TSLA");
  const [selectedWatchlist, setSelectedWatchlist] = useState<string>("none");
  const [result, setResult] = useState<ScanResult | null>(null);

  const { data: watchlists } = useListWatchlists();
  const { mutate: runScan, isPending } = useRunScan({
    mutation: {
      onSuccess: (data) => setResult(data),
    },
  });

  const handleScan = () => {
    const wl = selectedWatchlist !== "none"
      ? watchlists?.find((w) => w.id === Number(selectedWatchlist))
      : undefined;
    const tickers = wl
      ? wl.tickers
      : tickerInput
          .split(/[\s,]+/)
          .map((t) => t.trim().toUpperCase())
          .filter(Boolean);
    runScan({ data: { tickers } });
  };

  const allCandidates = result
    ? [...(result.candidates ?? []), ...(result.hold ?? []), ...(result.rejected ?? [])]
    : [];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Scanner</h1>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider">Configure Scan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase">Tickers (comma-separated)</Label>
              <Input
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value)}
                placeholder="AAPL, MSFT, NVDA..."
                className="font-mono"
                disabled={selectedWatchlist !== "none"}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase">Or select watchlist</Label>
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
          <Button onClick={handleScan} disabled={isPending} className="w-full">
            {isPending ? "Scanning..." : "Run Scan"}
          </Button>
        </CardContent>
      </Card>

      {isPending && (
        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </CardContent>
        </Card>
      )}

      {result && !isPending && (
        <>
          <div className="grid grid-cols-3 gap-4 text-center">
            <Card className="bg-[hsl(var(--go-color))]/10 border-[hsl(var(--go-color))]/20">
              <CardContent className="p-4">
                <div className="text-3xl font-bold text-[hsl(var(--go-color))]">
                  {result.candidates.length}
                </div>
                <div className="text-xs text-muted-foreground uppercase mt-1">GO</div>
              </CardContent>
            </Card>
            <Card className="bg-yellow-500/10 border-yellow-500/20">
              <CardContent className="p-4">
                <div className="text-3xl font-bold text-yellow-400">
                  {result.hold.length}
                </div>
                <div className="text-xs text-muted-foreground uppercase mt-1">HOLD</div>
              </CardContent>
            </Card>
            <Card className="bg-red-500/10 border-red-500/20">
              <CardContent className="p-4">
                <div className="text-3xl font-bold text-red-400">
                  {result.rejected.length}
                </div>
                <div className="text-xs text-muted-foreground uppercase mt-1">ABORT</div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-wider">Results</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead>Ticker</TableHead>
                    <TableHead>Verdict</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>RSI</TableHead>
                    <TableHead>ADX</TableHead>
                    <TableHead>Vol Ratio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allCandidates.map((c: CandidateRecord) => {
                    const ind = c.indicators as Record<string, number> | null;
                    return (
                      <TableRow key={c.ticker} className="border-border">
                        <TableCell className="font-bold">{c.ticker}</TableCell>
                        <TableCell><VerdictBadge verdict={c.verdict} /></TableCell>
                        <TableCell className="min-w-32"><ScoreBar score={c.score} /></TableCell>
                        <TableCell className="font-mono">${ind?.price?.toFixed(2) ?? "—"}</TableCell>
                        <TableCell className="font-mono">{ind?.rsi?.toFixed(1) ?? "—"}</TableCell>
                        <TableCell className="font-mono">{ind?.adx?.toFixed(1) ?? "—"}</TableCell>
                        <TableCell className="font-mono">{ind?.volumeRatio?.toFixed(2) ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
