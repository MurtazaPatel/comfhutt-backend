import express from "express";
import {
  corsMiddleware,
  helmetMiddleware,
  rateLimiter,
  errorHandler,
} from "./middleware";
import routes from "./routes";

/**
 * Create and configure the Express application.
 * Exported separately so it can be imported for testing
 * without starting the HTTP server.
 */
export function createApp(): express.Application {
  const app = express();

  // ── Security ──────────────────────────────────────────
  app.use(helmetMiddleware);
  app.use(rateLimiter);
  app.use(corsMiddleware);

  // ── Body parsing ──────────────────────────────────────
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  // ── Trust Cloud Run's reverse proxy ───────────────────
  app.set("trust proxy", 1);

  // ── Routes ────────────────────────────────────────────
  app.use(routes);

  // ── Global error handler (must be last) ───────────────
  app.use(errorHandler);

  return app;
}
