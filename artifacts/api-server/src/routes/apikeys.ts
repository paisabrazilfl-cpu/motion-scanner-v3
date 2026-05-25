import { Router } from "express";
import { db, apiKeysTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateApiKeysBody } from "@workspace/api-zod";
import { encrypt, decrypt } from "../lib/crypto";
import { logAudit } from "../lib/audit";

const router = Router();

function isSet(enc: string | null | undefined): boolean {
  return !!enc;
}

router.get("/api-keys", async (req, res): Promise<void> => {
  const rows = await db.select().from(apiKeysTable)
    .where(eq(apiKeysTable.tenantId, req.tenantId)).limit(1);
  const row = rows[0];
  res.json({
    alpacaConfigured: isSet(row?.alpacaApiKeyEnc),
    tradierConfigured: isSet(row?.tradierApiKeyEnc),
    polygonConfigured: isSet(row?.polygonApiKeyEnc),
    finnhubConfigured: isSet(row?.finnhubApiKeyEnc),
    discordConfigured: isSet(row?.discordWebhookUrlEnc),
    alpacaPaper: row?.alpacaPaper ?? true,
  });
});

router.put("/api-keys", async (req, res): Promise<void> => {
  const parsed = UpdateApiKeysBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;

  const existing = await db.select().from(apiKeysTable)
    .where(eq(apiKeysTable.tenantId, req.tenantId)).limit(1);

  const patch: Record<string, unknown> = { tenantId: req.tenantId };
  if (d.alpacaApiKey != null) patch.alpacaApiKeyEnc = d.alpacaApiKey ? encrypt(d.alpacaApiKey) : null;
  if (d.alpacaSecretKey != null) patch.alpacaSecretKeyEnc = d.alpacaSecretKey ? encrypt(d.alpacaSecretKey) : null;
  if (d.alpacaPaper != null) patch.alpacaPaper = d.alpacaPaper;
  if (d.tradierApiKey != null) patch.tradierApiKeyEnc = d.tradierApiKey ? encrypt(d.tradierApiKey) : null;
  if (d.polygonApiKey != null) patch.polygonApiKeyEnc = d.polygonApiKey ? encrypt(d.polygonApiKey) : null;
  if (d.finnhubApiKey != null) patch.finnhubApiKeyEnc = d.finnhubApiKey ? encrypt(d.finnhubApiKey) : null;
  if (d.discordWebhookUrl != null) patch.discordWebhookUrlEnc = d.discordWebhookUrl ? encrypt(d.discordWebhookUrl) : null;

  let row;
  if (existing.length === 0) {
    const [created] = await db.insert(apiKeysTable).values(patch as any).returning();
    row = created;
  } else {
    const { tenantId: _tid, ...updatePatch } = patch;
    const [updated] = await db.update(apiKeysTable)
      .set(updatePatch as any)
      .where(eq(apiKeysTable.tenantId, req.tenantId)).returning();
    row = updated;
  }

  await logAudit(req, { tenantId: req.tenantId, userId: req.userId, action: "API_KEYS_UPDATE" });
  res.json({
    alpacaConfigured: isSet(row?.alpacaApiKeyEnc),
    tradierConfigured: isSet(row?.tradierApiKeyEnc),
    polygonConfigured: isSet(row?.polygonApiKeyEnc),
    finnhubConfigured: isSet(row?.finnhubApiKeyEnc),
    discordConfigured: isSet(row?.discordWebhookUrlEnc),
    alpacaPaper: row?.alpacaPaper ?? true,
  });
});

export default router;
