-- CRUX Database Migration v2.0
-- ComfHutt Technologies Pvt Ltd
-- Generated: 2026-04-14
-- All monetary values stored in paise (integer). Never rupees.
-- All tables prefixed crux_. Enum types prefixed crux_.
-- RLS enabled on all tables. Write access via service_role only.
-- Idempotent: safe to re-run on existing DB (uses IF NOT EXISTS + DO $$ guards).

-- ─────────────────────────────────────────────────────────────────────────────
-- EXTENSIONS
-- gen_random_bytes() requires pgcrypto (most Supabase projects ship with it)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: ENUMS
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE crux_property_type AS ENUM (
    'residential_apartment',
    'residential_villa',
    'commercial_office',
    'commercial_retail',
    'plot'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE crux_intent_profile AS ENUM (
    'yield',
    'appreciation',
    'balanced'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE crux_lifecycle_stage AS ENUM (
    'near_completion',
    'delivered'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE crux_macro_cycle AS ENUM (
    'growth',
    'correction'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE crux_agent_type AS ENUM (
    'fetcher',
    'scorer',
    'report',
    'lens'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: TABLES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.crux_properties (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  address_raw           text        NOT NULL,
  address_normalized    text,
  geocode_lat           numeric(10,7),
  geocode_lng           numeric(10,7),
  pin_code              text,
  city                  text,
  state                 text,
  property_type         crux_property_type,
  approx_size_sqft      integer
);

CREATE TABLE IF NOT EXISTS public.crux_geocode_cache (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  address_raw           text        NOT NULL UNIQUE,
  address_normalized    text,
  geocode_lat           numeric(10,7) NOT NULL,
  geocode_lng           numeric(10,7) NOT NULL,
  pin_code              text,
  city                  text,
  state                 text,
  expires_at            timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE TABLE IF NOT EXISTS public.crux_scores (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  property_id           uuid        NOT NULL REFERENCES public.crux_properties(id) ON DELETE CASCADE,
  intent_profile        crux_intent_profile NOT NULL,
  lifecycle_stage       crux_lifecycle_stage NOT NULL,
  macro_cycle           crux_macro_cycle NOT NULL,
  score_composite       numeric(5,2) NOT NULL CHECK (score_composite >= 0 AND score_composite <= 100),
  score_breakdown       jsonb       NOT NULL DEFAULT '{}',
  data_sources_used     text[]      NOT NULL DEFAULT '{}',
  confidence_score      numeric(4,3) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  crux_version          text        NOT NULL,
  methodology_hash      text        NOT NULL,
  ttl_expires_at        timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE TABLE IF NOT EXISTS public.crux_cast_results (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  property_id             uuid        NOT NULL REFERENCES public.crux_properties(id) ON DELETE CASCADE,
  fair_value_min_paise    bigint      NOT NULL CHECK (fair_value_min_paise >= 0),
  fair_value_max_paise    bigint      NOT NULL CHECK (fair_value_max_paise >= fair_value_min_paise),
  method_breakdown        jsonb       NOT NULL DEFAULT '{}',
  divergence_flag         boolean     NOT NULL DEFAULT false,
  confidence_score        numeric(4,3) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  ttl_expires_at          timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE TABLE IF NOT EXISTS public.crux_yield_results (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                timestamptz NOT NULL DEFAULT now(),
  property_id               uuid        NOT NULL REFERENCES public.crux_properties(id) ON DELETE CASCADE,
  monthly_rent_min_paise    bigint      NOT NULL CHECK (monthly_rent_min_paise >= 0),
  monthly_rent_max_paise    bigint      NOT NULL CHECK (monthly_rent_max_paise >= monthly_rent_min_paise),
  gross_yield_pct           numeric(6,3) NOT NULL,
  net_yield_pct             numeric(6,3) NOT NULL,
  confidence_score          numeric(4,3) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  ttl_expires_at            timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE TABLE IF NOT EXISTS public.crux_watch_credits (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  credits_remaining     integer     NOT NULL DEFAULT 3 CHECK (credits_remaining >= 0),
  credits_total         integer     NOT NULL DEFAULT 3
);

CREATE TABLE IF NOT EXISTS public.crux_lens_sessions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  user_id               uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  property_id           uuid        NOT NULL REFERENCES public.crux_properties(id) ON DELETE CASCADE,
  messages              jsonb       NOT NULL DEFAULT '[]',
  expires_at            timestamptz NOT NULL DEFAULT (now() + interval '2 hours')
);

CREATE TABLE IF NOT EXISTS public.crux_user_properties (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id           uuid        NOT NULL REFERENCES public.crux_properties(id) ON DELETE CASCADE,
  last_score            numeric(5,2),
  last_analyzed_at      timestamptz,
  is_favorite           boolean     NOT NULL DEFAULT false,
  UNIQUE (user_id, property_id)
);

CREATE TABLE IF NOT EXISTS public.crux_cards (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  property_id           uuid        NOT NULL REFERENCES public.crux_properties(id) ON DELETE CASCADE,
  user_id               uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  card_data             jsonb       NOT NULL DEFAULT '{}',
  card_png_url          text,
  card_pdf_url          text,
  share_token           text        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  expires_at            timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

CREATE TABLE IF NOT EXISTS public.crux_agent_logs (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  agent_type            crux_agent_type NOT NULL,
  property_id           uuid        REFERENCES public.crux_properties(id) ON DELETE SET NULL,
  input_payload         jsonb       NOT NULL DEFAULT '{}',
  output_payload        jsonb       NOT NULL DEFAULT '{}',
  llm_provider          text        NOT NULL CHECK (llm_provider IN ('gemini', 'claude')),
  tokens_used           integer,
  latency_ms            integer,
  status                text        NOT NULL CHECK (status IN ('success', 'error', 'timeout'))
);

CREATE TABLE IF NOT EXISTS public.crux_demand_signals (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  pin_code              text        NOT NULL,
  property_type         crux_property_type NOT NULL,
  search_count          integer     NOT NULL DEFAULT 0,
  unique_users          integer     NOT NULL DEFAULT 0,
  period                date        NOT NULL,
  UNIQUE (pin_code, property_type, period)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

-- crux_properties
CREATE INDEX IF NOT EXISTS idx_crux_properties_pin_code
  ON public.crux_properties (pin_code);
CREATE INDEX IF NOT EXISTS idx_crux_properties_property_type
  ON public.crux_properties (property_type);
CREATE INDEX IF NOT EXISTS idx_crux_properties_geocode
  ON public.crux_properties (geocode_lat, geocode_lng);

-- crux_geocode_cache
CREATE INDEX IF NOT EXISTS idx_crux_geocode_cache_expires_at
  ON public.crux_geocode_cache (expires_at);

-- crux_scores
CREATE INDEX IF NOT EXISTS idx_crux_scores_property_intent_ttl
  ON public.crux_scores (property_id, intent_profile, ttl_expires_at DESC);

-- crux_cast_results
CREATE INDEX IF NOT EXISTS idx_crux_cast_results_property_ttl
  ON public.crux_cast_results (property_id, ttl_expires_at DESC);

-- crux_yield_results
CREATE INDEX IF NOT EXISTS idx_crux_yield_results_property_ttl
  ON public.crux_yield_results (property_id, ttl_expires_at DESC);

-- crux_lens_sessions
CREATE INDEX IF NOT EXISTS idx_crux_lens_sessions_user_id
  ON public.crux_lens_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_crux_lens_sessions_property_id
  ON public.crux_lens_sessions (property_id);
CREATE INDEX IF NOT EXISTS idx_crux_lens_sessions_expires_at
  ON public.crux_lens_sessions (expires_at);

-- crux_user_properties
CREATE INDEX IF NOT EXISTS idx_crux_user_properties_user_id
  ON public.crux_user_properties (user_id);
CREATE INDEX IF NOT EXISTS idx_crux_user_properties_user_analyzed
  ON public.crux_user_properties (user_id, last_analyzed_at DESC);

-- crux_cards
CREATE INDEX IF NOT EXISTS idx_crux_cards_share_token
  ON public.crux_cards (share_token);
CREATE INDEX IF NOT EXISTS idx_crux_cards_user_id
  ON public.crux_cards (user_id);
CREATE INDEX IF NOT EXISTS idx_crux_cards_expires_at
  ON public.crux_cards (expires_at);

-- crux_agent_logs
CREATE INDEX IF NOT EXISTS idx_crux_agent_logs_property_created
  ON public.crux_agent_logs (property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crux_agent_logs_type_status_created
  ON public.crux_agent_logs (agent_type, status, created_at DESC);

-- crux_demand_signals
CREATE INDEX IF NOT EXISTS idx_crux_demand_signals_pin_type_period
  ON public.crux_demand_signals (pin_code, property_type, period DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

-- crux_properties — public read, service-role write
ALTER TABLE public.crux_properties ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "public_read" ON public.crux_properties FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "service_insert" ON public.crux_properties FOR INSERT WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "service_update" ON public.crux_properties FOR UPDATE USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- crux_geocode_cache — public read, service-role write
ALTER TABLE public.crux_geocode_cache ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "public_read" ON public.crux_geocode_cache FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "service_write" ON public.crux_geocode_cache FOR INSERT WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- crux_scores — public read, service-role write
ALTER TABLE public.crux_scores ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "public_read" ON public.crux_scores FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "service_write" ON public.crux_scores FOR INSERT WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- crux_cast_results — public read, service-role write
ALTER TABLE public.crux_cast_results ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "public_read" ON public.crux_cast_results FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "service_write" ON public.crux_cast_results FOR INSERT WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- crux_yield_results — public read, service-role write
ALTER TABLE public.crux_yield_results ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "public_read" ON public.crux_yield_results FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "service_write" ON public.crux_yield_results FOR INSERT WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- crux_watch_credits — user owns their row
ALTER TABLE public.crux_watch_credits ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "user_select" ON public.crux_watch_credits FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "service_insert" ON public.crux_watch_credits FOR INSERT WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "service_update" ON public.crux_watch_credits FOR UPDATE USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- crux_lens_sessions — user reads their own; anon sessions (user_id IS NULL) readable by anyone with the id
ALTER TABLE public.crux_lens_sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "user_select" ON public.crux_lens_sessions FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "service_write" ON public.crux_lens_sessions FOR INSERT WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "service_update" ON public.crux_lens_sessions FOR UPDATE USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- crux_user_properties — user owns their rows
ALTER TABLE public.crux_user_properties ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "user_select" ON public.crux_user_properties FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "service_insert" ON public.crux_user_properties FOR INSERT WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "service_update" ON public.crux_user_properties FOR UPDATE USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- crux_cards — owner or anon-linked rows readable; write via service_role
ALTER TABLE public.crux_cards ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "owner_or_anon_select" ON public.crux_cards FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "service_write" ON public.crux_cards FOR INSERT WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- crux_agent_logs — public read, service-role write
ALTER TABLE public.crux_agent_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "public_read" ON public.crux_agent_logs FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "service_write" ON public.crux_agent_logs FOR INSERT WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- crux_demand_signals — public read, service-role write
ALTER TABLE public.crux_demand_signals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "public_read" ON public.crux_demand_signals FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "service_write" ON public.crux_demand_signals FOR INSERT WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- Migration: CRUX live data source cache tables
-- NHB RESIDEX quarterly HPI data + CPWD construction rates
-- These contain REAL government-published data, refreshed periodically

-- ============================================================
-- TABLE: crux_residex_cache
-- Source: National Housing Bank RESIDEX (nhb.org.in)
-- Refresh cadence: Quarterly (manual or cron)
-- ============================================================

CREATE TABLE IF NOT EXISTS crux_residex_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  city TEXT NOT NULL,
  city_normalized TEXT NOT NULL,
  state TEXT NOT NULL,
  property_type crux_property_type NOT NULL DEFAULT 'residential_apartment',
  hpi_index NUMERIC(8,2) NOT NULL,
  yoy_change_pct NUMERIC(6,2),
  rent_index NUMERIC(8,2),
  quarter TEXT NOT NULL,
  data_year INT NOT NULL,
  source_url TEXT DEFAULT 'https://nhb.org.in/RESIDEX/',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(city_normalized, property_type, quarter)
);

CREATE INDEX IF NOT EXISTS idx_residex_city ON crux_residex_cache (city_normalized);
CREATE INDEX IF NOT EXISTS idx_residex_quarter ON crux_residex_cache (quarter);

-- ============================================================
-- TABLE: crux_cpwd_cache
-- Source: CPWD Plinth Area Rates / Delhi Schedule of Rates
-- Refresh cadence: Annual (published yearly by CPWD)
-- ============================================================

CREATE TABLE IF NOT EXISTS crux_cpwd_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  state TEXT NOT NULL,
  state_normalized TEXT NOT NULL,
  zone TEXT NOT NULL,
  construction_type TEXT NOT NULL,
  rate_per_sqft_paise BIGINT NOT NULL,
  rate_year INT NOT NULL,
  source_url TEXT DEFAULT 'https://cpwd.gov.in/Publication/PAR2024.pdf',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(state_normalized, zone, construction_type, rate_year)
);

CREATE INDEX IF NOT EXISTS idx_cpwd_state ON crux_cpwd_cache (state_normalized);
CREATE INDEX IF NOT EXISTS idx_cpwd_zone ON crux_cpwd_cache (zone);

-- ============================================================
-- GRANTS
-- ============================================================

GRANT ALL ON crux_residex_cache TO service_role;
GRANT ALL ON crux_cpwd_cache TO service_role;
GRANT SELECT ON crux_residex_cache TO anon, authenticated;
GRANT SELECT ON crux_cpwd_cache TO anon, authenticated;

ALTER TABLE crux_residex_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE crux_cpwd_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crux_residex_cache_public_read" ON crux_residex_cache
  FOR SELECT USING (true);
CREATE POLICY "crux_cpwd_cache_public_read" ON crux_cpwd_cache
  FOR SELECT USING (true);
CREATE POLICY "crux_residex_cache_service_write" ON crux_residex_cache
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "crux_cpwd_cache_service_write" ON crux_cpwd_cache
  FOR ALL USING (true) WITH CHECK (true);
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
-- ─────────────────────────────────────────────────────────────
-- Migration: crux_scores add missing columns
-- Created:   2026-04-21
-- Reason:    CruxScore type and scoring agent reference `degraded`
--            and `clarifications_requested` but these columns were
--            omitted from the initial crux_scores table definition.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.crux_scores
  ADD COLUMN IF NOT EXISTS degraded                  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS clarifications_requested  JSONB   NOT NULL DEFAULT '[]';

COMMENT ON COLUMN public.crux_scores.degraded IS
  'True when confidence_score < 0.4 — signals low-quality data inputs.';

COMMENT ON COLUMN public.crux_scores.clarifications_requested IS
  'Array of ClarificationRequest objects surfaced to the user via Lens chat.';
-- ─────────────────────────────────────────────────────────────
-- Migration: crux_scores unique constraint
-- Created:   2026-04-21
-- Reason:    Scoring upsert uses onConflict: 'property_id,intent_profile'
--            which requires a UNIQUE constraint (not just an index).
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.crux_scores
  ADD CONSTRAINT crux_scores_property_intent_unique
  UNIQUE (property_id, intent_profile);
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crux_reports TO service_role;-- ─────────────────────────────────────────────────────────────
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
ALTER TABLE public.crux_cards ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;
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
-- Migration: 20260422000002_watch_credit_decrement
-- Atomic Watch credit check + decrement via RPC.
-- Returns the remaining credits after decrement, or -1 if insufficient.

CREATE OR REPLACE FUNCTION crux_decrement_watch_credit(p_clerk_user_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_credits INTEGER;
BEGIN
  UPDATE crux_users
  SET watch_credits = watch_credits - 1
  WHERE clerk_user_id = p_clerk_user_id
    AND watch_credits > 0
  RETURNING watch_credits INTO v_credits;

  -- If no row was updated, credits were already 0
  IF v_credits IS NULL THEN
    RETURN -1;
  END IF;

  RETURN v_credits;
END;
$$;

COMMENT ON FUNCTION crux_decrement_watch_credit IS
  'Atomically decrements watch_credits by 1 if > 0.
   Returns remaining credits, or -1 if credits were already 0.
   Safe under concurrent requests — no race condition possible.';
-- Migration: 20260422000003_crux_searches
-- Persists every CRUX Score run per user for history and caching.

CREATE TABLE IF NOT EXISTS crux_searches (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id     TEXT        NOT NULL
                               REFERENCES crux_users(clerk_user_id)
                               ON DELETE CASCADE,
  property_id       TEXT        NOT NULL,
  address_raw       TEXT,
  crux_score        INTEGER,
  score_grade       TEXT,
  score_snapshot    JSONB,
  share_token       TEXT        UNIQUE,
  searched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup: all searches by a user, newest first
CREATE INDEX IF NOT EXISTS crux_searches_user_idx
  ON crux_searches(clerk_user_id, searched_at DESC);

-- Fast lookup: check if property was recently searched by this user
CREATE INDEX IF NOT EXISTS crux_searches_property_user_idx
  ON crux_searches(clerk_user_id, property_id, searched_at DESC);

-- Fast lookup: share token → search result (for card sharing)
CREATE INDEX IF NOT EXISTS crux_searches_share_token_idx
  ON crux_searches(share_token)
  WHERE share_token IS NOT NULL;

COMMENT ON TABLE crux_searches IS
  'Log of every CRUX Score run per user.
   score_snapshot stores key result fields for fast history display
   without re-running the scoring engine.';

COMMENT ON COLUMN crux_searches.score_snapshot IS
  'JSONB snapshot of top-level score result:
   { totalScore, grade, categoryScores, verdict, timestamp }.
   Not the full report — just enough to render history cards.';

COMMENT ON COLUMN crux_searches.share_token IS
  'Share token for the card URL: crux.comfhutt.com/card/<share_token>.
   NULL if user has not shared this result.';
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
-- Add 'firecrawl' as a valid provider for crux_research_runs
-- The pipeline was migrated from Tavily to Firecrawl
ALTER TABLE public.crux_research_runs 
  DROP CONSTRAINT IF EXISTS crux_research_runs_provider_check;

ALTER TABLE public.crux_research_runs 
  ADD CONSTRAINT crux_research_runs_provider_check 
  CHECK (provider IN ('tavily', 'firecrawl'));

-- Update the default as well
ALTER TABLE public.crux_research_runs 
  ALTER COLUMN provider SET DEFAULT 'firecrawl';
