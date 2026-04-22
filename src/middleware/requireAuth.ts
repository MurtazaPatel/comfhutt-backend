import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { AppError } from "../modules/crux/shared/errors";

export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const { userId } = getAuth(req);
  if (!userId) {
    return next(
      new AppError(401, "UNAUTHORIZED", "Authentication required.")
    );
  }
  next();
}
