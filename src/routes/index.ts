import { Router } from "express";
import healthRouter from "./health";
import contactRouter from "./contact";
import choicesRouter from "./choices";
import earlyAccessRouter from "./early-access";
import developerOnboardingRouter from "./developer-onboarding";
import propertiesRouter from "./properties";
import authRouter from "./auth";
import authEmailHookRouter from "./auth-email-hook";

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

export default router;
