-- Migration: CRUX Verification Agent
-- Adds verification runs and per-evidence verification verdicts on top of research evidence.

DO $$ BEGIN
  ALTER TYPE crux_agent_type ADD VALUE 'verification';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.crux_verification_runs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id           UUID        NOT NULL REFERENCES public.crux_properties(id) ON DELETE CASCADE,
  research_run_id       UUID        NOT NULL REFERENCES public.crux_research_runs(id) ON DELETE CASCADE,
  status                TEXT        NOT NULL CHECK (status IN ('running', 'success', 'partial_failed', 'failed')),
  initiated_by_surface  TEXT        NOT NULL CHECK (initiated_by_surface IN ('api', 'lens', 'report')),
  summary_counts        JSONB       NOT NULL DEFAULT '{}',
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ,
  ttl_expires_at        TIMESTAMPTZ NOT NULL,
  last_error            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crux_verification_runs_property_started
  ON public.crux_verification_runs (property_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_crux_verification_runs_property_ttl
  ON public.crux_verification_runs (property_id, ttl_expires_at DESC);

CREATE TABLE IF NOT EXISTS public.crux_evidence_verifications (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                   UUID        NOT NULL REFERENCES public.crux_verification_runs(id) ON DELETE CASCADE,
  property_id              UUID        NOT NULL REFERENCES public.crux_properties(id) ON DELETE CASCADE,
  research_run_id          UUID        NOT NULL REFERENCES public.crux_research_runs(id) ON DELETE CASCADE,
  evidence_item_id         UUID        NOT NULL REFERENCES public.crux_evidence_items(id) ON DELETE CASCADE,
  verification_status      TEXT        NOT NULL CHECK (verification_status IN ('verified', 'contradicted', 'inconclusive', 'stale')),
  verifier_confidence      NUMERIC(4,3) NOT NULL CHECK (verifier_confidence >= 0 AND verifier_confidence <= 1),
  direct_match             BOOLEAN     NOT NULL DEFAULT false,
  freshness_ok             BOOLEAN     NOT NULL DEFAULT true,
  support_score            NUMERIC(4,3) NOT NULL DEFAULT 0 CHECK (support_score >= 0 AND support_score <= 1),
  contradiction_score      NUMERIC(4,3) NOT NULL DEFAULT 0 CHECK (contradiction_score >= 0 AND contradiction_score <= 1),
  supporting_evidence_ids  JSONB       NOT NULL DEFAULT '[]',
  contradicting_evidence_ids JSONB     NOT NULL DEFAULT '[]',
  verification_notes       TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, evidence_item_id)
);

CREATE INDEX IF NOT EXISTS idx_crux_evidence_verifications_property_status_created
  ON public.crux_evidence_verifications (property_id, verification_status, created_at DESC);

ALTER TABLE public.crux_verification_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crux_evidence_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access on crux_verification_runs"
  ON public.crux_verification_runs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated read access on crux_verification_runs"
  ON public.crux_verification_runs FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "service role full access on crux_evidence_verifications"
  ON public.crux_evidence_verifications FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated read access on crux_evidence_verifications"
  ON public.crux_evidence_verifications FOR SELECT TO anon, authenticated
  USING (true);

GRANT SELECT ON public.crux_verification_runs TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crux_verification_runs TO service_role;

GRANT SELECT ON public.crux_evidence_verifications TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crux_evidence_verifications TO service_role;
