import { pgTable, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scanConfigsTable = pgTable("scan_configs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().unique(),
  config: jsonb("config").notNull().$type<Record<string, unknown>>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertScanConfigSchema = createInsertSchema(scanConfigsTable).omit({ id: true, updatedAt: true });
export type InsertScanConfig = z.infer<typeof insertScanConfigSchema>;
export type ScanConfig = typeof scanConfigsTable.$inferSelect;
