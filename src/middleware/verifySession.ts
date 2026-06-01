import type { Request, Response, NextFunction } from 'express';
import { getAuth } from '@clerk/express';
import { AppError } from '../modules/crux/shared/errors';
import { clerkClient } from '@clerk/express';

export interface VerifiedSession {
  userId: string;
  sessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      verifiedSession?: VerifiedSession;
    }
  }
}

export function verifySession(req: Request, _res: Response, next: NextFunction): void {
  const { userId, sessionId } = getAuth(req);

  if (!userId || !sessionId) {
    next(new AppError(401, 'UNAUTHORIZED', 'Valid session required.'));
    return;
  }

  clerkClient.sessions.getSession(sessionId)
    .then(session => {
      if (session.status !== 'active') {
        return next(new AppError(401, 'SESSION_EXPIRED', 'Session is no longer active.'));
      }
      req.verifiedSession = { userId, sessionId };
      next();
    })
    .catch(() => {
      next(new AppError(401, 'SESSION_VERIFY_FAILED', 'Could not verify session.'));
    });
}