import assert from 'node:assert/strict';
import test from 'node:test';
import { fetcherOutputToEvidenceItems } from '../../src/modules/crux/shared/fetcher-to-evidence';
import type { AggregatedFetcherOutput } from '../../src/modules/crux/shared/types';

function buildBaseOutput(): AggregatedFetcherOutput {
  const now = new Date().toISOString();
  return {
    property_id: 'prop-001',
    cpcb_aqi: { source: 'cpcb_aqi', fetched_at: now, success: false, data: null, error: 'network error' },
    google_maps: { source: 'google_maps', fetched_at: now, success: false, data: null },
    nhb_residex: { source: 'nhb_residex', fetched_at: now, success: false, data: null },
    mca21: { source: 'mca21', fetched_at: now, success: false, data: null },
    ecourts: { source: 'ecourts', fetched_at: now, success: false, data: null },
    cpwd: { source: 'cpwd', fetched_at: now, success: false, data: null },
    fetched_at: now,
    sources_succeeded: 0,
    sources_attempted: 6,
  };
}

test('fetcher-to-evidence: CPCB AQI maps to environment domain with official tier', () => {
  const now = new Date().toISOString();
  const output = { ...buildBaseOutput(), sources_succeeded: 1,
    cpcb_aqi: {
      source: 'cpcb_aqi', fetched_at: now, success: true,
      data: { aqi: 65, category: 'Satisfactory', station: 'Pune-Station', recorded_at: now },
    },
  };
  const items = fetcherOutputToEvidenceItems(output, 'run-01');
  assert.equal(items.length, 1, 'should produce one evidence item for CPCB');
  const item = items[0]!;
  assert.equal(item.domain, 'environment');
  assert.equal(item.authority_tier, 'official');
  assert.equal(item.status, 'accepted');
  assert.ok(item.claim_text.includes('65'), 'claim_text should include AQI value');
  assert.ok(item.claim_text.includes('Satisfactory'), 'claim_text should include category');
  assert.equal(item.normalized_claim.aqi, 65);
  assert.equal(item.source_kind, 'web');
});

test('fetcher-to-evidence: Google Maps maps to locality domain with secondary tier', () => {
  const now = new Date().toISOString();
  const output = { ...buildBaseOutput(), sources_succeeded: 1,
    google_maps: {
      source: 'google_maps', fetched_at: now, success: true,
      data: { poi_count_500m: 35, commute_minutes_to_cbd: 15, walkability_score: 72, transit_score: 55 },
    },
  };
  const items = fetcherOutputToEvidenceItems(output, 'run-01');
  assert.equal(items.length, 1);
  assert.equal(items[0]!.domain, 'locality');
  assert.equal(items[0]!.authority_tier, 'secondary');
  assert.ok(items[0]!.claim_text.includes('35'));
  assert.ok(items[0]!.claim_text.includes('15'));
});

test('fetcher-to-evidence: NHB RESIDEX maps to market domain with official tier', () => {
  const now = new Date().toISOString();
  const output = { ...buildBaseOutput(), sources_succeeded: 1,
    nhb_residex: {
      source: 'nhb_residex', fetched_at: now, success: true,
      data: { city: 'Pune', property_type: 'residential', hpi_current: 310, hpi_qoq_change: 2.5, period: 'Q1 2026' },
    },
  };
  const items = fetcherOutputToEvidenceItems(output, 'run-01');
  assert.equal(items.length, 1);
  assert.equal(items[0]!.domain, 'market');
  assert.equal(items[0]!.authority_tier, 'official');
  assert.ok(items[0]!.claim_text.includes('310'));
  assert.ok(items[0]!.claim_text.includes('2.5'));
});

test('fetcher-to-evidence: MCA21 maps to developer domain with official tier', () => {
  const now = new Date().toISOString();
  const output = { ...buildBaseOutput(), sources_succeeded: 1,
    mca21: {
      source: 'mca21', fetched_at: now, success: true,
      data: { company_name: 'Test Corp', cin: 'U12345MH2020PLC123456', company_status: 'Active', npa_flag: false, incorporation_date: '2020-01-01', director_count: 4 },
    },
  };
  const items = fetcherOutputToEvidenceItems(output, 'run-01');
  assert.equal(items.length, 1);
  assert.equal(items[0]!.domain, 'developer');
  assert.equal(items[0]!.authority_tier, 'official');
  assert.ok(items[0]!.claim_text.includes('Test Corp'));
  assert.ok(items[0]!.claim_text.includes('Active'));
});

test('fetcher-to-evidence: eCourts maps to legal domain with official tier', () => {
  const now = new Date().toISOString();
  const output = { ...buildBaseOutput(), sources_succeeded: 1,
    ecourts: {
      source: 'ecourts', fetched_at: now, success: true,
      data: { cases_found: 3, open_cases: 1, closed_cases: 2, case_types: ['civil', 'property'] },
    },
  };
  const items = fetcherOutputToEvidenceItems(output, 'run-01');
  assert.equal(items.length, 1);
  assert.equal(items[0]!.domain, 'legal');
  assert.equal(items[0]!.authority_tier, 'official');
  assert.ok(items[0]!.claim_text.includes('3'));
  assert.ok(items[0]!.claim_text.includes('1 open'));
});

test('fetcher-to-evidence: CPWD maps to market domain with official tier', () => {
  const now = new Date().toISOString();
  const output = { ...buildBaseOutput(), sources_succeeded: 1,
    cpwd: {
      source: 'cpwd', fetched_at: now, success: true,
      data: { state: 'Maharashtra', city_tier: 'tier1', construction_cost_per_sqft: 2500, last_updated: '2026-01-01' },
    },
  };
  const items = fetcherOutputToEvidenceItems(output, 'run-01');
  assert.equal(items.length, 1);
  assert.equal(items[0]!.domain, 'market');
  assert.equal(items[0]!.authority_tier, 'official');
  assert.ok(items[0]!.claim_text.includes('tier1'));
});

test('fetcher-to-evidence: all 6 successful sources produce 6 evidence items', () => {
  const now = new Date().toISOString();
  const output: AggregatedFetcherOutput = {
    property_id: 'prop-001',
    cpcb_aqi: { source: 'cpcb_aqi', fetched_at: now, success: true, data: { aqi: 50, category: 'Good', station: 'Test', recorded_at: now } },
    google_maps: { source: 'google_maps', fetched_at: now, success: true, data: { poi_count_500m: 10, commute_minutes_to_cbd: 20, walkability_score: null, transit_score: null } },
    nhb_residex: { source: 'nhb_residex', fetched_at: now, success: true, data: { city: 'Test', property_type: 'residential', hpi_current: 100, hpi_qoq_change: 1, period: 'Q1' } },
    mca21: { source: 'mca21', fetched_at: now, success: true, data: { company_name: 'Test', cin: 'X', company_status: 'Active', npa_flag: false, incorporation_date: '2020-01-01', director_count: 1 } },
    ecourts: { source: 'ecourts', fetched_at: now, success: true, data: { cases_found: 0, open_cases: 0, closed_cases: 0, case_types: [] } },
    cpwd: { source: 'cpwd', fetched_at: now, success: true, data: { state: 'Test', city_tier: 'tier2', construction_cost_per_sqft: 1000, last_updated: now } },
    fetched_at: now,
    sources_succeeded: 6,
    sources_attempted: 6,
  };
  const items = fetcherOutputToEvidenceItems(output, 'run-01');
  assert.equal(items.length, 6, 'all 6 sources should produce evidence');
});

test('fetcher-to-evidence: failed sources are skipped', () => {
  const now = new Date().toISOString();
  const output = { ...buildBaseOutput(), sources_succeeded: 0 };
  output.cpcb_aqi.error = 'network error';
  output.mca21.error = 'api unavailable';
  const items = fetcherOutputToEvidenceItems(output, 'run-01');
  assert.equal(items.length, 0, 'no evidence when all sources fail');
});

test('fetcher-to-evidence: claim_hash is unique per source', () => {
  const now = new Date().toISOString();
  const output: AggregatedFetcherOutput = {
    property_id: 'prop-001',
    cpcb_aqi: { source: 'cpcb_aqi', fetched_at: now, success: true, data: { aqi: 50, category: 'Good', station: 'Test', recorded_at: now } },
    google_maps: { source: 'google_maps', fetched_at: now, success: true, data: { poi_count_500m: 10, commute_minutes_to_cbd: 20, walkability_score: null, transit_score: null } },
    nhb_residex: { source: 'nhb_residex', fetched_at: now, success: false, data: null },
    mca21: { source: 'mca21', fetched_at: now, success: false, data: null },
    ecourts: { source: 'ecourts', fetched_at: now, success: false, data: null },
    cpwd: { source: 'cpwd', fetched_at: now, success: false, data: null },
    fetched_at: now,
    sources_succeeded: 2,
    sources_attempted: 6,
  };
  const items = fetcherOutputToEvidenceItems(output, 'run-01');
  assert.equal(items.length, 2);
  assert.notEqual(items[0]!.claim_hash, items[1]!.claim_hash, 'different sources should have different hashes');
});

test('fetcher-to-evidence: run_id is propagated to all evidence items', () => {
  const now = new Date().toISOString();
  const output: AggregatedFetcherOutput = {
    property_id: 'prop-001',
    cpcb_aqi: { source: 'cpcb_aqi', fetched_at: now, success: true, data: { aqi: 50, category: 'Good', station: 'Test', recorded_at: now } },
    google_maps: { source: 'google_maps', fetched_at: now, success: true, data: { poi_count_500m: 10, commute_minutes_to_cbd: 20, walkability_score: null, transit_score: null } },
    nhb_residex: { source: 'nhb_residex', fetched_at: now, success: false, data: null },
    mca21: { source: 'mca21', fetched_at: now, success: false, data: null },
    ecourts: { source: 'ecourts', fetched_at: now, success: false, data: null },
    cpwd: { source: 'cpwd', fetched_at: now, success: false, data: null },
    fetched_at: now,
    sources_succeeded: 2,
    sources_attempted: 6,
  };
  const items = fetcherOutputToEvidenceItems(output, 'specific-run-42');
  for (const item of items) {
    assert.equal(item.run_id, 'specific-run-42');
    assert.equal(item.property_id, 'prop-001');
  }
});

test('fetcher-to-evidence: confidence reflects fetcher success', () => {
  const now = new Date().toISOString();
  const output = { ...buildBaseOutput(), sources_succeeded: 1,
    cpcb_aqi: { source: 'cpcb_aqi', fetched_at: now, success: true, data: { aqi: 50, category: 'Good', station: 'Test', recorded_at: now } },
  };
  const items = fetcherOutputToEvidenceItems(output, 'run-01');
  assert.equal(items[0]!.confidence, 0.85, 'successful fetcher should give confidence 0.85');
});

test('fetcher-to-evidence: MCA21 with NPA flag includes NPA reference in claim', () => {
  const now = new Date().toISOString();
  const output = { ...buildBaseOutput(), sources_succeeded: 1,
    mca21: {
      source: 'mca21', fetched_at: now, success: true,
      data: { company_name: 'BadCorp', cin: 'U12345', company_status: 'Active', npa_flag: true, incorporation_date: '2015-01-01', director_count: 2 },
    },
  };
  const items = fetcherOutputToEvidenceItems(output, 'run-01');
  assert.ok(items[0]!.claim_text.includes('NPA flag'), 'NPA flag should be mentioned');
});
