import express from "express";
import { clerkMiddleware } from "@clerk/express";
import {
  corsMiddleware,
  helmetMiddleware,
  rateLimiter,
  requestIdMiddleware,
  errorHandler,
} from "./middleware";
import webhooksRouter from "./routes/webhooks.routes";
import routes from "./routes";

export function createApp(): express.Application {
  const app = express();

  // Trust Cloud Run's reverse proxy — must come first so rate limiters
  // read the correct client IP from X-Forwarded-For.
  app.set("trust proxy", 1);

  // ── Security headers ──────────────────────────────────
  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(requestIdMiddleware);

  // ── Webhooks (raw body for Svix verification) ────────
  // CRITICAL: Must be before express.json() to preserve raw body
  app.use('/webhooks', express.raw({ type: 'application/json' }), webhooksRouter);

  // ── Body parsing ──────────────────────────────────────
  app.use(express.json({ limit: "50kb" }));
  app.use(express.urlencoded({ limit: "50kb", extended: true }));

  // ── Clerk session verification ────────────────────────
  app.use(clerkMiddleware());

  // ── Global rate backstop (300 req / 15 min / IP) ──────
  app.use(rateLimiter);

  // ── Routes ────────────────────────────────────────────
  app.use(routes);

  // ── Global error handler (must be last) ───────────────
  app.use(errorHandler);

  return app;
}
