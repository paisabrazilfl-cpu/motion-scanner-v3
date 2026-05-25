import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scanRouter from "./scan";
import watchlistsRouter from "./watchlists";
import configRouter from "./config";
import brokerRouter from "./broker";
import sectorRouter from "./sector";
import auditRouter from "./audit";
import apikeysRouter from "./apikeys";
import chartRouter from "./chart";
import newsRouter from "./news";
import notesRouter from "./notes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(scanRouter);
router.use(watchlistsRouter);
router.use(configRouter);
router.use(brokerRouter);
router.use(sectorRouter);
router.use(auditRouter);
router.use(apikeysRouter);
router.use(chartRouter);
router.use(newsRouter);
router.use(notesRouter);

export default router;
