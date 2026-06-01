import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import type { RequestHandler } from 'express'

export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-site' },
  noSniff: true,
  frameguard: { action: 'deny' },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  hidePoweredBy: true,
  xssFilter: true,
  ieNoOpen: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  dnsPrefetchControl: { allow: false },
})

// Global backstop — 300 requests per 15-minute window per IP.
// Cloud Run sits behind a load balancer, so we trust X-Forwarded-For
// (set app.set("trust proxy", 1) before this middleware).
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health',
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again later.', status: 429 } },
})

// Tag every request with a unique ID for tracing.
export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID()
  req.headers['x-request-id'] = requestId
  res.setHeader('X-Request-ID', requestId)
  next()
}
