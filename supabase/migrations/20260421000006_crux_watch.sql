-- ─────────────────────────────────────────────────────────────
-- Migration: crux_watch_credits + crux_watch_registrations
-- Created:   2026-04-22
-- Note: Monitoring cron jobs deferred to post-MVP.
--       These tables are the credit ledger and stub registry only.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.crux_watch_credits (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL UNIQUE,
  credits_remaining INTEGER     NOT NULL DEFAULT 3 CHECK (credits_remaining >= 0),
  credits_total     INTEGER     NOT NULL DEFAULT 3,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crux_watch_credits_user_id
  ON public.crux_watch_credits (user_id);

CREATE TABLE IF NOT EXISTS public.crux_watch_registrations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   UUID        NOT NULL
                              REFERENCES public.crux_properties(id)
                              ON DELETE CASCADE,
  user_id       UUID        NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  UNIQUE (property_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_crux_watch_registrations_user
  ON public.crux_watch_registrations (user_id, registered_at DESC);

ALTER TABLE public.crux_watch_credits        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crux_watch_registrations  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access on crux_watch_credits"
  ON public.crux_watch_credits FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service role full access on crux_watch_registrations"
  ON public.crux_watch_registrations FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "users access own watch credits"
  ON public.crux_watch_credits FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "users access own watch registrations"
  ON public.crux_watch_registrations FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.crux_watch_credits IS
  '3 free credits per user. Deducted on Watch registration. Monitoring cron deferred to post-MVP.';
COMMENT ON TABLE public.crux_watch_registrations IS
  'Stub registry of watched properties per user. Alerts not yet implemented.';
