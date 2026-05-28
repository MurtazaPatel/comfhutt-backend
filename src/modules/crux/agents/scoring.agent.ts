// Deterministic scoring with optional LLM weight adjustment (v0.2).
// TYPE DEVIATIONS:
// - LifecycleStage only has 'near_completion' | 'delivered' (not 4 values)
// - MacroCycle only has 'growth' | 'correction' (not 4 values)
// - Mca21Data has no annual_filing field — structural_physical score stub at 50
// - EcourtsData has no litigation_risk field — derived from open_cases count
// - CruxScore uses `degraded` (not `degraded_data`)

import { createHash } from 'crypto';
import { generateWithFallback, GEMINI_MODELS } from '../../../lib/gemini';
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
  ScoringCategory,
  WeightAdjustment,
  VerifiedEvidenceItem,
} from '../shared/types';

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

  const sum = (Object.values(w) as number[]).reduce((a, b) => a + b, 0);
  (Object.keys(w) as ScoringCategory[]).forEach(k => { w[k] /= sum; });
  return w;
}

function recoverScoringJson(text: string): string | null {
  let recovered = text.trim()
  let openBraces = 0, openBrackets = 0, inString = false, escaped = false
  for (let i = 0; i < recovered.length; i++) {
    const ch = recovered[i]
    if (escaped) { escaped = false; continue }
    if (ch === '\\') { escaped = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') openBraces++
    if (ch === '}') openBraces--
    if (ch === '[') openBrackets++
    if (ch === ']') openBrackets--
  }
  if (inString) { recovered += '"}'
    try { JSON.parse(recovered); return recovered } catch { return null }
  }
  while (openBrackets > 0) { recovered += ']'; openBrackets-- }
  while (openBraces > 0) { recovered += '}'; openBraces-- }
  try { JSON.parse(recovered); return recovered } catch { return null }
}

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
  const filingScore = 50;

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
  return 50;
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

interface LLMAdjustmentResponse {
  adjustments: Array<{
    category: ScoringCategory;
    delta: number;
    reason: string;
    evidence_ids: string[];
  }>;
}

function validateAndClampAdjustments(
  raw: LLMAdjustmentResponse,
  baseWeights: Record<ScoringCategory, number>,
  verifiedEvidence: VerifiedEvidenceItem[],
): {
  adjustments: WeightAdjustment[];
  adjustedWeights: Record<ScoringCategory, number>;
} | null {
  const validEvidenceIds = new Set(
    verifiedEvidence.flatMap((ve) => [
      ve.evidence.id,
      ve.verification.evidence_item_id,
    ]),
  );

  const validCategories = Object.keys(baseWeights);
  const clamped: WeightAdjustment[] = [];

  for (const adj of raw.adjustments ?? []) {
    if (!validCategories.includes(adj.category)) continue;
    if (typeof adj.delta !== 'number' || Number.isNaN(adj.delta)) continue;

    const delta = Math.max(-0.03, Math.min(0.03, adj.delta));

    for (const eid of adj.evidence_ids ?? []) {
      if (!validEvidenceIds.has(eid)) {
        return null;
      }
    }

    clamped.push({
      category: adj.category,
      base_weight: baseWeights[adj.category],
      adjusted_weight: 0,
      delta,
      reason: adj.reason,
      evidence_ids: adj.evidence_ids,
    });
  }

  const totalShift = clamped.reduce((sum, a) => sum + Math.abs(a.delta), 0);
  if (totalShift > 0.05 + 0.001) return null;

  const adjusted = { ...baseWeights };
  for (const adj of clamped) {
    adjusted[adj.category] += adj.delta;
  }

  for (const key of validCategories as ScoringCategory[]) {
    if (adjusted[key] < 0) return null;
  }

  const sum = (Object.values(adjusted) as number[]).reduce((a, b) => a + b, 0);
  for (const key of validCategories as ScoringCategory[]) {
    adjusted[key] /= sum;
  }

  for (const adj of clamped) {
    adj.adjusted_weight = adjusted[adj.category];
  }

  return { adjustments: clamped, adjustedWeights: adjusted };
}

async function adjustWeightsWithLLM(
  baseWeights: Record<ScoringCategory, number>,
  verifiedEvidence: VerifiedEvidenceItem[],
  intent: IntentProfile,
  lifecycle: LifecycleStage,
  macroCycle: MacroCycle,
): Promise<{
  adjustments: WeightAdjustment[];
  adjustedWeights: Record<ScoringCategory, number>;
} | null> {
  if (!verifiedEvidence.length) return null;

  const evidenceContext = verifiedEvidence.map((ve) => ({
    id: ve.evidence.id,
    domain: ve.evidence.domain,
    claim: ve.evidence.claim_text,
    confidence: ve.verification.verifier_confidence,
    status: ve.verification.verification_status,
  }));

  const userPrompt = `BASE WEIGHTS:
${JSON.stringify(baseWeights, null, 2)}

VERIFIED EVIDENCE (only use these — never fabricate):
${JSON.stringify(evidenceContext, null, 2)}

INTENT: ${intent}
LIFECYCLE: ${lifecycle}
MACRO_CYCLE: ${macroCycle}

Respond with ONLY valid JSON in this exact shape:
{
  "adjustments": [
    { "category": "location_intelligence", "delta": 0.00, "reason": "citation here", "evidence_ids": ["ev-123"] }
  ]
}`;

  const systemPrompt = `You are the CRUX Scoring Weight Adjuster. Your ONLY job is to recommend tiny adjustments to scoring category weights based on verified evidence.

CONSTRAINTS (non-negotiable):
1. You may adjust each weight by AT MOST ±0.03 from its base value.
2. The TOTAL absolute change across all 6 categories MUST NOT exceed 0.05.
3. For EVERY adjustment, you MUST cite which verified evidence item supports it (use evidence item IDs).
4. If no evidence supports an adjustment for a category, leave its delta at 0.
5. Output ONLY valid JSON. Never output reasoning text.

Weight adjustments should reflect REAL PROPERTY-SPECIFIC information:
- Positive verified evidence about location → slightly increase location_intelligence weight
- Negative verified evidence about developer → slightly increase developer_reliability weight (more weight on a weak signal signals risk)
- Verified market pricing data → slightly adjust market_valuation weight
- Environmental concerns (AQI data, flood risks) → adjust environment-related weights`;

  try {
    let text = await generateWithFallback({
      model: GEMINI_MODELS.SCORING_AGENT,
      systemInstruction: systemPrompt,
      prompt: userPrompt,
      temperature: 0.1,
      maxOutputTokens: 4096,
    })

    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch?.[1]) {
      text = fenceMatch[1].trim();
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[scoring.agent] LLM response contained no JSON object:', text.slice(0, 200));
      return null;
    }

    let parsed: LLMAdjustmentResponse;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      const recovered = recoverScoringJson(jsonMatch[0])
      if (recovered) {
        try { parsed = JSON.parse(recovered) } catch { return null }
      } else {
        console.error('[scoring.agent] LLM JSON parse failed:', (parseErr as Error)?.message, '| raw:', jsonMatch[0].slice(0, 200));
        return null;
      }
    }
    if (!parsed.adjustments || !Array.isArray(parsed.adjustments)) return null;

    return validateAndClampAdjustments(parsed, baseWeights, verifiedEvidence);
  } catch (error) {
    console.error('[scoring.agent] LLM weight adjustment failed:', (error as Error)?.message ?? 'unknown');
    return null;
  }
}

export async function computeScore(
  output: AggregatedFetcherOutput,
  intent: IntentProfile,
  lifecycle: LifecycleStage,
  macro: MacroCycle,
  verifiedEvidence?: VerifiedEvidenceItem[],
): Promise<CruxScore> {
  const baseWeights = buildWeights(intent, lifecycle, macro);

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

  let weights = baseWeights;
  let weight_adjustments: WeightAdjustment[] | undefined = undefined;

  if (verifiedEvidence && verifiedEvidence.length > 0) {
    const llmResult = await adjustWeightsWithLLM(
      baseWeights,
      verifiedEvidence,
      intent,
      lifecycle,
      macro,
    );
    if (llmResult) {
      weights = llmResult.adjustedWeights;
      weight_adjustments = llmResult.adjustments;
    }
  }

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

  if (weight_adjustments) {
    breakdown.weight_adjustments = weight_adjustments;
  }

  const methodologyPayload = JSON.stringify({
    BASE_WEIGHTS,
    weights,
    intent,
    lifecycle,
    macro,
    version: env.CRUX_VERSION,
    weight_adjustments: weight_adjustments ?? [],
  });
  const methodology_hash = createHash('sha256').update(methodologyPayload).digest('hex');

  const verified_evidence_used = verifiedEvidence?.length ?? 0;

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
    weight_adjustments,
    verified_evidence_used,
  };
}