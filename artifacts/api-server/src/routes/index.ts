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
import screenerRouter from "./screener";
import scanJobsRouter from "./scan-jobs";
import openaiRouter from "./openai/index";
import amfRouter from "./amf";

const router: IRouter = Router();

router.use(healthRouter);
router.use(scanRouter);
router.use(screenerRouter);
router.use(scanJobsRouter);
router.use(watchlistsRouter);
router.use(configRouter);
router.use(brokerRouter);
router.use(sectorRouter);
router.use(auditRouter);
router.use(apikeysRouter);
router.use(chartRouter);
router.use(newsRouter);
router.use(notesRouter);
router.use(openaiRouter);
router.use(amfRouter);

export default router;
