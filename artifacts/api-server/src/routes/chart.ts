import { Router } from "express";
import { fetchYahooChart } from "../lib/providers/yahoo";

const router = Router();

router.get("/chart/:ticker", async (req, res): Promise<void> => {
  const ticker = (req.params.ticker ?? "").toUpperCase();
  if (!ticker) { res.status(400).json({ error: "ticker required" }); return; }

  const range = (req.query.range as string) || "3mo";
  const validRanges = ["1mo", "3mo", "6mo", "1y", "2y"];
  const safeRange = validRanges.includes(range) ? range : "3mo";

  const chart = await fetchYahooChart(ticker, safeRange);
  if (!chart) { res.status(502).json({ error: "failed to fetch chart data" }); return; }

  const { closes, highs, lows, opens, volumes, timestamps } = chart;
  const candles = timestamps
    .map((ts, i) => ({
      time: ts,
      open: opens[i] ?? closes[i],
      high: highs[i] ?? closes[i],
      low: lows[i] ?? closes[i],
      close: closes[i],
      volume: volumes[i] ?? 0,
    }))
    .filter((c) => c.close != null && c.open != null)
    .sort((a, b) => a.time - b.time);

  res.json({ ticker, range: safeRange, candles });
});

export default router;
