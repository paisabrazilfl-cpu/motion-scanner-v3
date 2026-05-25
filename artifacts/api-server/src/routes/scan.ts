import { Router } from "express";
import { db, scanResultsTable } from "@workspace/db";
import { eq, desc, count, avg, sql } from "drizzle-orm";
import { runScan, DEFAULT_CONFIG } from "../lib/scanner";
import { logAudit } from "../lib/audit";
import {
  RunScanBody, ListScanHistoryQueryParams, GetScanHistoryParams,
  GetDashboardSummaryResponse,
} from "@workspace/api-zod";

const router = Router();

// POST /scan
router.post("/scan", async (req, res): Promise<void> => {
  const parsed = RunScanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { tickers, computeOptions, computeSectors, configOverride } = parsed.data;
  const cfg = { ...DEFAULT_CONFIG, ...(configOverride ?? {}) };

  req.log.info({ tickers, tenantId: req.tenantId }, "Starting scan");
  const result = await runScan(tickers, cfg, computeSectors ?? true);

  const [saved] = await db.insert(scanResultsTable).values({
    tenantId: req.tenantId,
    tickerCount: tickers.length,
    goCount: result.candidates.length,
    holdCount: result.hold.length,
    rejectCount: result.rejected.length,
    regime: typeof result.sectorRotation?.regime === "string" ? result.sectorRotation.regime : null,
    payload: result as unknown as Record<string, unknown>,
  }).returning();

  await logAudit(req, {
    tenantId: req.tenantId, userId: req.userId,
    action: "SCAN_RUN",
    metadata: { tickerCount: tickers.length, goCount: result.candidates.length },
  });

  res.json({ id: saved.id, timestamp: saved.createdAt.toISOString(), ...result });
});

// GET /scan/history
router.get("/scan/history", async (req, res): Promise<void> => {
  const params = ListScanHistoryQueryParams.safeParse(req.query);
  const limit = params.success ? (params.data.limit ?? 20) : 20;
  const offset = params.success ? (params.data.offset ?? 0) : 0;

  const [rows, totalRows] = await Promise.all([
    db.select().from(scanResultsTable)
      .where(eq(scanResultsTable.tenantId, req.tenantId))
      .orderBy(desc(scanResultsTable.createdAt))
      .limit(limit).offset(offset),
    db.select({ count: count() }).from(scanResultsTable)
      .where(eq(scanResultsTable.tenantId, req.tenantId)),
  ]);

  res.json({
    items: rows.map((r) => ({
      id: r.id, createdAt: r.createdAt.toISOString(),
      tickerCount: r.tickerCount, goCount: r.goCount,
      holdCount: r.holdCount, rejectCount: r.rejectCount,
      regime: r.regime ?? null, payload: null,
    })),
    total: totalRows[0]?.count ?? 0,
  });
});

// GET /scan/history/:id
router.get("/scan/history/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }

  const rows = await db.select().from(scanResultsTable)
    .where(eq(scanResultsTable.id, id)).limit(1);
  const row = rows[0];
  if (!row || row.tenantId !== req.tenantId) { res.status(404).json({ error: "not found" }); return; }

  res.json({
    id: row.id, createdAt: row.createdAt.toISOString(),
    tickerCount: row.tickerCount, goCount: row.goCount,
    holdCount: row.holdCount, rejectCount: row.rejectCount,
    regime: row.regime ?? null, payload: row.payload,
  });
});

// GET /dashboard/summary
router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const rows = await db.select().from(scanResultsTable)
    .where(eq(scanResultsTable.tenantId, req.tenantId))
    .orderBy(desc(scanResultsTable.createdAt)).limit(5);

  const totalRows = await db.select({ count: count() }).from(scanResultsTable)
    .where(eq(scanResultsTable.tenantId, req.tenantId));
  const total = totalRows[0]?.count ?? 0;
  const avgGo = rows.length > 0 ? rows.reduce((a, r) => a + r.goCount, 0) / rows.length : 0;
  const last = rows[0];

  const topTickers: Record<string, { goCount: number; totalScore: number }> = {};
  for (const row of rows) {
    const payload = row.payload as any;
    for (const cand of payload?.candidates ?? []) {
      if (!topTickers[cand.ticker]) topTickers[cand.ticker] = { goCount: 0, totalScore: 0 };
      topTickers[cand.ticker].goCount++;
      topTickers[cand.ticker].totalScore += cand.score ?? 0;
    }
  }
  const topTickersList = Object.entries(topTickers)
    .map(([ticker, { goCount, totalScore }]) => ({ ticker, goCount, avgScore: totalScore / goCount }))
    .sort((a, b) => b.goCount - a.goCount).slice(0, 5);

  res.json({
    totalScans: total,
    avgGoCount: parseFloat(avgGo.toFixed(2)),
    avgScore: 0,
    lastRegime: last?.regime ?? null,
    lastScanAt: last?.createdAt.toISOString() ?? null,
    recentActivity: rows.map((r) => ({
      id: r.id, createdAt: r.createdAt.toISOString(),
      tickerCount: r.tickerCount, goCount: r.goCount,
      holdCount: r.holdCount, rejectCount: r.rejectCount,
      regime: r.regime ?? null, payload: null,
    })),
    topTickers: topTickersList,
  });
});

export default router;
