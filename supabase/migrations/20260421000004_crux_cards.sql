-- ─────────────────────────────────────────────────────────────
-- Migration: crux_cards table
-- Created:   2026-04-21
-- Note: No Puppeteer in MVP. card_png_url and card_pdf_url are
--       nullable — populated post-MVP when image gen is added.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.crux_cards (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID        NOT NULL
                                REFERENCES public.crux_properties(id)
                                ON DELETE CASCADE,
  user_id         UUID        NULL,
  share_token     TEXT        NOT NULL UNIQUE,
  card_data       JSONB       NOT NULL,
  card_png_url    TEXT        NULL,
  card_pdf_url    TEXT        NULL,
  view_count      INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crux_cards_share_token
  ON public.crux_cards (share_token);

CREATE INDEX IF NOT EXISTS idx_crux_cards_property_id
  ON public.crux_cards (property_id, created_at DESC);

ALTER TABLE public.crux_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access on crux_cards"
  ON public.crux_cards FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "public read access on crux_cards"
  ON public.crux_cards FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "anon insert on crux_cards"
  ON public.crux_cards FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "anon update view_count on crux_cards"
  ON public.crux_cards FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.crux_cards IS
  'CRUX Analysis Cards. share_token is the public URL key. card_data is a
   point-in-time snapshot — immutable after creation. PNG/PDF deferred to post-MVP.';
