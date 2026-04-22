import { Request, Response, NextFunction } from "express";
import { isAppError } from "../modules/crux/shared/errors";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const isProd = process.env.APP_ENV === "production";

  if (isAppError(err)) {
    if (!isProd) console.error(`[ERROR ${err.statusCode}] ${err.code}: ${err.message}`);
    res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message, status: err.statusCode },
    });
    return;
  }

  console.error(`[ERROR] ${err.message}`, isProd ? "" : err.stack);
  res.status(500).json({
    error: isProd ? "Internal server error" : err.message,
  });
}
