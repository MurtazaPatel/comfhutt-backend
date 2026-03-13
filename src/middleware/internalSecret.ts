import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

/**
 * Middleware that validates the x-internal-secret header.
 * Used for server-to-server calls (e.g. Next.js → backend register).
 * Returns 401 if the header is missing or does not match.
 */
export function requireInternalSecret(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const secret = req.headers["x-internal-secret"];

  if (!secret || secret !== env.INTERNAL_API_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
