import type {
  IntentProfile,
  LifecycleStage,
  MacroCycle,
  PropertyProfile,
  CruxScore,
  ScoringCategory,
} from '../../src/modules/crux/shared/types';

const BASE_WEIGHTS: Record<ScoringCategory, number> = {
  location_intelligence: 0.30,
  developer_reliability: 0.20,
  legal_compliance: 0.20,
  market_valuation: 0.15,
  structural_physical: 0.10,
  risk_composite: 0.05,
};

export function buildWeights(
  intent: IntentProfile,
  lifecycle: LifecycleStage,
  cycle: MacroCycle,
): Record<ScoringCategory, number> {
  const w = { ...BASE_WEIGHTS };

  if (intent === 'yield') {
    w.market_valuation += 0.05;
    w.location_intelligence += 0.03;
    w.structural_physical -= 0.05;
    w.developer_reliability -= 0.03;
  } else if (intent === 'appreciation') {
    w.location_intelligence += 0.05;
    w.developer_reliability += 0.03;
    w.market_valuation -= 0.05;
    w.structural_physical -= 0.03;
  }

  if (lifecycle === 'near_completion') {
    w.developer_reliability += 0.05;
    w.legal_compliance += 0.03;
    w.location_intelligence -= 0.05;
    w.structural_physical -= 0.03;
  }

  if (cycle === 'correction') {
    w.risk_composite += 0.05;
    w.location_intelligence -= 0.05;
  }

  const sum = (Object.values(w) as number[]).reduce((a, b) => a + b, 0);
  (Object.keys(w) as ScoringCategory[]).forEach(k => { w[k] /= sum; });
  return w;
}

interface PropertyRow {
  id: string;
  address_raw: string;
  address_normalized: string | null;
  geocode_lat: number | null;
  geocode_lng: number | null;
  pin_code: string | null;
  city: string | null;
  state: string | null;
  property_type: string | null;
  approx_size_sqft: number | null;
  research_context?: string;
  verification_context?: string;
}

export function buildSystemPrompt(property: PropertyRow, score: CruxScore | null): string {
  return `
## LAYER 1 — ROLE
You are CRUX Lens, the AI property research assistant for ComfHutt.

## LAYER 2 — PROPERTY CONTEXT
You are analyzing this property:
${JSON.stringify({
  address: property.address_normalized ?? property.address_raw,
  city: property.city,
  state: property.state,
  pin_code: property.pin_code,
  property_type: property.property_type,
  coordinates: { lat: property.geocode_lat, lng: property.geocode_lng }
}, null, 2)}

## LAYER 3 — CRUX SCORE CONTEXT
${score ? `
CRUX Score for this property (intent: ${score.intent_profile}):
- Composite Score: ${score.score_composite}/100
- Confidence: ${(score.confidence_score * 100).toFixed(0)}%
- Score Breakdown: ${JSON.stringify(score.score_breakdown, null, 2)}
- Data Sources Used: ${score.data_sources_used.join(', ')}
- Verified Evidence Used: ${score.verified_evidence_used ?? 0} items
- Scored At: ${score.created_at}
- CRUX Version: ${score.crux_version}
` : `
No CRUX Score has been computed for this property yet.
`}

## LAYER 3D — SCORING METHODOLOGY (transparency layer)
${score?.weight_adjustments?.length ? `
The CRUX Score for this property incorporates the following evidence-backed weight adjustments:
${score.weight_adjustments.map(a => `- ${a.category}: weight shifted by ${a.delta > 0 ? '+' : ''}${a.delta.toFixed(3)} because ${a.reason}`).join('\n')}
` : `
No evidence-backed weight adjustments were applied for this property.
`}

## LAYER 3B — RESEARCH EVIDENCE CONTEXT
${property.research_context ?? 'No research evidence is cached for this property yet.'}

## LAYER 3C — VERIFICATION CONTEXT
${property.verification_context ?? 'No verification run is cached for this property yet.'}
`.trim();
}
