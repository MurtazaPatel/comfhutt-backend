-- Migration: CRUX Research Evidence Agent
-- Adds research runs, document tracking, and evidence persistence.

DO $$ BEGIN
  ALTER TYPE crux_agent_type ADD VALUE 'research';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.crux_properties
  ADD COLUMN IF NOT EXISTS developer_name TEXT;

CREATE TABLE IF NOT EXISTS public.crux_research_runs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id           UUID        NOT NULL REFERENCES public.crux_properties(id) ON DELETE CASCADE,
  status                TEXT        NOT NULL CHECK (status IN ('running', 'success', 'partial_failed', 'failed')),
  initiated_by_surface  TEXT        NOT NULL CHECK (initiated_by_surface IN ('api', 'lens', 'report')),
  provider              TEXT        NOT NULL DEFAULT 'tavily' CHECK (provider IN ('tavily')),
  seed_urls             JSONB       NOT NULL DEFAULT '[]',
  document_paths        JSONB       NOT NULL DEFAULT '[]',
  summary_counts        JSONB       NOT NULL DEFAULT '{}',
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ,
  ttl_expires_at        TIMESTAMPTZ NOT NULL,
  last_error            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crux_research_runs_property_started
  ON public.crux_research_runs (property_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_crux_research_runs_property_ttl
  ON public.crux_research_runs (property_id, ttl_expires_at DESC);

CREATE TABLE IF NOT EXISTS public.crux_research_documents (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                UUID        NOT NULL REFERENCES public.crux_research_runs(id) ON DELETE CASCADE,
  file_path             TEXT        NOT NULL,
  file_type             TEXT        NOT NULL,
  content_hash          TEXT        NOT NULL,
  parse_status          TEXT        NOT NULL CHECK (parse_status IN ('pending', 'parsed', 'failed', 'skipped')),
  parse_error           TEXT,
  parsed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crux_research_documents_run
  ON public.crux_research_documents (run_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.crux_evidence_items (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                UUID        NOT NULL REFERENCES public.crux_research_runs(id) ON DELETE CASCADE,
  property_id           UUID        NOT NULL REFERENCES public.crux_properties(id) ON DELETE CASCADE,
  domain                TEXT        NOT NULL CHECK (domain IN ('property', 'developer', 'locality', 'market', 'legal', 'environment')),
  source_kind           TEXT        NOT NULL CHECK (source_kind IN ('web', 'document')),
  authority_tier        TEXT        NOT NULL CHECK (authority_tier IN ('official', 'primary', 'secondary', 'unknown')),
  status                TEXT        NOT NULL CHECK (status IN ('accepted', 'weak', 'rejected')),
  claim_text            TEXT        NOT NULL,
  normalized_claim      JSONB       NOT NULL DEFAULT '{}',
  source_title          TEXT        NOT NULL,
  source_url            TEXT,
  source_path           TEXT,
  excerpt               TEXT        NOT NULL DEFAULT '',
  observed_at           TIMESTAMPTZ,
  freshness_expires_at  TIMESTAMPTZ,
  confidence            NUMERIC(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  rejection_reason      TEXT,
  claim_hash            TEXT        NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crux_evidence_items_run_claim_hash
  ON public.crux_evidence_items (run_id, claim_hash);

CREATE INDEX IF NOT EXISTS idx_crux_evidence_items_property_status_created
  ON public.crux_evidence_items (property_id, status, created_at DESC);

ALTER TABLE public.crux_reports
  ADD COLUMN IF NOT EXISTS research_highlights TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS citations JSONB NOT NULL DEFAULT '[]';

ALTER TABLE public.crux_research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crux_research_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crux_evidence_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service role full access on crux_research_runs"
    ON public.crux_research_runs FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service role full access on crux_research_documents"
    ON public.crux_research_documents FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service role full access on crux_evidence_items"
    ON public.crux_evidence_items FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated read access on crux_research_runs"
    ON public.crux_research_runs FOR SELECT TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated read access on crux_research_documents"
    ON public.crux_research_documents FOR SELECT TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated read access on crux_evidence_items"
    ON public.crux_evidence_items FOR SELECT TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
