import rateLimit from 'express-rate-limit'
import type { Request, Response } from 'express'

// Rate limit windows are in-memory and reset on Cloud Run cold start.
// Redis-backed rate limiting is post-funding.

const rateLimitHandler = (_req: Request, res: Response) => {
  res.status(429).json({
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please slow down and try again later.',
      status: 429,
    },
  })
}

// POST /crux/property — 50 ingestions per IP per day
export const propertyIngestLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})

// GET /crux/score/:property_id — 100 per IP per hour (cheap DB read)
export const scoreFetchLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})

// POST /crux/score/:property_id/compute — 10 per IP per hour (hits all 6 data sources)
export const scoreComputeLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})

// POST /crux/lens/session — 20 sessions per IP per hour (prevent session spam)
export const lensSessionLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})

// POST /crux/lens/:session_id/message — 100 per IP per day (Gemini cost protection)
export const lensMessageLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})

// GET /crux/report/:property_id — 30 per IP per hour (Gemini cost protection)
export const reportLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})

// POST /crux/card/:property_id — 20 per IP per day
export const cardGenerationLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})

// GET /crux/card/share/:share_token — 200 per IP per hour (public, generous)
export const cardShareLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})
