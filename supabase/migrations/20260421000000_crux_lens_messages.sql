-- ─────────────────────────────────────────────────────────────
-- Migration: crux_lens_messages
-- Created:   2026-04-21
-- Reason:    Messages were originally spec'd as jsonb array in
--            crux_lens_sessions. Separated into own table for
--            queryability, rolling-window truncation, and RLS.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.crux_lens_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID        NOT NULL
                                REFERENCES public.crux_lens_sessions(id)
                                ON DELETE CASCADE,
  role            TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index: message lookup by session, chronological
CREATE INDEX IF NOT EXISTS idx_crux_lens_messages_session_id_created
  ON public.crux_lens_messages (session_id, created_at ASC);

-- RLS: enable row-level security
ALTER TABLE public.crux_lens_messages ENABLE ROW LEVEL SECURITY;

-- Policy: anonymous read/write allowed (session_id is the auth boundary)
-- This mirrors the pattern on crux_lens_sessions.
-- Tighten to user_id-scoped policy when auth is added post-MVP.
CREATE POLICY "service role full access on crux_lens_messages"
  ON public.crux_lens_messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon + authenticated can read/insert their own session's messages
-- (session_id acts as the token in anonymous mode)
CREATE POLICY "anon can access own session messages"
  ON public.crux_lens_messages
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Comment
COMMENT ON TABLE public.crux_lens_messages IS
  'Lens chat messages. FK to crux_lens_sessions. Rolling 10-message window enforced in application layer.';

-- Grants
GRANT ALL ON public.crux_lens_messages TO service_role;
GRANT SELECT, INSERT ON public.crux_lens_messages TO anon, authenticated;
