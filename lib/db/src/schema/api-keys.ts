import { pgTable, serial, timestamp, integer, text, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const apiKeysTable = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().unique(),
  alpacaApiKeyEnc: text("alpaca_api_key_enc"),
  alpacaSecretKeyEnc: text("alpaca_secret_key_enc"),
  alpacaPaper: boolean("alpaca_paper").notNull().default(true),
  tradierApiKeyEnc: text("tradier_api_key_enc"),
  polygonApiKeyEnc: text("polygon_api_key_enc"),
  finnhubApiKeyEnc: text("finnhub_api_key_enc"),
  discordWebhookUrlEnc: text("discord_webhook_url_enc"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertApiKeySchema = createInsertSchema(apiKeysTable).omit({ id: true, updatedAt: true });
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeysTable.$inferSelect;
