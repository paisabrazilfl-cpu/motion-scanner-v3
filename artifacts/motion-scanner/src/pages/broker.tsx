import { useGetBrokerAccount, useGetBrokerPositions, useExecuteTrades } from "@workspace/api-client-react";
import type { Position } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatPercent } from "@/lib/format";
import { TrendingUp, TrendingDown, RefreshCw } from "lucide-react";

export function Broker() {
  const { data: account, isLoading: accountLoading, error: accountError } = useGetBrokerAccount();
  const { data: positions, isLoading: posLoading } = useGetBrokerPositions();
  const { mutate: execute, isPending: executing } = useExecuteTrades({
    mutation: { onSuccess: () => {} },
  });

  const isLoading = accountLoading || posLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (accountError) {
    return (
      <div className="p-6">
        <div className="text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded p-4">
          <p className="font-bold mb-1">Broker not connected</p>
          <p className="text-sm">Configure your Alpaca API keys in Settings to connect to paper trading.</p>
        </div>
      </div>
    );
  }

  const totalPnl = positions?.reduce((sum, p) => sum + (p.unrealizedPl ?? 0), 0) ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Broker</h1>
        <Badge variant="outline" className="text-[hsl(var(--go-color))] border-[hsl(var(--go-color))]/30">
          Paper Trading
        </Badge>
      </div>

      {account && (
        <div className="grid grid-cols-4 gap-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Portfolio Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-mono">{formatCurrency(account.portfolioValue)}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Buying Power</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-mono">{formatCurrency(account.buyingPower)}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Cash</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-mono">{formatCurrency(account.cash)}</div>
            </CardContent>
          </Card>
          <Card className={`border ${totalPnl >= 0 ? "bg-[hsl(var(--go-color))]/10 border-[hsl(var(--go-color))]/20" : "bg-red-500/10 border-red-500/20"}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Unrealized P&L</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-mono flex items-center gap-1 ${totalPnl >= 0 ? "text-[hsl(var(--go-color))]" : "text-red-400"}`}>
                {totalPnl >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                {totalPnl >= 0 ? "+" : ""}{formatCurrency(totalPnl)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm uppercase tracking-wider">Positions</CardTitle>
          <Button
            size="sm"
            variant="outline"
            disabled={executing}
            onClick={() => execute({ data: { candidates: [], dryRun: true } })}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${executing ? "animate-spin" : ""}`} />
            Dry Run
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead>Symbol</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Entry</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">Market Value</TableHead>
                <TableHead className="text-right">P&L</TableHead>
                <TableHead className="text-right">P&L %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions?.map((p: Position) => {
                const plPct = p.unrealizedPlPct ?? 0;
                const positive = (p.unrealizedPl) >= 0;
                return (
                  <TableRow key={p.symbol} className="border-border">
                    <TableCell className="font-bold">{p.symbol}</TableCell>
                    <TableCell className="text-right font-mono">{p.qty}</TableCell>
                    <TableCell className="text-right font-mono">{p.entryPrice !== undefined ? formatCurrency(p.entryPrice) : "—"}</TableCell>
                    <TableCell className="text-right font-mono">{p.currentPrice !== undefined ? formatCurrency(p.currentPrice) : "—"}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(p.marketValue)}</TableCell>
                    <TableCell className={`text-right font-mono ${positive ? "text-[hsl(var(--go-color))]" : "text-red-400"}`}>
                      {positive ? "+" : ""}{formatCurrency(p.unrealizedPl)}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${positive ? "text-[hsl(var(--go-color))]" : "text-red-400"}`}>
                      {positive ? "+" : ""}{formatPercent(plPct)}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!positions?.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No open positions
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
