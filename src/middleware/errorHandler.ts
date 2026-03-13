import { Request, Response, NextFunction } from "express";

/**
 * Catch-all error handler.
 * Logs the stack trace in non-production and returns a sanitised
 * JSON response so internal details never leak to clients.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const status = (err as Error & { status?: number }).status || 500;
  const isProd = process.env.APP_ENV === "production";

  console.error(`[ERROR] ${err.message}`, isProd ? "" : err.stack);

  res.status(status).json({
    error: isProd ? "Internal server error" : err.message,
  });
}
