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

// POST /crux/lens/session — 100 sessions per IP per hour (prevent session spam)
export const lensSessionLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})

// POST /crux/lens/:session_id/message — 500 per IP per day (Gemini cost protection)
export const lensMessageLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 500,
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

// POST /api/auth/login — 5 per IP per minute (brute-force protection)
export const authLoginLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many login attempts. Try again in 1 minute.', status: 429 } },
})

// POST /api/auth/login — 20 per IP per 15 minutes (sustained attack ceiling)
export const authLoginWindowLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many login attempts. Try again later.', status: 429 } },
})

// POST /api/auth/register — 3 per IP per hour (registration abuse protection)
export const authRegisterLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many registration attempts. Try again later.', status: 429 } },
})

// GET /crux/card/share/:share_token — 200 per IP per hour (public, generous)
export const cardShareLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})
