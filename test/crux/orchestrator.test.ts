import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWeights, buildSystemPrompt } from './scoring.agent.test-utils';

test('orchestrator: buildWeights returns all 6 categories', () => {
  const weights = buildWeights('balanced', 'delivered', 'growth');
  const categories = ['location_intelligence', 'developer_reliability', 'legal_compliance', 'market_valuation', 'structural_physical', 'risk_composite'];
  for (const cat of categories) {
    assert.ok(typeof (weights as Record<string, number>)[cat] === 'number', `${cat} should be a number`);
  }
});

test('orchestrator: buildWeights sums to 1.0 for balanced/delivered/growth', () => {
  const weights = buildWeights('balanced', 'delivered', 'growth');
  const sum = (Object.values(weights) as number[]).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1.0) < 0.0001, `weights should sum to 1.0, got ${sum}`);
});

test('orchestrator: buildWeights shifts market_valuation up for yield intent', () => {
  const balanced = buildWeights('balanced', 'delivered', 'growth');
  const yieldWeights = buildWeights('yield', 'delivered', 'growth');
  assert.ok((yieldWeights.market_valuation as number) > (balanced.market_valuation as number),
    'yield should increase market_valuation weight');
});

test('orchestrator: buildWeights shifts developer_reliability up for appreciation', () => {
  const balanced = buildWeights('balanced', 'delivered', 'growth');
  const appWeights = buildWeights('appreciation', 'delivered', 'growth');
  assert.ok((appWeights.developer_reliability as number) > (balanced.developer_reliability as number),
    'appreciation should increase developer_reliability weight');
});

test('orchestrator: buildWeights shifts developer_reliability up for near_completion', () => {
  const delivered = buildWeights('balanced', 'delivered', 'growth');
  const nearCompletion = buildWeights('balanced', 'near_completion', 'growth');
  assert.ok((nearCompletion.developer_reliability as number) > (delivered.developer_reliability as number),
    'near_completion should increase developer_reliability weight');
});

test('orchestrator: buildWeights shifts risk_composite up for correction cycle', () => {
  const growth = buildWeights('balanced', 'delivered', 'growth');
  const correction = buildWeights('balanced', 'delivered', 'correction');
  assert.ok((correction.risk_composite as number) > (growth.risk_composite as number),
    'correction should increase risk_composite weight');
});

test('orchestrator: buildSystemPrompt includes weight adjustments when present', () => {
  const mockScore = {
    id: 'score-1',
    property_id: 'prop-1',
    intent_profile: 'balanced' as const,
    lifecycle_stage: 'delivered' as const,
    macro_cycle: 'growth' as const,
    score_composite: 61,
    score_breakdown: {
      location_intelligence: 66,
      developer_reliability: 50,
      legal_compliance: 60,
      market_valuation: 80,
      structural_physical: 50,
      risk_composite: 50,
    },
    data_sources_used: ['google_maps', 'nhb_residex'],
    confidence_score: 0.5,
    crux_version: '0.2.0',
    methodology_hash: 'abc123',
    created_at: new Date().toISOString(),
    ttl_expires_at: new Date(Date.now() + 86400000).toISOString(),
    degraded: false,
    clarifications_requested: [],
    weight_adjustments: [
      {
        category: 'location_intelligence' as const,
        base_weight: 0.30,
        adjusted_weight: 0.32,
        delta: 0.02,
        reason: 'Verified AQI data shows excellent air quality',
        evidence_ids: ['ev-1'],
      },
    ],
    verified_evidence_used: 1,
  };

  const property = {
    id: 'prop-1',
    address_raw: 'Test Street',
    address_normalized: 'Test Street, Pune',
    geocode_lat: 18.5,
    geocode_lng: 73.8,
    pin_code: '411001',
    city: 'Pune',
    state: 'Maharashtra',
    property_type: 'residential_apartment',
    approx_size_sqft: 1200,
    research_context: null,
    verification_context: null,
  };

  const prompt = buildSystemPrompt(property, mockScore);
  assert.ok(prompt.includes('LAYER 3D'), 'prompt should include LAYER 3D');
  assert.ok(prompt.includes('weight adjustments'), 'prompt should mention weight adjustments');
  assert.ok(prompt.includes('location_intelligence'), 'prompt should include adjusted category');
  assert.ok(prompt.includes('+0.020'), 'prompt should include delta');
  assert.ok(prompt.includes('Verified AQI data'), 'prompt should include reason');
});

test('orchestrator: buildSystemPrompt shows no adjustments message when none present', () => {
  const mockScore = {
    id: 'score-1',
    property_id: 'prop-1',
    intent_profile: 'balanced' as const,
    lifecycle_stage: 'delivered' as const,
    macro_cycle: 'growth' as const,
    score_composite: 61,
    score_breakdown: {
      location_intelligence: 66,
      developer_reliability: 50,
      legal_compliance: 60,
      market_valuation: 80,
      structural_physical: 50,
      risk_composite: 50,
    },
    data_sources_used: ['google_maps'],
    confidence_score: 0.5,
    crux_version: '0.2.0',
    methodology_hash: 'abc123',
    created_at: new Date().toISOString(),
    ttl_expires_at: new Date(Date.now() + 86400000).toISOString(),
    degraded: false,
    clarifications_requested: [],
    weight_adjustments: undefined,
    verified_evidence_used: 0,
  };

  const property = {
    id: 'prop-1',
    address_raw: 'Test',
    address_normalized: 'Test',
    geocode_lat: 18.5,
    geocode_lng: 73.8,
    pin_code: '411001',
    city: 'Pune',
    state: 'Maharashtra',
    property_type: 'residential_apartment',
    approx_size_sqft: 1200,
    research_context: null,
    verification_context: null,
  };

  const prompt = buildSystemPrompt(property, mockScore);
  assert.ok(prompt.includes('LAYER 3D'));
  assert.ok(prompt.includes('No evidence-backed weight adjustments'), 'should say no adjustments applied');
});

test('orchestrator: buildSystemPrompt includes verified evidence count', () => {
  const mockScore = {
    id: 'score-1',
    property_id: 'prop-1',
    intent_profile: 'balanced' as const,
    lifecycle_stage: 'delivered' as const,
    macro_cycle: 'growth' as const,
    score_composite: 61,
    score_breakdown: {
      location_intelligence: 66,
      developer_reliability: 50,
      legal_compliance: 60,
      market_valuation: 80,
      structural_physical: 50,
      risk_composite: 50,
    },
    data_sources_used: ['google_maps'],
    confidence_score: 0.5,
    crux_version: '0.2.0',
    methodology_hash: 'abc123',
    created_at: new Date().toISOString(),
    ttl_expires_at: new Date(Date.now() + 86400000).toISOString(),
    degraded: false,
    clarifications_requested: [],
    weight_adjustments: [],
    verified_evidence_used: 5,
  };

  const property = {
    id: 'prop-1',
    address_raw: 'Test',
    address_normalized: 'Test',
    geocode_lat: 18.5,
    geocode_lng: 73.8,
    pin_code: '411001',
    city: 'Pune',
    state: 'Maharashtra',
    property_type: 'residential_apartment',
    approx_size_sqft: 1200,
    research_context: null,
    verification_context: null,
  };

  const prompt = buildSystemPrompt(property, mockScore);
  assert.ok(prompt.includes('Verified Evidence Used: 5 items'), 'should show verified evidence count');
});

test('orchestrator: buildSystemPrompt handles null score gracefully', () => {
  const property = {
    id: 'prop-1',
    address_raw: 'Test',
    address_normalized: 'Test, Pune',
    geocode_lat: 18.5,
    geocode_lng: 73.8,
    pin_code: '411001',
    city: 'Pune',
    state: 'Maharashtra',
    property_type: 'residential_apartment',
    approx_size_sqft: 1200,
    research_context: null,
    verification_context: null,
  };

  const prompt = buildSystemPrompt(property, null);
  assert.ok(prompt.includes('No CRUX Score has been computed'), 'should indicate no score available');
  assert.ok(prompt.includes('LAYER 3D'), 'should still include LAYER 3D');
  assert.ok(prompt.includes('No evidence-backed'), 'should say no adjustments');
});

test('orchestrator: buildWeights all sum to 1.0 for all combinations', () => {
  const intents = ['yield', 'appreciation', 'balanced'] as const;
  const lifecycles = ['near_completion', 'delivered'] as const;
  const cycles = ['growth', 'correction'] as const;

  for (const intent of intents) {
    for (const lifecycle of lifecycles) {
      for (const cycle of cycles) {
        const weights = buildWeights(intent, lifecycle, cycle);
        const sum = (Object.values(weights) as number[]).reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(sum - 1.0) < 0.0001,
          `weights for ${intent}/${lifecycle}/${cycle} should sum to 1.0, got ${sum}`);
      }
    }
  }
});
