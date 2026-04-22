import { Router } from "express";
import healthRouter from "./health";
import contactRouter from "./contact";
import choicesRouter from "./choices";
import earlyAccessRouter from "./early-access";
import developerOnboardingRouter from "./developer-onboarding";
import propertiesRouter from "./properties";
import authRouter from "./auth";
import authEmailHookRouter from "./auth-email-hook";
import authClerkRouter from "./auth.routes";
import cruxRouter from "./crux";
import searchesRouter from "./searches.routes";
import billingRouter from "./billing.routes";

const router = Router();

// ── Existing ────────────────────────────────────────
router.use("/health", healthRouter);

// ── API routes ──────────────────────────────────────
router.use("/api/contact", contactRouter);
router.use("/api/choices", choicesRouter);
router.use("/api/early-access", earlyAccessRouter);
router.use("/api/developer-onboarding", developerOnboardingRouter);
router.use("/api/properties", propertiesRouter);
router.use("/api/auth", authRouter);
router.use("/api/auth-email-hook", authEmailHookRouter);

// ── CRUX ─────────────────────────────────────────────
router.use("/api/crux/auth", authClerkRouter);
router.use("/api/crux/searches", searchesRouter);
router.use("/api/crux/billing", billingRouter);
router.use("/api", cruxRouter);

// ── Pro-Gated Routes ────────────────────────────────
// The following CRUX Score features require Pro tier and use requirePro middleware:
//   POST /api/crux/score/:property_id/bulk — bulk scoring (multi-property in one request)
//   GET /api/crux/score/:property_id/history — full scoring history (snapshots + details)
//   POST /api/crux/score/:property_id/export — export score as PDF
//
// Free tier limits:
//   - Up to 2 scores/month
//   - 10 watch credits (one watch = 1 credit)
//   - 24-hour search history retention

export default router;
