import { Router } from "express";
import { RunAmfScanBody } from "@workspace/api-zod";
import { runAmfScan, DEFAULT_AMF_CONFIG } from "../lib/amf-scanner";
import { logAudit } from "../lib/audit";

const router = Router();

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
