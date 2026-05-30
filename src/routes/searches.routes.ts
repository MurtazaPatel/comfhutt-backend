import { Router, Request, Response, NextFunction } from 'express';
import { getAuth } from '@clerk/express';
import { requireAuth } from '../middleware/requireAuth';
import { getRecentSearches } from '../services/searchHistory.service';
import { AppError } from '../modules/crux/shared/errors';

const router: Router = Router();

/**
 * GET /searches/recent
 * Protected. Returns last 10 searches for the authenticated user.
 *
 * Response 200:
 * {
 *   "success": true,
 *   "data": {
 *     "searches": [
 *       {
 *         "id": "uuid",
 *         "propertyId": "...",
 *         "addressRaw": "...",
 *         "cruxScore": 74,
 *         "scoreGrade": "B",
 *         "shareToken": null,
 *         "searchedAt": "2026-04-22T..."
 *       }
 *     ]
 *   }
 * }
 */
router.get(
  '/recent',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = getAuth(req);
      if (!userId) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');

      const searches = await getRecentSearches(userId, 10);

      res.json({
        success: true,
        data: {
          searches: searches.map(s => ({
            id: s.id,
            propertyId: s.property_id,
            addressRaw: s.address_raw,
            cruxScore: s.crux_score,
            scoreGrade: s.score_grade,
            shareToken: s.share_token,
            searchedAt: s.searched_at,
          })),
        },
      });
      return;
    } catch (err) {
      next(err);
    }
  }
);

export default router;
