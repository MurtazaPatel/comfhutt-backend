CREATE TABLE IF NOT EXISTS public.crux_reports (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id           UUID        NOT NULL REFERENCES public.crux_properties(id) ON DELETE CASCADE,
  score_id              TEXT        NOT NULL DEFAULT '',
  intent_profile        TEXT        NOT NULL DEFAULT 'balanced',
  summary               TEXT        NOT NULL,
  category_narratives   JSONB       NOT NULL,
  risk_flags            TEXT[]      NOT NULL DEFAULT '{}',
  positive_signals      TEXT[]      NOT NULL DEFAULT '{}',
  sebi_disclaimer       TEXT        NOT NULL,
  crux_version          TEXT        NOT NULL,
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  ttl_expires_at        TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_crux_reports_property_intent
  ON public.crux_reports (property_id, intent_profile, ttl_expires_at DESC);

ALTER TABLE public.crux_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access on crux_reports"
  ON public.crux_reports FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "anon read access on crux_reports"
  ON public.crux_reports FOR SELECT TO anon, authenticated
  USING (true);

GRANT SELECT ON public.crux_reports TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crux_reports TO service_role;