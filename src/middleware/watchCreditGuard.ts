import type { Request, Response, NextFunction } from 'express';
import { getAuth } from '@clerk/express';
import { supabase } from '../lib/db';
import { AppError } from '../modules/crux/shared/errors';

declare global {
  namespace Express {
    interface Request {
      watchCreditsRemaining?: number;
    }
  }
}

export async function watchCreditGuard(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId } = getAuth(req);
    if (!userId) return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));

    const { data, error } = await supabase.rpc(
      'crux_decrement_watch_credit',
      { p_clerk_user_id: userId }
    );

    if (error) {
      console.error({ userId, error }, 'WatchCreditGuard: RPC failed');
      return next(new AppError(500, 'CREDIT_CHECK_FAILED', 'Failed to verify Watch credits.'));
    }

    const remaining = data as number;

    if (remaining === -1) {
      return next(
        new AppError(
          429,
          'WATCH_CREDITS_EXHAUSTED',
          'No Watch credits remaining. Upgrade to Pro or wait for replenishment.'
        )
      );
    }

    req.watchCreditsRemaining = remaining;
    console.info({ userId, remaining }, 'WatchCreditGuard: credit decremented');

    next();
  } catch (err) {
    next(err);
  }
}
