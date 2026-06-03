import { pgTable, serial, timestamp, integer, jsonb, text, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

export const scanJobsTable = pgTable("scan_jobs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | running | completed | failed
  universe: text("universe").notNull().default("full_market"),
  total: integer("total").notNull().default(0),
  processed: integer("processed").notNull().default(0),
  goCount: integer("go_count").notNull().default(0),
  holdCount: integer("hold_count").notNull().default(0),
  rejectCount: integer("reject_count").notNull().default(0),
  results: jsonb("results").$type<Record<string, unknown>[] | null>(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  // At most one in-flight (pending/running) job per tenant — enforced at the DB
  // level so concurrent POST /scan-jobs requests cannot both start a scan.
  uniqueIndex("scan_jobs_one_active_per_tenant")
    .on(t.tenantId)
    .where(sql`status in ('pending', 'running')`),
]);

export type ScanJob = typeof scanJobsTable.$inferSelect;

export const scanJobStatusSchema = z.enum(["pending", "running", "completed", "failed"]);
