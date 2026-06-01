import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

const ALLOWED_ORIGINS = [
  env.FRONTEND_URL,
  'https://crux.comfhutt.com',
  'https://comfhutt.com',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
];

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.headers.origin ?? req.headers.referer;

  if (!origin) {
    next();
    return;
  }

  const originUrl = origin.replace(/\/+$/, '').split('?')[0];
  const allowed = ALLOWED_ORIGINS.some(o => originUrl === o);

  if (!allowed) {
    res.status(403).json({
      error: {
        code: 'CSRF_ERROR',
        message: 'Cross-origin request rejected.',
        status: 403,
      },
    });
    return;
  }

  next();
}