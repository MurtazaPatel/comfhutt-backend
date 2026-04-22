-- Migration: 20260422000000_crux_users
-- Creates the crux_users table. Clerk user ID is the primary key.
-- We never store passwords or auth credentials here.

CREATE TABLE IF NOT EXISTS crux_users (
  clerk_user_id      TEXT        PRIMARY KEY,
  email              TEXT        UNIQUE,
  phone              TEXT,
  display_name       TEXT,
  plan_tier          TEXT        NOT NULL DEFAULT 'free'
                                 CHECK (plan_tier IN ('free', 'pro')),
  watch_credits      INTEGER     NOT NULL DEFAULT 3
                                 CHECK (watch_credits >= 0),
  total_searches     INTEGER     NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION crux_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER crux_users_updated_at
  BEFORE UPDATE ON crux_users
  FOR EACH ROW
  EXECUTE FUNCTION crux_update_updated_at();

-- Index for fast lookup by email (used in /auth/me)
CREATE INDEX IF NOT EXISTS crux_users_email_idx ON crux_users(email);

-- Comments for future engineers
COMMENT ON TABLE crux_users IS
  'CRUX platform users. clerk_user_id is PK — Clerk owns all credentials.';
COMMENT ON COLUMN crux_users.watch_credits IS
  'Free tier: 3 Watch credits. Replenished manually for now; automated in v2.';
COMMENT ON COLUMN crux_users.plan_tier IS
  'free = 3 Watch credits, full score. pro = ₹199/month, personalized features.';
