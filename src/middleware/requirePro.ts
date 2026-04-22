import { Request, Response, NextFunction } from 'express';
import { getAuth } from '@clerk/express';
import { supabase } from '../lib/db';
import { AppError } from '../modules/crux/shared/errors';

export async function requirePro(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const { data: user, error } = await supabase
      .from('crux_users')
      .select('plan_tier')
      .eq('clerk_user_id', userId)
      .single();

    if (error || !user) {
      console.error({ error, userId }, 'requirePro: user fetch failed');
      throw new AppError(500, 'USER_FETCH_FAILED', 'Failed to fetch user plan.');
    }

    if (user.plan_tier !== 'pro') {
      throw new AppError(403, 'PRO_REQUIRED', 'This feature requires a Pro plan.');
    }

    next();
  } catch (err) {
    next(err);
  }
}
