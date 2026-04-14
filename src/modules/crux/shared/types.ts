// CRUX Shared Types — v0.1.0
// Single source of truth for all CRUX module interfaces.
// Always import types from here. Never from individual module files.

// ─── Enums ───────────────────────────────────────────────────────────────────

export type IntentProfile = 'yield' | 'appreciation' | 'balanced';

export type LifecycleStage = 'near_completion' | 'delivered';

export type MacroCycle = 'growth' | 'correction';

export type PropertyType =
  | 'residential_apartment'
  | 'residential_villa'
  | 'commercial_office'
  | 'commercial_retail'
  | 'plot';

export type AgentType = 'fetcher' | 'scorer' | 'report' | 'lens';

// ─── Property ────────────────────────────────────────────────────────────────

export interface PropertyProfile {
  id: string;
  address_raw: string;
  address_normalized: string;
  geocode_lat: number;
  geocode_lng: number;
  pin_code: string;
  city: string;
  state: string;
  property_type: PropertyType;
  approx_size_sqft: number | null;
  created_at: string;
  updated_at: string;
}

export interface PropertyIngestionInput {
  address: string;
  property_type?: PropertyType;
  approx_size_sqft?: number;
}

// ─── Data Fetcher ─────────────────────────────────────────────────────────────

export interface FetcherResult<T> {
  source: string;           // e.g. 'cpcb_aqi', 'nhb_residex'
  data: T | null;
  fetched_at: string;
  success: boolean;
  error?: string;
}

// Raw data payloads from each source
export interface CpcbAqiData {
  aqi: number;
  category: 'Good' | 'Satisfactory' | 'Moderate' | 'Poor' | 'Very Poor' | 'Severe';
  station: string;
  recorded_at: string;
}

export interface GoogleMapsData {
  walkability_score: number | null;    // 0-100
  poi_count_500m: number;              // points of interest within 500m
  commute_minutes_to_cbd: number | null;
  transit_score: number | null;
}

export interface NhbResidexData {
  city: string;
  property_type: string;
  hpi_current: number;                 // House Price Index
  hpi_qoq_change: number;             // quarter-on-quarter % change
  period: string;                      // e.g. 'Q3 2025'
}

export interface Mca21Data {
  company_name: string;
  cin: string;
  company_status: 'Active' | 'Struck Off' | 'Under Liquidation' | 'Dormant';
  npa_flag: boolean;
  incorporation_date: string;
  director_count: number;
}

export interface EcourtsData {
  cases_found: number;
  open_cases: number;
  closed_cases: number;
  case_types: string[];
}

export interface CpwdData {
  state: string;
  city_tier: 'tier1' | 'tier2' | 'tier3';
  construction_cost_per_sqft: number;  // in paise
  last_updated: string;
}

// Union of all raw fetcher payloads
export type FetcherPayload =
  | CpcbAqiData
  | GoogleMapsData
  | NhbResidexData
  | Mca21Data
  | EcourtsData
  | CpwdData;

// Aggregated output from Fetcher Agent — all 6 sources
export interface AggregatedFetcherOutput {
  property_id: string;
  cpcb_aqi: FetcherResult<CpcbAqiData>;
  google_maps: FetcherResult<GoogleMapsData>;
  nhb_residex: FetcherResult<NhbResidexData>;
  mca21: FetcherResult<Mca21Data>;
  ecourts: FetcherResult<EcourtsData>;
  cpwd: FetcherResult<CpwdData>;
  fetched_at: string;
  sources_succeeded: number;           // out of 6
  sources_attempted: number;           // always 6
}

// ─── Clarification (agent → user via Lens) ────────────────────────────────────

export interface ClarificationRequest {
  parameter: string;                   // e.g. 'approx_size_sqft'
  question: string;                    // natural language, shown in Lens chat
  is_optional: boolean;
}

// ─── CRUX Score ───────────────────────────────────────────────────────────────

export interface ScoreBreakdown {
  location_intelligence: number;       // 0-100, weight: 30%
  developer_reliability: number;       // 0-100, weight: 20%
  legal_compliance: number;            // 0-100, weight: 20%
  market_valuation: number;            // 0-100, weight: 15%
  structural_physical: number;         // 0-100, weight: 10% (stub in MVP)
  risk_composite: number;              // 0-100, weight: 5%
}

export interface CruxScore {
  id: string;
  property_id: string;
  intent_profile: IntentProfile;
  lifecycle_stage: LifecycleStage;
  macro_cycle: MacroCycle;
  score_composite: number;             // 0-100, weighted sum
  score_breakdown: ScoreBreakdown;
  data_sources_used: string[];
  confidence_score: number;            // 0-1
  crux_version: string;                // e.g. '0.1.0'
  methodology_hash: string;            // SHA-256 of scoring config
  created_at: string;
  ttl_expires_at: string;              // 24h from creation
  degraded: boolean;                   // true if confidence < 0.4
  clarifications_requested: ClarificationRequest[];
}

export interface ComputeScoreInput {
  property_id: string;
  intent_profile: IntentProfile;
  fetcher_output: AggregatedFetcherOutput;
  user_inputs?: Record<string, string>; // optional user-provided clarifications
}

// ─── CRUX Report ─────────────────────────────────────────────────────────────

export interface CruxReport {
  id: string;
  property_id: string;
  score_id: string;
  intent_profile: IntentProfile;
  // Narrative sections — Gemini-generated, never raw weights
  summary: string;                 // 2-3 sentence plain-language verdict
  strengths: string[];             // top 3 positives, evidence-backed
  risks: string[];                 // top 3 risks, evidence-backed
  location_narrative: string;      // what the location data actually means
  developer_narrative: string;     // developer track record in plain language
  legal_narrative: string;         // legal standing summary
  market_narrative: string;        // market context and pricing
  disclaimer: string;              // SEBI-mandated, always present, never omitted
  generated_at: string;
  crux_version: string;
}

export interface GenerateReportInput {
  score: CruxScore;
  property: PropertyProfile;
  fetcher_output: AggregatedFetcherOutput;
  intent_profile: IntentProfile;
}

// ─── CRUX Card ────────────────────────────────────────────────────────────────

export interface CruxCardData {
  property: Pick<PropertyProfile, 'id' | 'address_normalized' | 'city' | 'state' | 'property_type'>;
  score_composite: number;
  score_breakdown: ScoreBreakdown;
  confidence_score: number;
  intent_profile: IntentProfile;   // personalized for signed-in user
  data_sources_count: number;
  crux_version: string;
  generated_at: string;
  // SEBI disclaimer — always present on card
  disclaimer: string;
}

export interface CruxCard {
  id: string;
  property_id: string;
  user_id: string | null;          // null = anonymous
  share_token: string;             // crux.comfhutt.com/card/[share_token]
  card_data: CruxCardData;
  created_at: string;
  expires_at: string;              // 90 days
}

export interface CreateCardInput {
  property_id: string;
  score: CruxScore;
  property: PropertyProfile;
  user_id?: string;                // if signed in → personalized intent profile
}

// ─── CRUX Watch ───────────────────────────────────────────────────────────────

export interface WatchCredits {
  id: string;
  user_id: string;
  credits_remaining: number;           // starts at 3, floor 0
  credits_total: number;
}

export interface WatchRegistration {
  id: string;
  user_id: string;
  property_id: string;
  registered_at: string;
  credits_deducted: number;            // always 1
}

// ─── CRUX Lens ────────────────────────────────────────────────────────────────

export interface LensMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface LensSession {
  id: string;                          // server-generated UUID
  user_id: string | null;             // null = anonymous session
  property_id: string;
  messages: LensMessage[];             // max 10, rolling window
  created_at: string;
  updated_at: string;
  expires_at: string;                  // 2h from last activity
}

export interface LensMessageInput {
  session_id: string;
  content: string;
  user_id?: string;
}

// SSE chunk format — frontend contract, never change without version bump
export interface SseChunk {
  delta: string;                       // partial text from Gemini stream
  done: boolean;
  module_result: LensModuleResult | null;
  error?: string;
}

export interface LensModuleResult {
  type: 'score' | 'report';
  data: CruxScore | CruxReport;
}

// ─── User Dashboard ───────────────────────────────────────────────────────────

export interface UserProperty {
  id: string;
  user_id: string;
  property_id: string;
  property: PropertyProfile;
  last_score: number | null;
  last_analyzed_at: string | null;
  is_favorite: boolean;
  created_at: string;
}

export interface DashboardResponse {
  user_properties: UserProperty[];
  watch_credits: WatchCredits | null;
}

// ─── API Response Wrappers ────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  data: T;
  status: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    status: number;
  };
}

// ─── Agent Logging ────────────────────────────────────────────────────────────

export interface AgentLog {
  id: string;
  agent_type: AgentType;
  property_id: string;
  input_payload: Record<string, unknown>;
  output_payload: Record<string, unknown>;
  tokens_used: number;
  latency_ms: number;
  status: 'success' | 'error' | 'timeout';
  created_at: string;
}

// ─── Demand Signals ───────────────────────────────────────────────────────────

export interface DemandSignal {
  pin_code: string;
  property_type: PropertyType;
  search_count: number;
  unique_users: number;
  period: string;                      // ISO date string, daily bucket
}
