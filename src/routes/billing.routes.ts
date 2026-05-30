import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/requireAuth';

const router: Router = Router();

/**
 * GET /plans
 * Protected. Returns available billing plans.
 *
 * Response 200:
 * {
 *   "success": true,
 *   "data": {
 *     "plans": [
 *       {
 *         "id": "free",
 *         "name": "Free",
 *         "monthlyScore": 2,
 *         "watchCredit": 10,
 *         "price": 0,
 *         "features": ["Up to 2 scores/month", "10 watch credits", "24h search history"]
 *       },
 *       {
 *         "id": "pro",
 *         "name": "Pro",
 *         "monthlyScore": null,
 *         "watchCredit": null,
 *         "price": 999,
 *         "features": ["Unlimited scores", "Unlimited watch", "Full analytics", "Priority support"]
 *       }
 *     ]
 *   }
 * }
 */
router.get('/plans', requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const plans = [
      {
        id: 'free',
        name: 'Free',
        monthlyScore: 2,
        watchCredit: 10,
        price: 0,
        features: ['Up to 2 scores/month', '10 watch credits', '24h search history'],
      },
      {
        id: 'pro',
        name: 'Pro',
        monthlyScore: null,
        watchCredit: null,
        price: 999,
        features: ['Unlimited scores', 'Unlimited watch', 'Full analytics', 'Priority support'],
      },
    ];

    res.json({
      success: true,
      data: { plans },
    });
    return;
  } catch (err) {
    next(err);
  }
});

export default router;
