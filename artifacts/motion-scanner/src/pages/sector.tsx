import { useGetSectorRotation } from "@workspace/api-client-react";
import type { SectorEntry } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatPercent } from "@/lib/format";

function ChangeBar({ value }: { value: number }) {
  const positive = value >= 0;
  const pct = Math.min(100, Math.abs(value) * 200);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${positive ? "bg-[hsl(var(--go-color))]" : "bg-red-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs w-14 text-right font-mono ${positive ? "text-[hsl(var(--go-color))]" : "text-red-400"}`}>
        {positive ? "+" : ""}{formatPercent(value)}
      </span>
    </div>
  );
}

export function SectorRotation() {
  const { data, isLoading, error } = useGetSectorRotation();

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-400 bg-red-500/10 border border-red-500/20 rounded p-4">
          Failed to load sector data. Ensure Yahoo Finance is accessible.
        </div>
      </div>
    );
  }

  const sectors = data?.sectors ?? [];
  const leaders = data?.leaders ?? [];
  const laggards = data?.laggards ?? [];
  const regime = data?.regime ?? "Unknown";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sector Rotation</h1>
        <div className="flex gap-4 text-sm items-center">
          <div className="text-muted-foreground">
            Regime: <span className="text-foreground font-mono font-bold">{regime}</span>
          </div>
          {data?.cyclicalRs !== undefined && data.cyclicalRs !== null && (
            <div className="text-muted-foreground">
              Cyclical RS: <span className="font-mono">{data.cyclicalRs.toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>

      {(leaders.length > 0 || laggards.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          <Card className="bg-[hsl(var(--go-color))]/5 border-[hsl(var(--go-color))]/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider text-[hsl(var(--go-color))]">Leaders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {leaders.map((s) => (
                  <Badge key={s.etf} className="bg-[hsl(var(--go-color))]/20 text-[hsl(var(--go-color))] border-[hsl(var(--go-color))]/30 font-mono">
                    {s.etf}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-red-500/5 border-red-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider text-red-400">Laggards</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {laggards.map((s) => (
                  <Badge key={s.etf} className="bg-red-500/20 text-red-400 border-red-500/30 font-mono">
                    {s.etf}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider">All Sectors</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs text-muted-foreground uppercase tracking-wider">Sector</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground uppercase tracking-wider w-40">1D Ret</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground uppercase tracking-wider w-40">5D Ret</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground uppercase tracking-wider">20D Ret</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground uppercase tracking-wider">RS 1D</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground uppercase tracking-wider">RS 5D</th>
                <th className="text-center px-4 py-3 text-xs text-muted-foreground uppercase tracking-wider">Signal</th>
              </tr>
            </thead>
            <tbody>
              {sectors.map((s: SectorEntry) => (
                <tr key={s.etf} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{s.etf}</div>
                  </td>
                  <td className="px-4 py-3"><ChangeBar value={s.ret1d} /></td>
                  <td className="px-4 py-3"><ChangeBar value={s.ret5d} /></td>
                  <td className="px-4 py-3 text-right font-mono">
                    <span className={s.ret20d >= 0 ? "text-[hsl(var(--go-color))]" : "text-red-400"}>
                      {s.ret20d >= 0 ? "+" : ""}{formatPercent(s.ret20d)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{s.rs1d.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-mono">{s.rs5d.toFixed(2)}</td>
                  <td className="px-4 py-3 text-center">
                    {s.leader && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded border text-xs font-bold bg-[hsl(var(--go-color))]/20 text-[hsl(var(--go-color))] border-[hsl(var(--go-color))]/30">
                        LEAD
                      </span>
                    )}
                    {s.laggard && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded border text-xs font-bold bg-red-500/20 text-red-400 border-red-500/30">
                        LAG
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {!sectors.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No sector data available</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
