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
