import { Router } from "express";
import { getAuth, createClerkClient } from "@clerk/express";
import { requireAuth } from "../middleware/requireAuth";
import {
  syncUserToSupabase,
  getUserFromSupabase,
} from "../services/userSync.service";
import { supabase } from "../lib/db";
import { AppError } from "../modules/crux/shared/errors";
import { env } from "../config/env";
import type { Request, Response, NextFunction } from "express";

const router: Router = Router();
const clerkClient = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });

/**
 * GET /auth/me
 * Protected. Verifies Clerk session, syncs user, returns CRUX profile.
 *
 * Headers required:
 *   Authorization: Bearer <clerk_session_token>
 *
 * Response 200:
 * {
 *   "userId": "user_clerk_xxx",
 *   "email": "user@example.com",
 *   "displayName": "Murtaza",
 *   "planTier": "free",
 *   "watchCredits": 3,
 *   "totalSearches": 0,
 *   "createdAt": "2026-04-22T..."
 * }
 */
router.get(
  "/me",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = getAuth(req);
      if (!userId)
        throw new AppError(401, "UNAUTHORIZED", "Authentication required.");

      // Fetch Clerk user for email/phone/name
      const clerkUser = await clerkClient.users.getUser(userId);

      const primaryEmail =
        clerkUser.emailAddresses.find(
          (e) => e.id === clerkUser.primaryEmailAddressId
        )?.emailAddress ?? null;

      const primaryPhone =
        clerkUser.phoneNumbers.find((p) => p.id === clerkUser.primaryPhoneNumberId)
          ?.phoneNumber ?? null;

      const displayName =
        [clerkUser.firstName, clerkUser.lastName]
          .filter(Boolean)
          .join(" ") || null;

      // Sync to Supabase (upsert — safe to call on every request)
      await syncUserToSupabase({
        clerkUserId: userId,
        email: primaryEmail,
        phone: primaryPhone,
        displayName,
        provisionedVia: 'sync',
      });

      // Fetch CRUX profile from Supabase
      const profile = await getUserFromSupabase(userId);

      // Handle new-user race condition: Clerk webhook may not have fired yet.
      // syncUserToSupabase already upserted the row, so if profile is still null
      // it means a DB propagation delay. Return a safe synthetic new-user profile
      // so the frontend can redirect to onboarding without a 404 error.
      if (!profile) {
        return res.json({
          userId,
          email: primaryEmail,
          phone: primaryPhone,
          displayName,
          planTier: "free",
          watchCredits: 3,
          totalSearches: 0,
          isNewUser: true,
          createdAt: new Date().toISOString(),
        });
      }

      return res.json({
        userId: profile.clerk_user_id,
        email: profile.email,
        phone: profile.phone,
        displayName: profile.display_name,
        planTier: profile.plan_tier,
        watchCredits: profile.watch_credits,
        totalSearches: profile.total_searches,
        isNewUser: !profile.onboarding_completed,
        createdAt: profile.created_at,
      });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * PATCH /onboarding-complete
 * Protected. Called by frontend after user dismisses onboarding banner.
 * Sets onboarding_completed = true so isNewUser becomes false on next /auth/me.
 */
router.patch(
  "/onboarding-complete",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = getAuth(req);
      if (!userId)
        throw new AppError(401, "UNAUTHORIZED", "Authentication required.");

      const { role, city, budget } = req.body || {};

      const { error } = await supabase
        .from("crux_users")
        .update({ 
          onboarding_completed: true,
          role: typeof role === "string" ? role : null,
          city: typeof city === "string" ? city : null,
          budget: typeof budget === "string" ? budget : null,
        })
        .eq("clerk_user_id", userId);

      if (error) {
        throw new AppError(500, "UPDATE_FAILED", "Failed to update onboarding status.");
      }

      return res.json({ success: true });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
