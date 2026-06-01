import type { Request, Response, NextFunction } from 'express';
import { getAuth } from '@clerk/express';

interface AuthEvent {
  event: 'auth_failure' | 'auth_success' | 'token_invalid' | 'rate_limit_hit' | 'csrf_blocked';
  userId?: string | null;
  ip?: string;
  path?: string;
  method?: string;
  requestId?: string;
  timestamp: string;
  reason?: string;
}

function logAuthEvent(event: AuthEvent): void {
  const entry = {
    level: event.event === 'auth_success' ? 'info' : 'warn',
    message: `[AUTH] ${event.event}`,
    ...event,
  };
  if (event.event === 'auth_success') {
    console.info(JSON.stringify(entry));
  } else {
    console.warn(JSON.stringify(entry));
  }
}

export function authMonitor(req: Request, res: Response, next: NextFunction): void {
  const { userId } = getAuth(req);
  const requestId = (req.headers['x-request-id'] as string) || 'unknown';

  res.locals.authEvent = (event: Partial<AuthEvent>) => {
    logAuthEvent({
      event: event.event || 'token_invalid',
      userId: userId || event.userId || null,
      ip: typeof req.ip === 'string' ? req.ip : req.ip?.[0] || req.socket?.remoteAddress,
      path: req.path,
      method: req.method,
      requestId,
      timestamp: new Date().toISOString(),
      reason: event.reason,
    });
  };

  next();
}