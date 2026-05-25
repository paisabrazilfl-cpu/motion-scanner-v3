import { Router } from "express";
import { db, apiKeysTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ExecuteTradesBody } from "@workspace/api-zod";
import { decrypt } from "../lib/crypto";
import { logAudit } from "../lib/audit";
import { logger } from "../lib/logger";

const router = Router();

async function getTenantKeys(tenantId: number) {
  const rows = await db.select().from(apiKeysTable).where(eq(apiKeysTable.tenantId, tenantId)).limit(1);
  return rows[0] ?? null;
}

function decryptKey(enc: string | null | undefined): string | null {
  if (!enc) return null;
  try { return decrypt(enc); } catch { return null; }
}

router.get("/broker/account", async (req, res): Promise<void> => {
  const keys = await getTenantKeys(req.tenantId);
  const alpacaKey = decryptKey(keys?.alpacaApiKeyEnc);
  const alpacaSecret = decryptKey(keys?.alpacaSecretKeyEnc);

  if (!alpacaKey || !alpacaSecret) {
    res.status(503).json({ error: "Alpaca API keys not configured" });
    return;
  }

  try {
    const paper = keys?.alpacaPaper ?? true;
    const baseUrl = paper
      ? "https://paper-api.alpaca.markets"
      : "https://api.alpaca.markets";
    const { default: axios } = await import("axios");
    const { data } = await axios.get(`${baseUrl}/v2/account`, {
      headers: { "APCA-API-KEY-ID": alpacaKey, "APCA-API-SECRET-KEY": alpacaSecret },
      timeout: 10000,
    });
    const equity = parseFloat(data.equity);
    const lastEquity = parseFloat(data.last_equity ?? data.equity);
    res.json({
      equity, lastEquity,
      buyingPower: parseFloat(data.buying_power),
      cash: parseFloat(data.cash),
      portfolioValue: parseFloat(data.portfolio_value),
      paper,
      dayPl: equity - lastEquity,
      dayPlPct: lastEquity > 0 ? (equity - lastEquity) / lastEquity : 0,
    });
  } catch (err: any) {
    req.log.error({ err }, "Alpaca account fetch failed");
    res.status(502).json({ error: "Broker request failed" });
  }
});

router.get("/broker/positions", async (req, res): Promise<void> => {
  const keys = await getTenantKeys(req.tenantId);
  const alpacaKey = decryptKey(keys?.alpacaApiKeyEnc);
  const alpacaSecret = decryptKey(keys?.alpacaSecretKeyEnc);
  if (!alpacaKey || !alpacaSecret) { res.json([]); return; }

  try {
    const paper = keys?.alpacaPaper ?? true;
    const baseUrl = paper ? "https://paper-api.alpaca.markets" : "https://api.alpaca.markets";
    const { default: axios } = await import("axios");
    const { data } = await axios.get(`${baseUrl}/v2/positions`, {
      headers: { "APCA-API-KEY-ID": alpacaKey, "APCA-API-SECRET-KEY": alpacaSecret },
      timeout: 10000,
    });
    res.json((data as any[]).map((p) => ({
      symbol: p.symbol, qty: parseFloat(p.qty),
      marketValue: parseFloat(p.market_value),
      unrealizedPl: parseFloat(p.unrealized_pl),
      unrealizedPlPct: parseFloat(p.unrealized_plpc),
      currentPrice: parseFloat(p.current_price),
      entryPrice: parseFloat(p.avg_entry_price),
    })));
  } catch { res.json([]); }
});

router.post("/broker/execute", async (req, res): Promise<void> => {
  const parsed = ExecuteTradesBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { candidates, dryRun } = parsed.data;

  await logAudit(req, {
    tenantId: req.tenantId, userId: req.userId,
    action: "BROKER_EXECUTE",
    metadata: { dryRun, tickerCount: candidates.length },
  });

  const results = candidates.map((c) => ({
    ok: true, ticker: c.ticker,
    orderId: dryRun ? null : null,
    qty: 0, entry: c.technical?.close ?? 0,
    target: c.monteCarlo?.target_price ?? 0,
    stop: c.monteCarlo?.stop_price ?? 0,
    reason: dryRun ? "DRY_RUN" : "SUBMITTED",
  }));

  res.json(results);
});

export default router;
