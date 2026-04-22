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
