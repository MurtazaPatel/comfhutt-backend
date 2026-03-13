import { Router, Request, Response } from "express";
import { z } from "zod";
import { choiceSchema } from "../validations/choices";
import { upsertLead, logLeadEvent } from "../services/leads";
import { createChoiceResponses } from "../services/choices";

const router = Router();

// Basic in-memory rate limiting (for demo purposes, use Redis/Upstash in production)
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 5;
const ipRequests = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const requests = ipRequests.get(ip) || [];
  const recentRequests = requests.filter((time) => now - time < RATE_LIMIT_WINDOW);

  if (recentRequests.length >= MAX_REQUESTS) {
    return true;
  }

  recentRequests.push(now);
  ipRequests.set(ip, recentRequests);
  return false;
}

/**
 * POST /api/choices
 * Matches the Next.js route response shape: { ok, leadId } on success.
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    // 1. Rate Limiting
    const ip = req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
    if (isRateLimited(ip)) {
      res.status(429).json({
        error: "Too many requests. Please try again later.",
      });
      return;
    }

    // 2. Parse & Validate Body
    const validatedData = choiceSchema.parse(req.body);

    // 3. Database Operations
    // Upsert Lead
    let leadId;
    try {
      leadId = await upsertLead(
        validatedData.email,
        validatedData.name,
        "CHOICES"
      );
    } catch (error) {
      console.error("Error upserting lead:", error);
      res.status(500).json({
        error: "Could not save your preferences. Please try again.",
      });
      return;
    }

    // Create Choice Responses
    const responses: Array<{ key: string; value: string }> = [
      { key: "intent", value: validatedData.intent },
    ];
    if (validatedData.nps !== undefined && validatedData.nps !== null) {
      responses.push({ key: "nps", value: validatedData.nps.toString() });
    }

    try {
      await createChoiceResponses(leadId, responses);
    } catch (error) {
      console.error("Error creating choice responses:", error);
      res.status(500).json({
        error: "Could not save your preferences. Please try again.",
      });
      return;
    }

    // Log the lead event
    try {
      await logLeadEvent(leadId, "CHOICES_SUBMISSION", "CHOICES");
    } catch (eventError) {
      console.error("Error logging lead event:", eventError);
      // Non-critical error
    }

    res.json({ ok: true, leadId: leadId });
  } catch (error) {
    console.error("Choices API Error:", error);

    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: "Validation failed",
        details: error.issues,
      });
      return;
    }

    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
