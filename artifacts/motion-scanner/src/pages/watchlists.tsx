import { useState } from "react";
import {
  useListWatchlists,
  useCreateWatchlist,
  useUpdateWatchlist,
  useDeleteWatchlist,
} from "@workspace/api-client-react";
import type { Watchlist } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2 } from "lucide-react";

function WatchlistForm({
  initial,
  onSubmit,
  onCancel,
  isPending,
}: {
  initial?: Watchlist;
  onSubmit: (name: string, tickers: string[], description: string) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [tickersText, setTickersText] = useState(initial?.tickers.join(", ") ?? "");

  const handleSubmit = () => {
    const tickers = tickersText
      .split(/[\s,]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    onSubmit(name, tickers, description);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs uppercase text-muted-foreground">Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Watchlist" />
      </div>
      <div className="space-y-2">
        <Label className="text-xs uppercase text-muted-foreground">Description</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
      </div>
      <div className="space-y-2">
        <Label className="text-xs uppercase text-muted-foreground">Tickers (comma-separated)</Label>
        <Textarea
          value={tickersText}
          onChange={(e) => setTickersText(e.target.value)}
          placeholder="AAPL, MSFT, NVDA..."
          className="font-mono h-24"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={isPending || !name.trim()}>
          {isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}

export function Watchlists() {
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Watchlist | null>(null);
  const [deleting, setDeleting] = useState<Watchlist | null>(null);

  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/watchlists"] });

  const { data: watchlists, isLoading } = useListWatchlists();

  const { mutate: create, isPending: creating } = useCreateWatchlist({
    mutation: { onSuccess: () => { invalidate(); setShowCreate(false); } },
  });

  const { mutate: update, isPending: updating } = useUpdateWatchlist({
    mutation: { onSuccess: () => { invalidate(); setEditing(null); } },
  });

  const { mutate: del, isPending: deleting_ } = useDeleteWatchlist({
    mutation: { onSuccess: () => { invalidate(); setDeleting(null); } },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Watchlists</h1>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Watchlist
        </Button>
      </div>

      <div className="grid gap-4">
        {watchlists?.map((wl) => (
          <Card key={wl.id} className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">{wl.name}</CardTitle>
                  {wl.description && (
                    <p className="text-xs text-muted-foreground mt-1">{wl.description}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(wl)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-300" onClick={() => setDeleting(wl)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {wl.tickers.map((t) => (
                  <Badge key={t} variant="outline" className="font-mono text-xs">
                    {t}
                  </Badge>
                ))}
                <span className="text-xs text-muted-foreground self-center ml-1">
                  {wl.tickers.length} ticker{wl.tickers.length !== 1 ? "s" : ""}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
        {!watchlists?.length && (
          <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
            No watchlists yet. Create one to get started.
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Watchlist</DialogTitle></DialogHeader>
          <WatchlistForm
            onSubmit={(name, tickers, description) =>
              create({ data: { name, tickers, description } })
            }
            onCancel={() => setShowCreate(false)}
            isPending={creating}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Watchlist</DialogTitle></DialogHeader>
          {editing && (
            <WatchlistForm
              initial={editing}
              onSubmit={(name, tickers, description) =>
                update({ id: editing.id, data: { name, tickers, description } })
              }
              onCancel={() => setEditing(null)}
              isPending={updating}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Watchlist</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">
            Delete <strong>{deleting?.name}</strong>? This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleting_}
              onClick={() => deleting && del({ id: deleting.id })}
            >
              {deleting_ ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
