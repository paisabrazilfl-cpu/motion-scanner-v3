import { Router } from "express";
import { RunAmfScanBody } from "@workspace/api-zod";
import { runAmfScan, DEFAULT_AMF_CONFIG } from "../lib/amf-scanner";
import { fetchYahooScreener, AMF_SCREENS } from "../lib/providers";
import { logAudit } from "../lib/audit";

const router = Router();

router.get("/amf/discover", async (req, res): Promise<void> => {
  const screen = String(req.query.screen ?? "").trim();
  const count = Math.min(100, Math.max(10, parseInt(String(req.query.count ?? "50"), 10) || 50));

  if (!screen) {
    res.status(400).json({ error: "screen query param is required" });
    return;
  }
  if (!AMF_SCREENS[screen]) {
    res.status(400).json({ error: `Unknown screen '${screen}'. Valid: ${Object.keys(AMF_SCREENS).join(", ")}` });
    return;
  }

  req.log.info({ screen, count }, "amf: discovering tickers");

  const items = await fetchYahooScreener(screen, count);
  const tickers = items.map((i) => i.symbol);

  res.json({ tickers, items, screen, count: items.length });
});

router.post("/amf", async (req, res): Promise<void> => {
  const parsed = RunAmfScanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { tickers, period } = parsed.data;
  const cfg = { ...DEFAULT_AMF_CONFIG, period };

  req.log.info({ tickers: tickers.length, period }, "amf: starting scan");

  const results = await runAmfScan(tickers, cfg);

  await logAudit(req, {
    tenantId: req.tenantId,
    action: "amf_scan",
    metadata: { tickerCount: tickers.length, period },
  });

  res.json({ results, period, scannedAt: new Date().toISOString() });
});

export default router;
