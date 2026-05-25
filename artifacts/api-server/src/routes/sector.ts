import { Router } from "express";
import { getSectorRotation } from "../lib/sector";

export { getSectorRotation };

const router = Router();

let sectorCache: { data: Record<string, unknown>; ts: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

router.get("/sector-rotation", async (req, res): Promise<void> => {
  const now = Date.now();
  if (sectorCache && now - sectorCache.ts < CACHE_TTL_MS) {
    res.json(sectorCache.data);
    return;
  }
  const data = await getSectorRotation();
  sectorCache = { data, ts: now };
  res.json(data);
});

export default router;
