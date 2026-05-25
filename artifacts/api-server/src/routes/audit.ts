import { Router } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
import { ListAuditLogsQueryParams } from "@workspace/api-zod";

const router = Router();

router.get("/audit-logs", async (req, res): Promise<void> => {
  const params = ListAuditLogsQueryParams.safeParse(req.query);
  const limit = params.success ? (params.data.limit ?? 50) : 50;
  const offset = params.success ? (params.data.offset ?? 0) : 0;

  const [rows, totalRows] = await Promise.all([
    db.select().from(auditLogsTable)
      .where(eq(auditLogsTable.tenantId, req.tenantId))
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(limit).offset(offset),
    db.select({ count: count() }).from(auditLogsTable)
      .where(eq(auditLogsTable.tenantId, req.tenantId)),
  ]);

  res.json({
    items: rows.map((r) => ({
      id: r.id, action: r.action,
      resourceType: r.resourceType ?? null, resourceId: r.resourceId ?? null,
      userId: r.userId ?? null, ipAddress: r.ipAddress ?? null,
      metadata: r.metadata ?? null, createdAt: r.createdAt.toISOString(),
    })),
    total: totalRows[0]?.count ?? 0,
  });
});

export default router;
