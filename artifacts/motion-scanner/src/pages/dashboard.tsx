import { useGetDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatPercent } from "@/lib/format";

export function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();

  if (isLoading) {
    return <div className="p-6 space-y-4">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>;
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold font-sans">Dashboard</h1>
      
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Total Scans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono">{formatNumber(summary?.totalScans ?? 0)}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Avg GO Count</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono text-[hsl(var(--go-color))]">{formatNumber(summary?.avgGoCount ?? 0)}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Avg Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono">{formatPercent(summary?.avgScore ?? 0)}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Last Regime</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono truncate">{summary?.lastRegime || 'N/A'}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wider">Top Tickers</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Ticker</TableHead>
                  <TableHead className="text-right">GO Count</TableHead>
                  <TableHead className="text-right">Avg Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary?.topTickers?.map((t) => (
                  <TableRow key={t.ticker} className="border-border">
                    <TableCell className="font-bold">{t.ticker}</TableCell>
                    <TableCell className="text-right text-[hsl(var(--go-color))]">{t.goCount}</TableCell>
                    <TableCell className="text-right">{formatPercent(t.avgScore)}</TableCell>
                  </TableRow>
                ))}
                {!summary?.topTickers?.length && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-4">No top tickers</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
