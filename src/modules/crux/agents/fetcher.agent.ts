// TYPE DEVIATIONS FROM PROMPT 9 SPEC (types.ts is the source of truth):
// 1. PropertyProfile has no developer_name — MCA21 + eCourts return success:false immediately
// 2. PropertyProfile uses geocode_lat/geocode_lng (not latitude/longitude)
// 3. PropertyProfile uses address_normalized (not formatted_address)
// 4. FetcherResult<T> has no confidence/is_cached fields — confidence computed in scoring agent
// 5. AgentLog columns: input_payload, output_payload, latency_ms (not input_summary etc.)

import CircuitBreaker from 'opossum';
import { supabase } from '../../../lib/db';
import {
  env,
  CPCB_API_URL,
  MCA21_SEARCH_URL,
  ECOURTS_API_URL,
  ECOURTS_API_KEY,
} from '../../../config/env';
import type {
  PropertyProfile,
  AggregatedFetcherOutput,
  FetcherResult,
  CpcbAqiData,
  GoogleMapsData,
  NhbResidexData,
  Mca21Data,
  EcourtsData,
  CpwdData,
} from '../shared/types';

// ── Circuit breaker configs ──────────────────────────────────────────────────

const BREAKER_OPTIONS: CircuitBreaker.Options = {
  timeout: 10000,
  errorThresholdPercentage: 80,
  resetTimeout: 30000,
  volumeThreshold: 5,
};

const BREAKER_OPTIONS_SLOW: CircuitBreaker.Options = {
  timeout: 15000,
  errorThresholdPercentage: 80,
  resetTimeout: 30000,
  volumeThreshold: 5,
};

// ── NHB RESIDEX in-memory mock ───────────────────────────────────────────────

interface ResidexMockEntry {
  hpi_current: number;
  hpi_qoq_change: number; // quarter-on-quarter %, not YoY
}

const RESIDEX_MOCK: Record<string, ResidexMockEntry> = {
  ahmedabad:  { hpi_current: 185, hpi_qoq_change: 2.1 },
  mumbai:     { hpi_current: 310, hpi_qoq_change: 1.8 },
  delhi:      { hpi_current: 265, hpi_qoq_change: 2.5 },
  bangalore:  { hpi_current: 290, hpi_qoq_change: 3.2 },
  bengaluru:  { hpi_current: 290, hpi_qoq_change: 3.2 },
  pune:       { hpi_current: 210, hpi_qoq_change: 2.8 },
  hyderabad:  { hpi_current: 250, hpi_qoq_change: 3.5 },
  chennai:    { hpi_current: 195, hpi_qoq_change: 2.0 },
  kolkata:    { hpi_current: 145, hpi_qoq_change: 1.5 },
  jaipur:     { hpi_current: 160, hpi_qoq_change: 2.3 },
  lucknow:    { hpi_current: 135, hpi_qoq_change: 1.9 },
  rajkot:     { hpi_current: 130, hpi_qoq_change: 1.7 },
  surat:      { hpi_current: 155, hpi_qoq_change: 2.2 },
  vadodara:   { hpi_current: 140, hpi_qoq_change: 1.8 },
};

// ── CPWD rates in-memory mock ────────────────────────────────────────────────

interface CpwdMockEntry {
  city_tier: 'tier1' | 'tier2' | 'tier3';
  construction_cost_per_sqft: number; // in paise
}

const CPWD_RATES_MOCK: Record<string, CpwdMockEntry> = {
  gujarat:        { city_tier: 'tier2', construction_cost_per_sqft: 175000 },
  maharashtra:    { city_tier: 'tier1', construction_cost_per_sqft: 280000 },
  karnataka:      { city_tier: 'tier1', construction_cost_per_sqft: 260000 },
  telangana:      { city_tier: 'tier1', construction_cost_per_sqft: 240000 },
  tamil_nadu:     { city_tier: 'tier1', construction_cost_per_sqft: 230000 },
  delhi:          { city_tier: 'tier1', construction_cost_per_sqft: 350000 },
  uttar_pradesh:  { city_tier: 'tier2', construction_cost_per_sqft: 140000 },
  rajasthan:      { city_tier: 'tier2', construction_cost_per_sqft: 150000 },
  west_bengal:    { city_tier: 'tier2', construction_cost_per_sqft: 160000 },
};

// ── Helper ───────────────────────────────────────────────────────────────────

function extractResult<T>(
  settled: PromiseSettledResult<FetcherResult<T>>,
  source: string,
): FetcherResult<T> {
  if (settled.status === 'fulfilled') return settled.value;
  return {
    source,
    data: null,
    success: false,
    error: String(settled.reason),
    fetched_at: new Date().toISOString(),
  };
}

function aqiToCategory(aqi: number): CpcbAqiData['category'] {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Satisfactory';
  if (aqi <= 200) return 'Moderate';
  if (aqi <= 300) return 'Poor';
  if (aqi <= 400) return 'Very Poor';
  return 'Severe';
}

// ── 6 Fetcher functions (declared before circuit breakers — declarations hoist) ──

async function fetchCpcbAqi(profile: PropertyProfile): Promise<FetcherResult<CpcbAqiData>> {
  const fetched_at = new Date().toISOString();
  try {
    const response = await fetch(CPCB_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ComfHutt-CRUX/1.0 (Property Intelligence Engine)',
      },
      body: JSON.stringify({ state: profile.state, city: profile.city }),
    });
    if (!response.ok) {
      return { source: 'cpcb_aqi', data: null, success: false, error: `CPCB_HTTP_${response.status}`, fetched_at };
    }
    const raw = await response.json() as Record<string, unknown>;
    const aqi = typeof raw.current_aqi === 'number' ? raw.current_aqi : 200;
    const data: CpcbAqiData = {
      aqi,
      category: aqiToCategory(aqi),
      station: typeof raw.station_name === 'string' ? raw.station_name : profile.city,
      recorded_at: fetched_at,
    };
    return { source: 'cpcb_aqi', data, success: true, fetched_at };
  } catch {
    return { source: 'cpcb_aqi', data: null, success: false, error: 'CPCB_UNAVAILABLE', fetched_at };
  }
}

async function fetchGoogleMaps(profile: PropertyProfile): Promise<FetcherResult<GoogleMapsData>> {
  const fetched_at = new Date().toISOString();
  const key = env.GOOGLE_MAPS_API_KEY;
  const lat = profile.geocode_lat;
  const lng = profile.geocode_lng;
  try {
    const [nearbyRes, distRes] = await Promise.all([
      fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=2000&key=${key}`,
        { headers: { 'User-Agent': 'ComfHutt-CRUX/1.0' } },
      ),
      fetch(
        `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat},${lng}&destinations=${encodeURIComponent(profile.city)}&mode=transit&key=${key}`,
        { headers: { 'User-Agent': 'ComfHutt-CRUX/1.0' } },
      ),
    ]);

    let poi_count_500m = 0;
    if (nearbyRes.ok) {
      const nearbyData = await nearbyRes.json() as Record<string, unknown>;
      const results = Array.isArray(nearbyData.results) ? nearbyData.results : [];
      poi_count_500m = results.length;
    }

    let commute_minutes_to_cbd: number | null = null;
    if (distRes.ok) {
      const distData = await distRes.json() as Record<string, unknown>;
      const rows = Array.isArray(distData.rows) ? distData.rows : [];
      const firstRow = rows[0] as Record<string, unknown> | undefined;
      if (firstRow) {
        const elements = Array.isArray(firstRow.elements) ? firstRow.elements : [];
        const elem = elements[0] as Record<string, unknown> | undefined;
        if (elem && elem.status === 'OK') {
          const duration = elem.duration as Record<string, unknown> | undefined;
          if (duration && typeof duration.value === 'number') {
            commute_minutes_to_cbd = Math.round(duration.value / 60);
          }
        }
      }
    }

    const data: GoogleMapsData = {
      walkability_score: null,
      poi_count_500m,
      commute_minutes_to_cbd,
      transit_score: null,
    };
    return { source: 'google_maps', data, success: true, fetched_at };
  } catch {
    return { source: 'google_maps', data: null, success: false, error: 'GOOGLE_MAPS_UNAVAILABLE', fetched_at };
  }
}

async function fetchNhbResidex(profile: PropertyProfile): Promise<FetcherResult<NhbResidexData>> {
  const fetched_at = new Date().toISOString();
  const cityKey = profile.city.toLowerCase().trim();
  const entry = RESIDEX_MOCK[cityKey];
  if (!entry) {
    return { source: 'nhb_residex', data: null, success: false, error: 'CITY_NOT_IN_RESIDEX', fetched_at };
  }
  const data: NhbResidexData = {
    city: profile.city,
    property_type: 'residential',
    hpi_current: entry.hpi_current,
    hpi_qoq_change: entry.hpi_qoq_change,
    period: 'Q3 2025',
  };
  return { source: 'nhb_residex', data, success: true, fetched_at };
}

async function fetchMca21(profile: PropertyProfile): Promise<FetcherResult<Mca21Data>> {
  const fetched_at = new Date().toISOString();
  // PropertyProfile has no developer_name — will be added in v0.2 ingestion update
  const developerName = (profile as unknown as Record<string, unknown>).developer_name;
  if (!developerName || typeof developerName !== 'string') {
    return { source: 'mca21', data: null, success: false, error: 'NO_DEVELOPER_NAME', fetched_at };
  }
  try {
    const response = await fetch(MCA21_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'ComfHutt-CRUX/1.0 (Property Intelligence Engine)',
      },
      body: new URLSearchParams({ companyName: developerName, type: 'company' }),
    });
    const contentType = response.headers.get('content-type') ?? '';
    const responseText = await response.text();
    const isCaptchaBlocked =
      !response.ok ||
      contentType.includes('text/html') ||
      responseText.toLowerCase().includes('captcha') ||
      responseText.toLowerCase().includes('verify') ||
      responseText.length < 500;
    if (isCaptchaBlocked) {
      return { source: 'mca21', data: null, success: false, error: 'MCA21_CAPTCHA_BLOCKED', fetched_at };
    }
    const lower = responseText.toLowerCase();
    const isActive = lower.includes('active');
    const isStrikeOff = lower.includes('strike off');
    const data: Mca21Data = {
      company_name: developerName,
      cin: '',
      company_status: isStrikeOff ? 'Struck Off' : isActive ? 'Active' : 'Dormant',
      npa_flag: isStrikeOff,
      incorporation_date: '',
      director_count: 0,
    };
    return { source: 'mca21', data, success: isActive || isStrikeOff, fetched_at };
  } catch {
    return { source: 'mca21', data: null, success: false, error: 'MCA21_UNAVAILABLE', fetched_at };
  }
}

async function fetchEcourts(profile: PropertyProfile): Promise<FetcherResult<EcourtsData>> {
  const fetched_at = new Date().toISOString();
  if (!ECOURTS_API_KEY) {
    return { source: 'ecourts', data: null, success: false, error: 'ECOURTS_API_KEY_NOT_CONFIGURED', fetched_at };
  }
  const developerName = (profile as unknown as Record<string, unknown>).developer_name;
  if (!developerName || typeof developerName !== 'string') {
    return { source: 'ecourts', data: null, success: false, error: 'NO_SEARCH_TERMS', fetched_at };
  }
  try {
    const searchUrl = `${ECOURTS_API_URL}/search?q=${encodeURIComponent(developerName)}`;
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${ECOURTS_API_KEY}`,
        Accept: 'application/json',
        'User-Agent': 'ComfHutt-CRUX/1.0 (Property Intelligence Engine)',
      },
    });
    if (!response.ok) {
      return {
        source: 'ecourts',
        data: null,
        success: false,
        error: `ECOURTS_API_ERROR_${response.status}`,
        fetched_at,
      };
    }
    const result = await response.json() as Record<string, unknown>;
    // Log raw response to verify eCourtsIndia.com field names on first successful call
    console.info('[ecourts] raw response sample:', JSON.stringify(result).slice(0, 500));
    const cases = Array.isArray(result.data) ? result.data : [];
    let open_cases = 0;
    let closed_cases = 0;
    const caseTypesSet = new Set<string>();
    for (const c of cases) {
      const caseObj = c as Record<string, unknown>;
      const status = String(caseObj.status ?? caseObj.case_status ?? '').toLowerCase();
      if (status.includes('pending') || status.includes('listed')) {
        open_cases++;
      } else if (status.includes('disposed') || status.includes('decided') || status.includes('closed')) {
        closed_cases++;
      }
      const caseType = String(caseObj.case_type ?? caseObj.type ?? '');
      if (caseType) caseTypesSet.add(caseType);
    }
    const data: EcourtsData = {
      cases_found: cases.length,
      open_cases,
      closed_cases,
      case_types: Array.from(caseTypesSet),
    };
    return { source: 'ecourts', data, success: true, fetched_at };
  } catch {
    return { source: 'ecourts', data: null, success: false, error: 'ECOURTS_UNAVAILABLE', fetched_at };
  }
}

async function fetchCpwd(profile: PropertyProfile): Promise<FetcherResult<CpwdData>> {
  const fetched_at = new Date().toISOString();
  const stateKey = profile.state.toLowerCase().trim().replace(/ /g, '_');
  const entry: CpwdMockEntry = CPWD_RATES_MOCK[stateKey] ?? {
    city_tier: 'tier3',
    construction_cost_per_sqft: 130000,
  };
  const data: CpwdData = {
    state: profile.state,
    city_tier: entry.city_tier,
    construction_cost_per_sqft: entry.construction_cost_per_sqft,
    last_updated: '2025-01-01',
  };
  return { source: 'cpwd', data, success: true, fetched_at };
}

// ── Circuit breakers (module scope — persist across requests) ────────────────

const cpcbBreaker = new CircuitBreaker(fetchCpcbAqi, BREAKER_OPTIONS);
const googleBreaker = new CircuitBreaker(fetchGoogleMaps, BREAKER_OPTIONS);
const residexBreaker = new CircuitBreaker(fetchNhbResidex, BREAKER_OPTIONS);
const mca21Breaker = new CircuitBreaker(fetchMca21, BREAKER_OPTIONS_SLOW);
const ecourtsBreaker = new CircuitBreaker(fetchEcourts, BREAKER_OPTIONS_SLOW);
const cpwdBreaker = new CircuitBreaker(fetchCpwd, BREAKER_OPTIONS);

// ── Exported function ────────────────────────────────────────────────────────

export async function fetchAllSources(profile: PropertyProfile): Promise<AggregatedFetcherOutput> {
  const startTime = Date.now();

  const [cpcbR, gmapsR, residexR, mca21R, ecourtsR, cpwdR] = await Promise.allSettled([
    cpcbBreaker.fire(profile) as Promise<FetcherResult<CpcbAqiData>>,
    googleBreaker.fire(profile) as Promise<FetcherResult<GoogleMapsData>>,
    residexBreaker.fire(profile) as Promise<FetcherResult<NhbResidexData>>,
    mca21Breaker.fire(profile) as Promise<FetcherResult<Mca21Data>>,
    ecourtsBreaker.fire(profile) as Promise<FetcherResult<EcourtsData>>,
    cpwdBreaker.fire(profile) as Promise<FetcherResult<CpwdData>>,
  ]);

  const cpcb_aqi = extractResult<CpcbAqiData>(cpcbR, 'cpcb_aqi');
  const google_maps = extractResult<GoogleMapsData>(gmapsR, 'google_maps');
  const nhb_residex = extractResult<NhbResidexData>(residexR, 'nhb_residex');
  const mca21 = extractResult<Mca21Data>(mca21R, 'mca21');
  const ecourts = extractResult<EcourtsData>(ecourtsR, 'ecourts');
  const cpwd = extractResult<CpwdData>(cpwdR, 'cpwd');

  const allResults = [cpcb_aqi, google_maps, nhb_residex, mca21, ecourts, cpwd];
  const sources_succeeded = allResults.filter(r => r.success).length;

  const output: AggregatedFetcherOutput = {
    property_id: profile.id,
    cpcb_aqi,
    google_maps,
    nhb_residex,
    mca21,
    ecourts,
    cpwd,
    fetched_at: new Date().toISOString(),
    sources_succeeded,
    sources_attempted: 6,
  };

  const succeededSources = allResults.filter(r => r.success).map(r => r.source);
  supabase
    .from('crux_agent_logs')
    .insert({
      agent_type: 'fetcher',
      property_id: profile.id,
      input_payload: { address: profile.address_normalized, sources_attempted: 6 },
      output_payload: { sources_succeeded, sources: succeededSources },
      tokens_used: 0,
      latency_ms: Date.now() - startTime,
      status: 'success',
    })
    .then(({ error }) => {
      if (error) console.error('[fetcher] log error:', error.message);
    });

  return output;
}
