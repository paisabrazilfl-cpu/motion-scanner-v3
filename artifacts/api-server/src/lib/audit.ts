import { db, auditLogsTable } from "@workspace/db";
import type { Request } from "express";
import { logger } from "./logger";

interface AuditPayload {
  tenantId: number;
  userId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logAudit(req: Request, payload: AuditPayload): Promise<void> {
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    null;
  try {
    await db.insert(auditLogsTable).values({
      tenantId: payload.tenantId,
      userId: payload.userId ?? null,
      action: payload.action,
      resourceType: payload.resourceType ?? null,
      resourceId: payload.resourceId ?? null,
      ipAddress: ip,
      metadata: payload.metadata ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to write audit log");
  }
}
