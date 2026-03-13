import { Router, Request, Response } from "express";
import { joinEarlyAccess } from "../services/early-access";

const router = Router();

/**
 * POST /api/early-access
 * Matches the Next.js route response shape.
 * Success: { success: true } with 201
 * Failure: { success: false, error: string } with 409 (duplicate) or 400
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    console.log("[API Early Access] Received request:", req.body);

    const result = await joinEarlyAccess(req.body);

    if (result.success) {
      res.status(201).json({ success: true });
    } else {
      // result.error comes from Zod or DB checks
      const status = result.error?.includes("already") ? 409 : 400;
      res.status(status).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("[API Early Access] Crash:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
    });
  }
});

export default router;
