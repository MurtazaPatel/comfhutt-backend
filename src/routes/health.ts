import { Router, Request, Response } from "express";

const router = Router();

/**
 * GET /health
 * Lightweight liveness / readiness probe for Cloud Run.
 */
router.get("/", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "comfhutt-backend",
    version: "1.0.1",
  });
});

export default router;
