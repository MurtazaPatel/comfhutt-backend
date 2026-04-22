// Pure deterministic scoring — no LLM calls in v0.1.
// TYPE DEVIATIONS:
// - LifecycleStage only has 'near_completion' | 'delivered' (not 4 values)
// - MacroCycle only has 'growth' | 'correction' (not 4 values)
// - Mca21Data has no annual_filing field — structural_physical score stub at 50
// - EcourtsData has no litigation_risk field — derived from open_cases count
// - CruxScore uses `degraded` (not `degraded_data`)

import { createHash } from 'crypto';
import { env } from '../../../config/env';
import type {
  AggregatedFetcherOutput,
  CruxScore,
  ScoreBreakdown,
  IntentProfile,
  LifecycleStage,
  MacroCycle,
  ClarificationRequest,
  FetcherResult,
  CpcbAqiData,
  GoogleMapsData,
  NhbResidexData,
  Mca21Data,
  EcourtsData,
  CpwdData,
} from '../shared/types';

// ── Weights ──────────────────────────────────────────────────────────────────

type ScoringCategory =
  | 'location_intelligence'
  | 'developer_reliability'
  | 'legal_compliance'
  | 'market_valuation'
  | 'structural_physical'
  | 'risk_composite';

const BASE_WEIGHTS: Record<ScoringCategory, number> = {
  location_intelligence: 0.30,
  developer_reliability: 0.20,
  legal_compliance:      0.20,
  market_valuation:      0.15,
  structural_physical:   0.10,
  risk_composite:        0.05,
};

function buildWeights(
  intent: IntentProfile,
  lifecycle: LifecycleStage,
  cycle: MacroCycle,
): Record<ScoringCategory, number> {
  const w = { ...BASE_WEIGHTS };

  if (intent === 'yield') {
    w.market_valuation      += 0.05;
    w.location_intelligence += 0.03;
    w.structural_physical   -= 0.05;
    w.developer_reliability -= 0.03;
  } else if (intent === 'appreciation') {
    w.location_intelligence += 0.05;
    w.developer_reliability += 0.03;
    w.market_valuation      -= 0.05;
    w.structural_physical   -= 0.03;
  }

  if (lifecycle === 'near_completion') {
    w.developer_reliability += 0.05;
    w.legal_compliance      += 0.03;
    w.location_intelligence -= 0.05;
    w.structural_physical   -= 0.03;
  }

  if (cycle === 'correction') {
    w.risk_composite        += 0.05;
    w.location_intelligence -= 0.05;
  }

  // Normalize so weights sum to exactly 1.0
  const sum = (Object.values(w) as number[]).reduce((a, b) => a + b, 0);
  (Object.keys(w) as ScoringCategory[]).forEach(k => { w[k] /= sum; });
  return w;
}

// ── Per-category scorers ─────────────────────────────────────────────────────

function scoreLocationIntelligence(
  cpcb: FetcherResult<CpcbAqiData>,
  gmaps: FetcherResult<GoogleMapsData>,
): number {
  const aqi = cpcb.data?.aqi ?? 200;
  let aqiScore: number;
  if (aqi <= 50) aqiScore = 100;
  else if (aqi <= 100) aqiScore = 80;
  else if (aqi <= 200) aqiScore = 60;
  else if (aqi <= 300) aqiScore = 30;
  else aqiScore = 0;

  const pois = gmaps.data?.poi_count_500m ?? 0;
  let poiScore: number;
  if (pois >= 40) poiScore = 100;
  else if (pois >= 30) poiScore = 85;
  else if (pois >= 20) poiScore = 70;
  else if (pois >= 10) poiScore = 50;
  else poiScore = 30;

  const commute = gmaps.data?.commute_minutes_to_cbd ?? 60;
  let commuteScore: number;
  if (commute <= 10) commuteScore = 100;
  else if (commute <= 20) commuteScore = 85;
  else if (commute <= 30) commuteScore = 70;
  else if (commute <= 45) commuteScore = 50;
  else commuteScore = 30;

  return aqiScore * 0.40 + poiScore * 0.35 + commuteScore * 0.25;
}

function scoreDeveloperReliability(mca21: FetcherResult<Mca21Data>): number {
  if (!mca21.success || !mca21.data) return 50;

  let statusScore: number;
  switch (mca21.data.company_status) {
    case 'Active':            statusScore = 100; break;
    case 'Dormant':           statusScore = 40;  break;
    case 'Struck Off':        statusScore = 0;   break;
    case 'Under Liquidation': statusScore = 0;   break;
    default:                  statusScore = 50;
  }

  const npaScore = mca21.data.npa_flag ? 10 : 100;
  const filingScore = 50; // Mca21Data has no annual_filing field — neutral stub

  return statusScore * 0.50 + npaScore * 0.30 + filingScore * 0.20;
}

function scoreLegalCompliance(ecourts: FetcherResult<EcourtsData>): number {
  if (!ecourts.success || !ecourts.data) return 60;

  const openCases = ecourts.data.open_cases;
  let caseScore: number;
  if (openCases === 0) caseScore = 100;
  else if (openCases <= 2) caseScore = 70;
  else if (openCases <= 5) caseScore = 40;
  else caseScore = 15;

  return caseScore;
}

function scoreMarketValuation(
  residex: FetcherResult<NhbResidexData>,
  cpwd: FetcherResult<CpwdData>,
): number {
  const qoq = residex.data?.hpi_qoq_change ?? 0;
  let qoqScore: number;
  if (qoq >= 3) qoqScore = 100;
  else if (qoq >= 2) qoqScore = 80;
  else if (qoq >= 1) qoqScore = 60;
  else if (qoq >= 0) qoqScore = 50;
  else qoqScore = 25;

  let tierScore: number;
  if (!cpwd.success || !cpwd.data) {
    tierScore = 50;
  } else {
    switch (cpwd.data.city_tier) {
      case 'tier1': tierScore = 80; break;
      case 'tier2': tierScore = 60; break;
      case 'tier3': tierScore = 40; break;
      default:      tierScore = 50;
    }
  }

  return qoqScore * 0.60 + tierScore * 0.40;
}

function scoreStructuralPhysical(): number {
  return 50; // STRUCTURAL_STUB_MVP — no live data sources in v0.1
}

function scoreRiskComposite(breakdown: Omit<ScoreBreakdown, 'risk_composite'>): number {
  const scores = [
    breakdown.location_intelligence,
    breakdown.developer_reliability,
    breakdown.legal_compliance,
    breakdown.market_valuation,
    breakdown.structural_physical,
  ];
  const sorted = [...scores].sort((a, b) => a - b);
  const avg = (sorted[0]! + sorted[1]!) / 2;
  const penalty = scores.some(s => s < 30) ? -10 : 0;
  return Math.max(0, Math.min(100, avg + penalty));
}

// ── Exported function ────────────────────────────────────────────────────────

export function computeScore(
  output: AggregatedFetcherOutput,
  intent: IntentProfile,
  lifecycle: LifecycleStage,
  macro: MacroCycle,
): CruxScore {
  const weights = buildWeights(intent, lifecycle, macro);

  const li = scoreLocationIntelligence(output.cpcb_aqi, output.google_maps);
  const dr = scoreDeveloperReliability(output.mca21);
  const lc = scoreLegalCompliance(output.ecourts);
  const mv = scoreMarketValuation(output.nhb_residex, output.cpwd);
  const sp = scoreStructuralPhysical();
  const rc = scoreRiskComposite({
    location_intelligence: li,
    developer_reliability: dr,
    legal_compliance: lc,
    market_valuation: mv,
    structural_physical: sp,
  });

  const breakdown: ScoreBreakdown = {
    location_intelligence: Math.round(li),
    developer_reliability: Math.round(dr),
    legal_compliance:      Math.round(lc),
    market_valuation:      Math.round(mv),
    structural_physical:   Math.round(sp),
    risk_composite:        Math.round(rc),
  };

  const score_composite = Math.round(
    li * weights.location_intelligence +
    dr * weights.developer_reliability +
    lc * weights.legal_compliance +
    mv * weights.market_valuation +
    sp * weights.structural_physical +
    rc * weights.risk_composite,
  );

  const ageMs = Date.now() - new Date(output.fetched_at).getTime();
  const freshnessMultiplier =
    ageMs < 3_600_000  ? 1.0 :
    ageMs < 86_400_000 ? 0.9 : 0.7;
  const confidence_score = Math.min(
    1,
    (output.sources_succeeded / output.sources_attempted) * freshnessMultiplier,
  );

  const data_sources_used = [
    output.cpcb_aqi,
    output.google_maps,
    output.nhb_residex,
    output.mca21,
    output.ecourts,
    output.cpwd,
  ]
    .filter(r => r.success)
    .map(r => r.source);

  const methodologyPayload = JSON.stringify({
    BASE_WEIGHTS,
    weights,
    intent,
    lifecycle,
    macro,
    version: env.CRUX_VERSION,
  });
  const methodology_hash = createHash('sha256').update(methodologyPayload).digest('hex');

  const now = new Date();
  return {
    id: crypto.randomUUID(),
    property_id: output.property_id,
    intent_profile: intent,
    lifecycle_stage: lifecycle,
    macro_cycle: macro,
    score_composite,
    score_breakdown: breakdown,
    data_sources_used,
    confidence_score,
    crux_version: env.CRUX_VERSION,
    methodology_hash,
    created_at: now.toISOString(),
    ttl_expires_at: new Date(now.getTime() + 86_400_000).toISOString(),
    degraded: confidence_score < 0.4,
    clarifications_requested: [] as ClarificationRequest[],
  };
}
