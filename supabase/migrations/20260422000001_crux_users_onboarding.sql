-- Migration: 20260422000001_crux_users_onboarding
-- Adds onboarding tracking and provisioning source to crux_users

ALTER TABLE crux_users
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS provisioned_via TEXT NOT NULL DEFAULT 'sync'
    CHECK (provisioned_via IN ('webhook', 'sync'));

COMMENT ON COLUMN crux_users.onboarding_completed IS
  'Set to TRUE by frontend after user dismisses onboarding banner.
   Backend exposes this via /auth/me as isNewUser = NOT onboarding_completed.';

COMMENT ON COLUMN crux_users.provisioned_via IS
  'webhook = row created by user.created Clerk event (preferred path).
   sync = row created by first /auth/me call (fallback path).';
