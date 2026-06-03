import { useState } from "react";
import { useListScanHistory, useGetScanHistory } from "@workspace/api-client-react";
import type { ScanHistoryItem, CandidateRecord } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChevronRight } from "lucide-react";
import { formatPercent } from "@/lib/format";

const PAGE_SIZE = 25;

function VerdictBadge({ verdict }: { verdict: string }) {
  const colors: Record<string, string> = {
    GO: "bg-[hsl(var(--go-color))]/20 text-[hsl(var(--go-color))] border-[hsl(var(--go-color))]/30",
    HOLD: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    ABORT: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-xs font-bold ${colors[verdict] ?? "bg-muted text-muted-foreground"}`}>
      {verdict}
    </span>
  );
}

function ScanDetail({ id }: { id: number }) {
  const { data, isLoading } = useGetScanHistory(id);
  if (isLoading) return <div className="space-y-2 p-4">{[1,2,3].map((i) => <Skeleton key={i} className="h-8" />)}</div>;

  const payload = data?.payload as { candidates?: CandidateRecord[]; hold?: CandidateRecord[]; rejected?: CandidateRecord[] } | null;
  const all = [
    ...(payload?.candidates ?? []),
    ...(payload?.hold ?? []),
    ...(payload?.rejected ?? []),
  ];

  return (
    <div className="space-y-4 p-4">
      {data?.regime && (
        <div className="text-sm text-muted-foreground">
          Regime: <span className="text-foreground font-mono">{data.regime}</span>
        </div>
      )}
      <div className="flex gap-3 text-sm">
        <span className="text-[hsl(var(--go-color))]">{data?.goCount ?? 0} GO</span>
        <span className="text-yellow-400">{data?.holdCount ?? 0} HOLD</span>
        <span className="text-red-400">{data?.rejectCount ?? 0} ABORT</span>
        <span className="text-muted-foreground">{data?.tickerCount ?? 0} total</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="border-border">
            <TableHead>Ticker</TableHead>
            <TableHead>Verdict</TableHead>
            <TableHead className="text-right">Score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {all.map((c) => (
            <TableRow key={c.ticker} className="border-border">
              <TableCell className="font-bold">{c.ticker}</TableCell>
              <TableCell><VerdictBadge verdict={c.verdict} /></TableCell>
              <TableCell className="text-right font-mono">{formatPercent(c.score)}</TableCell>
            </TableRow>
          ))}
          {!all.length && (
            <TableRow>
              <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">No payload data</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function History() {
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, isLoading } = useListScanHistory({ limit: PAGE_SIZE, offset });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Scan History</h1>
        <span className="text-sm text-muted-foreground">{total} total scans</span>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Date</TableHead>
                  <TableHead>Regime</TableHead>
                  <TableHead className="text-right">Tickers</TableHead>
                  <TableHead className="text-right">GO</TableHead>
                  <TableHead className="text-right">HOLD</TableHead>
                  <TableHead className="text-right">ABORT</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item: ScanHistoryItem) => (
                  <TableRow
                    key={item.id}
                    className="border-border cursor-pointer hover:bg-muted/20"
                    onClick={() => setSelectedId(item.id)}
                  >
                    <TableCell className="font-mono text-xs">
                      {new Date(item.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {item.regime ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">{item.tickerCount}</TableCell>
                    <TableCell className="text-right text-[hsl(var(--go-color))] font-mono">{item.goCount}</TableCell>
                    <TableCell className="text-right text-yellow-400 font-mono">{item.holdCount}</TableCell>
                    <TableCell className="text-right text-red-400 font-mono">{item.rejectCount}</TableCell>
                    <TableCell className="text-right">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
                {!items.length && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No scan history yet. Run a scan to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setOffset((o) => o + PAGE_SIZE)}>
            Next
          </Button>
        </div>
      )}

      <Sheet open={selectedId !== null} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="w-full sm:w-[480px] sm:max-w-[480px]">
          <SheetHeader>
            <SheetTitle>Scan Detail</SheetTitle>
          </SheetHeader>
          {selectedId !== null && <ScanDetail id={selectedId} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
