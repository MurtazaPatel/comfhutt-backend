// TYPE DEVIATIONS FROM PROMPT 9 SPEC (types.ts is the source of truth):
// 1. PropertyProfile has no developer_name — MCA21 + eCourts return success:false immediately
// 2. PropertyProfile uses geocode_lat/geocode_lng (not latitude/longitude)
// 3. PropertyProfile uses address_normalized (not formatted_address)
// 4. FetcherResult<T> has no confidence/is_cached fields — confidence computed in scoring agent
// 5. AgentLog columns: input_payload, output_payload, latency_ms (not input_summary etc.)

import CircuitBreaker from 'opossum';
import { supabase } from '../../../lib/db';
import { env } from '../../../config/env';
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
import {
  fetchCpcbAqiFirecrawl,
  fetchNhbResidexFirecrawl,
  fetchMca21Firecrawl,
  fetchEcourtsFirecrawl,
  fetchCpwdFirecrawl,
} from './fetcher.firecrawl';

// ── Circuit breaker configs ──────────────────────────────────────────────────

const BREAKER_OPTIONS: CircuitBreaker.Options = {
  timeout: 10000,
  errorThresholdPercentage: 80,
  resetTimeout: 30000,
  volumeThreshold: 5,
};

const BREAKER_OPTIONS_SLOW: CircuitBreaker.Options = {
  timeout: 30000,
  errorThresholdPercentage: 80,
  resetTimeout: 30000,
  volumeThreshold: 5,
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

// ── 6 Fetcher functions ──────────────────────────────────────────────────────

async function fetchCpcbAqi(profile: PropertyProfile): Promise<FetcherResult<CpcbAqiData>> {
  return fetchCpcbAqiFirecrawl(profile);
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
  return fetchNhbResidexFirecrawl(profile);
}

async function fetchMca21(profile: PropertyProfile): Promise<FetcherResult<Mca21Data>> {
  const developerName = (profile as unknown as Record<string, unknown>).developer_name;
  if (!developerName || typeof developerName !== 'string') {
    return {
      source: 'mca21',
      data: null,
      success: false,
      error: 'NO_DEVELOPER_NAME',
      fetched_at: new Date().toISOString(),
    };
  }
  return fetchMca21Firecrawl(developerName, profile);
}

async function fetchEcourts(profile: PropertyProfile): Promise<FetcherResult<EcourtsData>> {
  const developerName = (profile as unknown as Record<string, unknown>).developer_name;
  if (!developerName || typeof developerName !== 'string') {
    return {
      source: 'ecourts',
      data: null,
      success: false,
      error: 'NO_SEARCH_TERMS',
      fetched_at: new Date().toISOString(),
    };
  }
  return fetchEcourtsFirecrawl(developerName, profile);
}

async function fetchCpwd(profile: PropertyProfile): Promise<FetcherResult<CpwdData>> {
  return fetchCpwdFirecrawl(profile);
}

// ── Circuit breakers (module scope — persist across requests) ────────────────

const cpcbBreaker = new CircuitBreaker(fetchCpcbAqi, BREAKER_OPTIONS_SLOW);
const googleBreaker = new CircuitBreaker(fetchGoogleMaps, BREAKER_OPTIONS);
const residexBreaker = new CircuitBreaker(fetchNhbResidex, BREAKER_OPTIONS_SLOW);
const mca21Breaker = new CircuitBreaker(fetchMca21, BREAKER_OPTIONS_SLOW);
const ecourtsBreaker = new CircuitBreaker(fetchEcourts, BREAKER_OPTIONS_SLOW);
const cpwdBreaker = new CircuitBreaker(fetchCpwd, BREAKER_OPTIONS_SLOW);

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
      llm_provider: 'gemini',
      tokens_used: 0,
      latency_ms: Date.now() - startTime,
      status: 'success',
    })
    .then(({ error }) => {
      if (error) console.error('[fetcher] log error:', error.message);
    });

  return output;
}
