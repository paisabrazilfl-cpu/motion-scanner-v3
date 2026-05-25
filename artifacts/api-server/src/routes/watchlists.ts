import { Router } from "express";
import { db, watchlistsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { CreateWatchlistBody, UpdateWatchlistBody, GetWatchlistParams, UpdateWatchlistParams, DeleteWatchlistParams } from "@workspace/api-zod";
import { logAudit } from "../lib/audit";

const router = Router();

router.get("/watchlists", async (req, res): Promise<void> => {
  const rows = await db.select().from(watchlistsTable)
    .where(eq(watchlistsTable.tenantId, req.tenantId));
  res.json(rows.map((r) => ({
    id: r.id, name: r.name, tickers: r.tickers ?? [],
    description: r.description ?? null,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  })));
});

router.post("/watchlists", async (req, res): Promise<void> => {
  const parsed = CreateWatchlistBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(watchlistsTable).values({
    tenantId: req.tenantId, name: parsed.data.name,
    tickers: parsed.data.tickers, description: parsed.data.description ?? null,
  }).returning();
  await logAudit(req, { tenantId: req.tenantId, userId: req.userId, action: "WATCHLIST_CREATE", resourceType: "watchlist", resourceId: String(row.id) });
  res.status(201).json({ id: row.id, name: row.name, tickers: row.tickers ?? [], description: row.description ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
});

router.get("/watchlists/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }
  const rows = await db.select().from(watchlistsTable)
    .where(and(eq(watchlistsTable.id, id), eq(watchlistsTable.tenantId, req.tenantId))).limit(1);
  const row = rows[0];
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json({ id: row.id, name: row.name, tickers: row.tickers ?? [], description: row.description ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
});

router.put("/watchlists/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }
  const parsed = UpdateWatchlistBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const rows = await db.update(watchlistsTable)
    .set({ name: parsed.data.name, tickers: parsed.data.tickers, description: parsed.data.description ?? null })
    .where(and(eq(watchlistsTable.id, id), eq(watchlistsTable.tenantId, req.tenantId)))
    .returning();
  const row = rows[0];
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  await logAudit(req, { tenantId: req.tenantId, userId: req.userId, action: "WATCHLIST_UPDATE", resourceType: "watchlist", resourceId: String(id) });
  res.json({ id: row.id, name: row.name, tickers: row.tickers ?? [], description: row.description ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
});

router.delete("/watchlists/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }
  await db.delete(watchlistsTable)
    .where(and(eq(watchlistsTable.id, id), eq(watchlistsTable.tenantId, req.tenantId)));
  await logAudit(req, { tenantId: req.tenantId, userId: req.userId, action: "WATCHLIST_DELETE", resourceType: "watchlist", resourceId: String(id) });
  res.status(204).send();
});

export default router;
