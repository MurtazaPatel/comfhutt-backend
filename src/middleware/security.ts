import helmet from "helmet";
import rateLimit from "express-rate-limit";

/**
 * Helmet — sets secure HTTP headers.
 */
export const helmetMiddleware = helmet();

/**
 * Rate limiter — 100 requests per 15-minute window per IP.
 * Cloud Run sits behind a load balancer, so we trust the
 * X-Forwarded-For header.
 */
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
