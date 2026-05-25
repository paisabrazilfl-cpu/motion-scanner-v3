import { useState } from "react";
import { useListAuditLogs } from "@workspace/api-client-react";
import type { AuditLogEntry } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const PAGE_SIZE = 50;

const ACTION_COLORS: Record<string, string> = {
  scan: "text-[hsl(var(--go-color))]",
  watchlist_create: "text-blue-400",
  watchlist_update: "text-blue-400",
  watchlist_delete: "text-red-400",
  config_update: "text-yellow-400",
  broker_execute: "text-purple-400",
  api_key_update: "text-orange-400",
};

export function AuditLogs() {
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);

  const { data, isLoading } = useListAuditLogs({ limit: PAGE_SIZE, offset });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <span className="text-sm text-muted-foreground">{total} entries</span>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((entry: AuditLogEntry) => (
                  <TableRow
                    key={entry.id}
                    className="border-border cursor-pointer hover:bg-muted/20"
                    onClick={() => setSelected(entry)}
                  >
                    <TableCell className="font-mono text-xs">
                      {new Date(entry.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <span className={`font-mono text-xs ${ACTION_COLORS[entry.action] ?? "text-foreground"}`}>
                        {entry.action}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {entry.resourceType ?? "—"}{entry.resourceId ? ` #${entry.resourceId}` : ""}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {entry.userId ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {entry.ipAddress ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {!items.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No audit entries found
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
          <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setOffset((o) => o + PAGE_SIZE)}>Next</Button>
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-[520px]">
          <SheetHeader>
            <SheetTitle>Audit Entry</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="mt-4 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="text-muted-foreground">Action</div>
                <div className={`font-mono ${ACTION_COLORS[selected.action] ?? ""}`}>{selected.action}</div>
                <div className="text-muted-foreground">Resource</div>
                <div className="font-mono">{selected.resourceType ?? "—"}{selected.resourceId ? ` #${selected.resourceId}` : ""}</div>
                <div className="text-muted-foreground">User ID</div>
                <div className="font-mono">{selected.userId ?? "—"}</div>
                <div className="text-muted-foreground">IP</div>
                <div className="font-mono">{selected.ipAddress ?? "—"}</div>
                <div className="text-muted-foreground">Time</div>
                <div className="font-mono">{new Date(selected.createdAt).toLocaleString()}</div>
              </div>
              {selected.metadata && (
                <div>
                  <div className="text-muted-foreground text-xs uppercase mb-2">Metadata</div>
                  <pre className="bg-muted/30 rounded p-3 text-xs overflow-auto max-h-64 font-mono">
                    {JSON.stringify(selected.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
