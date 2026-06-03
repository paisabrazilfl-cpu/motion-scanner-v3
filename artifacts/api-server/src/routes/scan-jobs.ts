import { Router } from "express";
import { db, apiKeysTable, scanJobsTable } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { runScanBatched, DEFAULT_CONFIG } from "../lib/scanner";
import { getFullMarketUniverse } from "../lib/universe";
import { decrypt } from "../lib/crypto";
import { logAudit } from "../lib/audit";
import { logger } from "../lib/logger";
import { parseScreenerQuery, tier1Gate, applyScreenerFilters } from "../lib/screener-filter";
import type { TenantProviderKeys } from "../lib/providers";

const router = Router();

async function getTenantKeys(tenantId: number): Promise<TenantProviderKeys> {
  try {
    const rows = await db.select().from(apiKeysTable).where(eq(apiKeysTable.tenantId, tenantId)).limit(1);
    const row = rows[0];
    if (!row) return {};
    const safe = (enc: string | null | undefined): string | undefined => {
      if (!enc) return undefined;
      try { return decrypt(enc); } catch { return undefined; }
    };
    return { polygonKey: safe(row.polygonApiKeyEnc), finnhubKey: safe(row.finnhubApiKeyEnc) };
  } catch { return {}; }
}

// Trim full scan records down to what the screener table, filters and basic
// drill-down need — keeps the stored jsonb (up to ~6000 rows) compact.
interface RawRec {
  ticker: string;
  verdict: string;
  score: number;
  reason?: string;
  technical?: Record<string, unknown> | null;
  fundamentals?: Record<string, unknown> | null;
}
function trimRecord(c: RawRec): Record<string, unknown> {
  const fund = (c.fundamentals ?? {}) as Record<string, unknown>;
  return {
    ticker: c.ticker,
    verdict: c.verdict,
    score: c.score,
    reason: c.reason,
    technical: c.technical ?? null,
    fundamentals: {
      sector: fund.sector ?? null,
      industry: fund.industry ?? null,
      market_cap: fund.market_cap ?? null,
      pe_ratio: fund.pe_ratio ?? null,
    },
  };
}

function serializeJob(row: typeof scanJobsTable.$inferSelect) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    status: row.status,
    universe: row.universe,
    total: row.total,
    processed: row.processed,
    goCount: row.goCount,
    holdCount: row.holdCount,
    rejectCount: row.rejectCount,
    error: row.error ?? null,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

// In-process guard against duplicate concurrent jobs for the same tenant.
const runningTenants = new Set<number>();

async function runJobWorker(jobId: number, tenantId: number, limit?: number): Promise<void> {
  runningTenants.add(tenantId);
  try {
    const providerKeys = await getTenantKeys(tenantId);
    let universe = await getFullMarketUniverse();
    if (limit && limit > 0) universe = universe.slice(0, limit);

    await db.update(scanJobsTable)
      .set({ status: "running", startedAt: new Date(), total: universe.length, processed: 0 })
      .where(eq(scanJobsTable.id, jobId));

    logger.info({ jobId, tenantId, total: universe.length }, "scan-job: started");

    const records = await runScanBatched(
      universe,
      DEFAULT_CONFIG,
      providerKeys,
      async (processed, recs) => {
        let go = 0, hold = 0, reject = 0;
        for (const r of recs) {
          if (r.verdict === "GO") go++;
          else if (r.verdict === "HOLD") hold++;
          else reject++;
        }
        await db.update(scanJobsTable)
          .set({ processed, goCount: go, holdCount: hold, rejectCount: reject })
          .where(eq(scanJobsTable.id, jobId));
      },
    );

    // Keep only records with valid market data, then trim for storage.
    const gated = tier1Gate(records as RawRec[]);
    const stored = gated.map(trimRecord);
    let go = 0, hold = 0, reject = 0;
    for (const r of gated) {
      if (r.verdict === "GO") go++;
      else if (r.verdict === "HOLD") hold++;
      else reject++;
    }

    await db.update(scanJobsTable)
      .set({
        status: "completed",
        completedAt: new Date(),
        processed: records.length,
        goCount: go,
        holdCount: hold,
        rejectCount: reject,
        results: stored,
      })
      .where(eq(scanJobsTable.id, jobId));

    logger.info({ jobId, tenantId, scanned: records.length, valid: gated.length, go, hold }, "scan-job: completed");
  } catch (err) {
    logger.error({ err, jobId, tenantId }, "scan-job: failed");
    await db.update(scanJobsTable)
      .set({ status: "failed", completedAt: new Date(), error: err instanceof Error ? err.message : String(err) })
      .where(eq(scanJobsTable.id, jobId))
      .catch(() => {});
  } finally {
    runningTenants.delete(tenantId);
  }
}

// ── POST /scan-jobs ─ start (or return the in-flight) full-market scan ──────
router.post("/scan-jobs", async (req, res): Promise<void> => {
  const limitRaw = (req.body as { limit?: unknown } | undefined)?.limit;
  const limit = typeof limitRaw === "number" && limitRaw > 0 ? Math.floor(limitRaw) : undefined;

  const returnActive = async (): Promise<boolean> => {
    const existing = await db.select().from(scanJobsTable)
      .where(and(eq(scanJobsTable.tenantId, req.tenantId), inArray(scanJobsTable.status, ["pending", "running"])))
      .orderBy(desc(scanJobsTable.id)).limit(1);
    if (existing[0]) { res.json(serializeJob(existing[0])); return true; }
    return false;
  };

  // Fast-path dedupe (in-process guard + DB read). The partial unique index on
  // (tenant_id) where status in (pending,running) is the real race-proof guard.
  if (runningTenants.has(req.tenantId) && await returnActive()) return;
  if (await returnActive()) return;

  let job: typeof scanJobsTable.$inferSelect;
  try {
    [job] = await db.insert(scanJobsTable)
      .values({ tenantId: req.tenantId, status: "pending", universe: "full_market" })
      .returning();
  } catch (err) {
    // Unique-index violation: another concurrent request already started one.
    if (await returnActive()) return;
    throw err;
  }

  await logAudit(req, {
    tenantId: req.tenantId, userId: req.userId,
    action: "FULL_MARKET_SCAN_START",
    metadata: { jobId: job.id, limit: limit ?? null },
  });

  // Fire-and-forget; progress is persisted to the DB for polling.
  void runJobWorker(job.id, req.tenantId, limit);

  res.json(serializeJob(job));
});

// ── GET /scan-jobs/latest ──────────────────────────────────────────────────
router.get("/scan-jobs/latest", async (req, res): Promise<void> => {
  const rows = await db.select().from(scanJobsTable)
    .where(eq(scanJobsTable.tenantId, req.tenantId))
    .orderBy(desc(scanJobsTable.id)).limit(1);
  res.json({ job: rows[0] ? serializeJob(rows[0]) : null });
});

// ── GET /scan-jobs/:id/results ─ filtered results from a finished job ───────
router.get("/scan-jobs/:id/results", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }

  const rows = await db.select().from(scanJobsTable).where(eq(scanJobsTable.id, id)).limit(1);
  const row = rows[0];
  if (!row || row.tenantId !== req.tenantId) { res.status(404).json({ error: "not found" }); return; }
  if (row.status !== "completed") {
    res.status(409).json({ error: "scan not completed", status: row.status });
    return;
  }

  const allRecords = (row.results ?? []) as unknown as Parameters<typeof tier1Gate>[0];
  const q = req.query as Record<string, string | undefined>;
  const filtered = applyScreenerFilters(allRecords, parseScreenerQuery(q));

  res.json({
    results: filtered,
    total: filtered.length,
    scanned: allRecords.length,
    cachedAt: (row.completedAt ?? row.createdAt).toISOString(),
  });
});

// On boot, fail any jobs orphaned by a previous process restart.
db.update(scanJobsTable)
  .set({ status: "failed", error: "interrupted by server restart", completedAt: new Date() })
  .where(inArray(scanJobsTable.status, ["pending", "running"]))
  .then((r) => { if (r) logger.info("scan-job: cleaned up orphaned jobs on boot"); })
  .catch((err) => logger.warn({ err }, "scan-job: orphan cleanup failed"));

export default router;
