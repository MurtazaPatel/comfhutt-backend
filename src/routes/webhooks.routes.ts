import { Router } from 'express';
import { Webhook } from 'svix';
import type { Request, Response, NextFunction } from 'express';
import { syncUserToSupabase } from '../services/userSync.service';
import { supabase } from '../lib/db';
import { AppError } from '../modules/crux/shared/errors';
import { env } from '../config/env';

const router: Router = Router();

// Clerk webhook event types we handle
interface ClerkUserCreatedEvent {
  type: 'user.created';
  data: {
    id: string;
    email_addresses: Array<{ email_address: string; id: string }>;
    phone_numbers: Array<{ phone_number: string; id: string }>;
    primary_email_address_id: string | null;
    primary_phone_number_id: string | null;
    first_name: string | null;
    last_name: string | null;
  };
}

interface ClerkUserDeletedEvent {
  type: 'user.deleted';
  data: {
    id: string;
    deleted: boolean;
  };
}

interface ClerkUserUpdatedEvent {
  type: 'user.updated';
  data: ClerkUserCreatedEvent['data'];
}

type ClerkWebhookEvent =
  | ClerkUserCreatedEvent
  | ClerkUserDeletedEvent
  | ClerkUserUpdatedEvent;

/**
 * POST /clerk
 *
 * Receives Clerk webhook events. Verifies Svix signature.
 * Raw body required — do not apply JSON middleware to this route.
 *
 * Subscribed events: user.created, user.deleted, user.updated
 */
router.post(
  '/clerk',
  async (req: Request, res: Response, next: NextFunction) => {
    const secret = env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      console.error('CLERK_WEBHOOK_SECRET not set');
      return next(new AppError(500, 'CONFIG_ERROR', 'Webhook secret not configured.'));
    }

    // Svix requires these three headers for verification
    const svixId = req.headers['svix-id'] as string;
    const svixTimestamp = req.headers['svix-timestamp'] as string;
    const svixSignature = req.headers['svix-signature'] as string;

    if (!svixId || !svixTimestamp || !svixSignature) {
      return next(new AppError(400, 'MISSING_SVIX_HEADERS', 'Missing Svix webhook headers.'));
    }

    // Verify signature against raw body
    // req.body here is a Buffer because of express.raw() applied only to this router
    const wh = new Webhook(secret);
    let event: ClerkWebhookEvent;

    try {
      event = wh.verify(req.body, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as ClerkWebhookEvent;
    } catch (err) {
      console.warn({ err }, 'Webhook: Svix signature verification failed');
      return next(new AppError(400, 'INVALID_WEBHOOK_SIGNATURE', 'Webhook signature invalid.'));
    }

    console.info({ type: event.type }, 'Webhook: received Clerk event');

    try {
      switch (event.type) {
        case 'user.created':
        case 'user.updated': {
          const d = event.data;
          const primaryEmail =
            d.email_addresses.find(e => e.id === d.primary_email_address_id)
              ?.email_address ?? null;
          const primaryPhone =
            d.phone_numbers.find(p => p.id === d.primary_phone_number_id)
              ?.phone_number ?? null;
          const displayName =
            [d.first_name, d.last_name].filter(Boolean).join(' ') || null;

          await syncUserToSupabase({
            clerkUserId: d.id,
            email: primaryEmail,
            phone: primaryPhone,
            displayName,
            provisionedVia: 'webhook',
          });

          console.info({ clerkUserId: d.id, type: event.type }, 'Webhook: user synced');
          break;
        }

        case 'user.deleted': {
          // Soft delete: anonymize PII, keep the row for audit + watch credit history
          const { error } = await supabase
            .from('crux_users')
            .update({
              email: null,
              phone: null,
              display_name: '[deleted]',
              updated_at: new Date().toISOString(),
            })
            .eq('clerk_user_id', event.data.id);

          if (error) {
            console.error({ error, clerkUserId: event.data.id }, 'Webhook: soft delete failed');
            // Do not throw — return 200 so Clerk does not retry indefinitely
          }

          console.info({ clerkUserId: event.data.id }, 'Webhook: user soft-deleted');
          break;
        }

        default: {
          // Unknown event type — log and ignore, return 200
          console.info({ type: (event as ClerkWebhookEvent).type }, 'Webhook: unhandled event type');
        }
      }

      return res.status(200).json({ received: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
