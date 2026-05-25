import { pgTable, serial, timestamp, integer, jsonb, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scanResultsTable = pgTable("scan_results", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  tickerCount: integer("ticker_count").notNull().default(0),
  goCount: integer("go_count").notNull().default(0),
  holdCount: integer("hold_count").notNull().default(0),
  rejectCount: integer("reject_count").notNull().default(0),
  regime: text("regime"),
  payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertScanResultSchema = createInsertSchema(scanResultsTable).omit({ id: true, createdAt: true });
export type InsertScanResult = z.infer<typeof insertScanResultSchema>;
export type ScanResult = typeof scanResultsTable.$inferSelect;
