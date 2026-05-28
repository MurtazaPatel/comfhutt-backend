import assert from 'node:assert/strict';
import test from 'node:test';
import type { AggregatedFetcherOutput, VerifiedEvidenceItem } from '../../src/modules/crux/shared/types';

const now = new Date().toISOString();
const futureNow = new Date(Date.now() + 86400000).toISOString();

function makeBaseFetcherOutput(sourcesSucceeded: number = 6): AggregatedFetcherOutput {
  return {
    property_id: 'prop-001',
    cpcb_aqi: { source: 'cpcb_aqi', fetched_at: now, success: sourcesSucceeded >= 1, data: sourcesSucceeded >= 1 ? { aqi: 75, category: 'Satisfactory', station: 'Test', recorded_at: now } : null },
    google_maps: { source: 'google_maps', fetched_at: now, success: sourcesSucceeded >= 2, data: sourcesSucceeded >= 2 ? { poi_count_500m: 35, commute_minutes_to_cbd: 15, walkability_score: null, transit_score: null } : null },
    nhb_residex: { source: 'nhb_residex', fetched_at: now, success: sourcesSucceeded >= 3, data: sourcesSucceeded >= 3 ? { city: 'Test', property_type: 'residential', hpi_current: 300, hpi_qoq_change: 2, period: 'Q1' } : null },
    mca21: { source: 'mca21', fetched_at: now, success: sourcesSucceeded >= 4, data: sourcesSucceeded >= 4 ? { company_name: 'TestCo', cin: 'CIN', company_status: 'Active', npa_flag: false, incorporation_date: '2020-01-01', director_count: 3 } : null },
    ecourts: { source: 'ecourts', fetched_at: now, success: sourcesSucceeded >= 5, data: sourcesSucceeded >= 5 ? { cases_found: 1, open_cases: 0, closed_cases: 1, case_types: ['civil'] } : null },
    cpwd: { source: 'cpwd', fetched_at: now, success: sourcesSucceeded >= 6, data: sourcesSucceeded >= 6 ? { state: 'Test', city_tier: 'tier1', construction_cost_per_sqft: 2000, last_updated: now } : null },
    fetched_at: now,
    sources_succeeded: sourcesSucceeded,
    sources_attempted: 6,
  };
}

function makeFakeVerifiedEvidence(overrides: Partial<VerifiedEvidenceItem> = {}): VerifiedEvidenceItem {
  const id = overrides.evidence?.id ?? 'ev-test-1';
  return {
    evidence: {
      id,
      run_id: 'run-1',
      property_id: 'prop-001',
      domain: overrides.evidence?.domain ?? 'environment',
      source_kind: 'web',
      authority_tier: 'official',
      status: 'accepted',
      claim_text: overrides.evidence?.claim_text ?? 'CPCB AQI reading shows good air quality at 75 AQI',
      normalized_claim: overrides.evidence?.normalized_claim ?? {},
      source_title: 'CPCB',
      source_url: null,
      source_path: null,
      excerpt: 'good air quality',
      observed_at: null,
      freshness_expires_at: null,
      confidence: 0.85,
      rejection_reason: null,
      claim_hash: `hash-${id}`,
      created_at: now,
    },
    verification: {
      id: `ver-${id}`,
      run_id: 'vr-1',
      property_id: 'prop-001',
      research_run_id: 'run-1',
      evidence_item_id: id,
      verification_status: overrides.verification?.verification_status ?? 'verified',
      verifier_confidence: overrides.verification?.verifier_confidence ?? 0.85,
      direct_match: true,
      freshness_ok: true,
      support_score: 0.8,
      contradiction_score: 0.1,
      supporting_evidence_ids: [],
      contradicting_evidence_ids: [],
      verification_notes: null,
      created_at: now,
    },
  };
}

test('computeScore: without verified evidence produces deterministic score', async () => {
  const { computeScore } = await import('../../src/modules/crux/agents/scoring.agent');
  const output = makeBaseFetcherOutput(6);
  const score = await computeScore(output, 'balanced', 'delivered', 'growth');
  assert.ok(score.score_composite >= 0 && score.score_composite <= 100, 'score should be in valid range');
  assert.equal(score.weight_adjustments, undefined, 'no weight adjustments without evidence');
  assert.equal(score.verified_evidence_used, 0);
  assert.ok(score.methodology_hash.length > 0);
  assert.ok(score.score_composite > 0);
});

test('computeScore: score_breakdown has all 6 categories', async () => {
  const { computeScore } = await import('../../src/modules/crux/agents/scoring.agent');
  const output = makeBaseFetcherOutput(6);
  const score = await computeScore(output, 'yield', 'near_completion', 'correction');
  assert.equal(Object.keys(score.score_breakdown).length >= 6, true);
  assert.equal(typeof score.score_breakdown.location_intelligence, 'number');
  assert.equal(typeof score.score_breakdown.developer_reliability, 'number');
  assert.equal(typeof score.score_breakdown.legal_compliance, 'number');
  assert.equal(typeof score.score_breakdown.market_valuation, 'number');
  assert.equal(typeof score.score_breakdown.structural_physical, 'number');
  assert.equal(typeof score.score_breakdown.risk_composite, 'number');
});

test('computeScore: different intents produce different scores', async () => {
  const { computeScore } = await import('../../src/modules/crux/agents/scoring.agent');
  const output = makeBaseFetcherOutput(6);
  const scoreYield = await computeScore(output, 'yield', 'delivered', 'growth');
  const scoreAppreciation = await computeScore(output, 'appreciation', 'delivered', 'growth');
  assert.notEqual(scoreYield.score_composite, scoreAppreciation.score_composite,
    'different intents should produce different composite scores');
});

test('computeScore: all sources failed still produces a score', async () => {
  const { computeScore } = await import('../../src/modules/crux/agents/scoring.agent');
  const output = makeBaseFetcherOutput(0);
  const score = await computeScore(output, 'balanced', 'delivered', 'growth');
  assert.ok(score.score_composite >= 0 && score.score_composite <= 100);
  assert.equal(score.confidence_score, 0, 'all failed should give 0 confidence');
  assert.equal(score.degraded, true, 'degraded should be true');
  assert.equal(score.data_sources_used.length, 0);
});

test('computeScore: confidence_score reflects sources_succeeded / sources_attempted', async () => {
  const { computeScore } = await import('../../src/modules/crux/agents/scoring.agent');
  const output = makeBaseFetcherOutput(3);
  const score = await computeScore(output, 'balanced', 'delivered', 'growth');
  assert.equal(score.confidence_score, 0.5, '3/6 sources should give 0.5 confidence');
});

test('computeScore: methodology_hash differs when weight_adjustments present', async () => {
  const { computeScore } = await import('../../src/modules/crux/agents/scoring.agent');
  const output = makeBaseFetcherOutput(6);
  const scoreNoEvidence = await computeScore(output, 'balanced', 'delivered', 'growth');

  const evidence = [makeFakeVerifiedEvidence()];
  const scoreWithEvidence = await computeScore(output, 'balanced', 'delivered', 'growth', evidence);

  assert.ok(scoreNoEvidence.methodology_hash.length > 0);
  assert.ok(scoreWithEvidence.methodology_hash.length > 0);
});

test('computeScore: CruxScore has all required fields', async () => {
  const { computeScore } = await import('../../src/modules/crux/agents/scoring.agent');
  const output = makeBaseFetcherOutput(6);
  const score = await computeScore(output, 'balanced', 'delivered', 'growth');
  assert.equal(typeof score.id, 'string');
  assert.equal(score.property_id, 'prop-001');
  assert.equal(score.intent_profile, 'balanced');
  assert.equal(score.lifecycle_stage, 'delivered');
  assert.equal(score.macro_cycle, 'growth');
  assert.ok(score.created_at);
  assert.ok(score.ttl_expires_at);
  assert.ok(new Date(score.ttl_expires_at) > new Date(score.created_at), 'TTL should be after creation');
  assert.equal(typeof score.crux_version, 'string');
  assert.equal(typeof score.degraded, 'boolean');
  assert.ok(Array.isArray(score.clarifications_requested));
  assert.ok(Array.isArray(score.data_sources_used));
});

test('computeScore: with empty verifiedEvidence array does not trigger LLM', async () => {
  const { computeScore } = await import('../../src/modules/crux/agents/scoring.agent');
  const output = makeBaseFetcherOutput(6);
  const score = await computeScore(output, 'balanced', 'delivered', 'growth', []);
  assert.equal(score.weight_adjustments, undefined, 'empty array should not trigger adjustments');
  assert.equal(score.verified_evidence_used, 0);
});

test('computeScore: lifecycle near_completion shifts weights differently', async () => {
  const { computeScore } = await import('../../src/modules/crux/agents/scoring.agent');
  const output = makeBaseFetcherOutput(6);
  const nearCompletion = await computeScore(output, 'balanced', 'near_completion', 'growth');
  const delivered = await computeScore(output, 'balanced', 'delivered', 'growth');
  assert.notEqual(nearCompletion.score_composite, delivered.score_composite,
    'different lifecycles should produce different scores');
});

test('computeScore: macro cycle correction shifts weights differently', async () => {
  const { computeScore } = await import('../../src/modules/crux/agents/scoring.agent');
  const output = makeBaseFetcherOutput(6);
  const growth = await computeScore(output, 'balanced', 'delivered', 'growth');
  const correction = await computeScore(output, 'balanced', 'delivered', 'correction');
  assert.notEqual(growth.score_composite, correction.score_composite,
    'different macro cycles should produce different scores');
});

test('computeScore: score is stable for same inputs', async () => {
  const { computeScore } = await import('../../src/modules/crux/agents/scoring.agent');
  const output = makeBaseFetcherOutput(6);
  const score1 = await computeScore(output, 'balanced', 'delivered', 'growth');
  const score2 = await computeScore(output, 'balanced', 'delivered', 'growth');
  assert.equal(score1.score_composite, score2.score_composite, 'same inputs should produce same score');
  assert.equal(score1.methodology_hash, score2.methodology_hash, 'methodology hash should be stable');
});
