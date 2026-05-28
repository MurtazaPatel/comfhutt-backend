import assert from 'node:assert/strict';
import test from 'node:test';
import type { PropertyProfile, VerifiedEvidenceItem } from '../../src/modules/crux/shared/types';

const now = new Date().toISOString();

const realProperties: PropertyProfile[] = [
  {
    id: 'prop-bkc-mumbai',
    address_raw: 'Bandra Kurla Complex, Mumbai, Maharashtra 400051',
    address_normalized: 'Bandra Kurla Complex, Mumbai, Maharashtra 400051, India',
    geocode_lat: 19.0692,
    geocode_lng: 72.8662,
    pin_code: '400051',
    city: 'Mumbai',
    state: 'Maharashtra',
    property_type: 'commercial_office',
    approx_size_sqft: 2500,
    developer_name: 'Wadhwa Group',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'prop-hsr-bangalore',
    address_raw: 'HSR Layout Sector 1, Bangalore, Karnataka 560102',
    address_normalized: 'HSR Layout Sector 1, Bangalore, Karnataka 560102, India',
    geocode_lat: 12.9116,
    geocode_lng: 77.6389,
    pin_code: '560102',
    city: 'Bangalore',
    state: 'Karnataka',
    property_type: 'residential_apartment',
    approx_size_sqft: 1400,
    developer_name: 'Sobha Limited',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'prop-dlf-gurgaon',
    address_raw: 'DLF Phase 1, Gurgaon, Haryana 122002',
    address_normalized: 'DLF Phase 1, Gurgaon, Haryana 122002, India',
    geocode_lat: 28.4623,
    geocode_lng: 77.0907,
    pin_code: '122002',
    city: 'Gurgaon',
    state: 'Haryana',
    property_type: 'residential_villa',
    approx_size_sqft: 3500,
    developer_name: 'DLF Limited',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'prop-noida-sec62',
    address_raw: 'Sector 62, Noida, Uttar Pradesh 201309',
    address_normalized: 'Sector 62, Noida, Uttar Pradesh 201309, India',
    geocode_lat: 28.6220,
    geocode_lng: 77.3665,
    pin_code: '201309',
    city: 'Noida',
    state: 'Uttar Pradesh',
    property_type: 'commercial_retail',
    approx_size_sqft: 1800,
    developer_name: 'Supertech Limited',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'prop-powai-mumbai',
    address_raw: 'Powai, Mumbai, Maharashtra 400076',
    address_normalized: 'Powai, Mumbai, Maharashtra 400076, India',
    geocode_lat: 19.1176,
    geocode_lng: 72.9060,
    pin_code: '400076',
    city: 'Mumbai',
    state: 'Maharashtra',
    property_type: 'residential_apartment',
    approx_size_sqft: 1600,
    developer_name: 'Lodha Group',
    created_at: now,
    updated_at: now,
  },
];

function makeFakeFetcherOutput(propertyId: string, sourcesSucceeded: number = 6) {
  const now = new Date().toISOString();
  return {
    property_id: propertyId,
    cpcb_aqi: { source: 'cpcb_aqi', fetched_at: now, success: sourcesSucceeded >= 1, data: sourcesSucceeded >= 1 ? { aqi: 65, category: 'Satisfactory' as const, station: 'Test', recorded_at: now } : null },
    google_maps: { source: 'google_maps', fetched_at: now, success: sourcesSucceeded >= 2, data: sourcesSucceeded >= 2 ? { poi_count_500m: 35, commute_minutes_to_cbd: 15, walkability_score: null, transit_score: null } : null },
    nhb_residex: { source: 'nhb_residex', fetched_at: now, success: sourcesSucceeded >= 3, data: sourcesSucceeded >= 3 ? { city: 'Test', property_type: 'residential', hpi_current: 300, hpi_qoq_change: 2.5, period: 'Q1' } : null },
    mca21: { source: 'mca21', fetched_at: now, success: sourcesSucceeded >= 4, data: sourcesSucceeded >= 4 ? { company_name: 'Test Developer', cin: 'U12345MH2020PLC123456', company_status: 'Active' as const, npa_flag: false, incorporation_date: '2020-01-01', director_count: 4 } : null },
    ecourts: { source: 'ecourts', fetched_at: now, success: sourcesSucceeded >= 5, data: sourcesSucceeded >= 5 ? { cases_found: 2, open_cases: 1, closed_cases: 1, case_types: ['civil'] } : null },
    cpwd: { source: 'cpwd', fetched_at: now, success: sourcesSucceeded >= 6, data: sourcesSucceeded >= 6 ? { state: 'Test', city_tier: 'tier1' as const, construction_cost_per_sqft: 2500, last_updated: now } : null },
    fetched_at: now,
    sources_succeeded: sourcesSucceeded,
    sources_attempted: 6,
  };
}

function makeVerifiedEvidence(propertyId: string): VerifiedEvidenceItem[] {
  const now = new Date().toISOString();
  return [
    {
      evidence: {
        id: `ev-loc-${propertyId}`,
        run_id: `research-${propertyId}`,
        property_id: propertyId,
        domain: 'locality',
        source_kind: 'web',
        authority_tier: 'secondary',
        status: 'accepted',
        claim_text: 'Area has strong infrastructure with multiple commercial hubs nearby. Walkability score is above average.',
        normalized_claim: {},
        source_title: 'MagicBricks',
        source_url: 'https://www.magicbricks.com',
        source_path: null,
        excerpt: 'strong infrastructure',
        observed_at: null,
        freshness_expires_at: null,
        confidence: 0.82,
        rejection_reason: null,
        claim_hash: `hash-loc-${propertyId}`,
        created_at: now,
      },
      verification: {
        id: `ver-loc-${propertyId}`,
        run_id: `ver-${propertyId}`,
        property_id: propertyId,
        research_run_id: `research-${propertyId}`,
        evidence_item_id: `ev-loc-${propertyId}`,
        verification_status: 'verified',
        verifier_confidence: 0.88,
        direct_match: true,
        freshness_ok: true,
        support_score: 0.85,
        contradiction_score: 0.05,
        supporting_evidence_ids: [],
        contradicting_evidence_ids: [],
        verification_notes: null,
        created_at: now,
      },
    },
    {
      evidence: {
        id: `ev-market-${propertyId}`,
        run_id: `research-${propertyId}`,
        property_id: propertyId,
        domain: 'market',
        source_kind: 'web',
        authority_tier: 'primary',
        status: 'accepted',
        claim_text: 'NHB RESIDEX shows positive QoQ price growth of 2.5% indicating strong market momentum.',
        normalized_claim: {},
        source_title: 'NHB RESIDEX',
        source_url: null,
        source_path: null,
        excerpt: 'positive growth',
        observed_at: null,
        freshness_expires_at: null,
        confidence: 0.90,
        rejection_reason: null,
        claim_hash: `hash-market-${propertyId}`,
        created_at: now,
      },
      verification: {
        id: `ver-market-${propertyId}`,
        run_id: `ver-${propertyId}`,
        property_id: propertyId,
        research_run_id: `research-${propertyId}`,
        evidence_item_id: `ev-market-${propertyId}`,
        verification_status: 'verified',
        verifier_confidence: 0.92,
        direct_match: true,
        freshness_ok: true,
        support_score: 0.90,
        contradiction_score: 0.02,
        supporting_evidence_ids: [],
        contradicting_evidence_ids: [],
        verification_notes: null,
        created_at: now,
      },
    },
    {
      evidence: {
        id: `ev-developer-${propertyId}`,
        run_id: `research-${propertyId}`,
        property_id: propertyId,
        domain: 'developer',
        source_kind: 'web',
        authority_tier: 'official',
        status: 'accepted',
        claim_text: 'Developer has active MCA21 registration with no NPA flags, indicating financial stability.',
        normalized_claim: {},
        source_title: 'MCA21',
        source_url: null,
        source_path: null,
        excerpt: 'financial stability',
        observed_at: null,
        freshness_expires_at: null,
        confidence: 0.95,
        rejection_reason: null,
        claim_hash: `hash-dev-${propertyId}`,
        created_at: now,
      },
      verification: {
        id: `ver-dev-${propertyId}`,
        run_id: `ver-${propertyId}`,
        property_id: propertyId,
        research_run_id: `research-${propertyId}`,
        evidence_item_id: `ev-developer-${propertyId}`,
        verification_status: 'verified',
        verifier_confidence: 0.95,
        direct_match: true,
        freshness_ok: true,
        support_score: 0.93,
        contradiction_score: 0.01,
        supporting_evidence_ids: [],
        contradicting_evidence_ids: [],
        verification_notes: null,
        created_at: now,
      },
    },
  ];
}

test('E2E: full pipeline for BKC Mumbai commercial property', async () => {
  const { computeScore } = await import('../../src/modules/crux/agents/scoring.agent');
  const property = realProperties[0]!;
  const output = makeFakeFetcherOutput(property.id, 6);
  const evidence = makeVerifiedEvidence(property.id);

  const score = await computeScore(output, 'balanced', 'delivered', 'growth', evidence);

  console.log('\n=== BKC Mumbai — Commercial Office ===');
  console.log(`  Composite Score: ${score.score_composite}/100`);
  console.log(`  Confidence: ${(score.confidence_score * 100).toFixed(0)}%`);
  console.log(`  Degraded: ${score.degraded}`);
  console.log(`  Verified Evidence Used: ${score.verified_evidence_used}`);
  console.log(`  Data Sources: ${score.data_sources_used.join(', ')}`);
  console.log('  Breakdown:', JSON.stringify(score.score_breakdown, null, 2));
  if (score.weight_adjustments?.length) {
    console.log('  Weight Adjustments:');
    score.weight_adjustments.forEach(a => {
      console.log(`    ${a.category}: ${a.delta > 0 ? '+' : ''}${a.delta.toFixed(3)} (from ${a.base_weight.toFixed(3)} → ${a.adjusted_weight.toFixed(3)})`);
      console.log(`      Reason: ${a.reason}`);
      console.log(`      Evidence: ${a.evidence_ids.join(', ')}`);
    });
  } else {
    console.log('  Weight Adjustments: (none applied — LLM fallback or no adjustments needed)');
  }

  assert.ok(score.score_composite >= 0 && score.score_composite <= 100);
  assert.equal(score.verified_evidence_used, 3);
  assert.equal(score.degraded, false);
  assert.ok(score.data_sources_used.length > 0);
  assert.ok(score.score_breakdown.location_intelligence > 0);
  assert.ok(score.score_breakdown.developer_reliability > 0);
  assert.ok(score.score_breakdown.market_valuation > 0);
});

test('E2E: full pipeline for HSR Bangalore residential', async () => {
  const { computeScore } = await import('../../src/modules/crux/agents/scoring.agent');
  const property = realProperties[1]!;
  const output = makeFakeFetcherOutput(property.id, 5);
  const evidence = makeVerifiedEvidence(property.id);

  const score = await computeScore(output, 'appreciation', 'near_completion', 'growth', evidence);

  console.log('\n=== HSR Layout Bangalore — Residential Apartment (appreciation/near_completion) ===');
  console.log(`  Composite Score: ${score.score_composite}/100`);
  console.log(`  Confidence: ${(score.confidence_score * 100).toFixed(0)}%`);
  console.log(`  Degraded: ${score.degraded}`);
  console.log(`  Verified Evidence Used: ${score.verified_evidence_used}`);
  console.log('  Breakdown:', JSON.stringify(score.score_breakdown, null, 2));
  if (score.weight_adjustments?.length) {
    console.log('  Weight Adjustments:');
    score.weight_adjustments.forEach(a => {
      console.log(`    ${a.category}: ${a.delta > 0 ? '+' : ''}${a.delta.toFixed(3)}`);
      console.log(`      ${a.reason}`);
    });
  } else {
    console.log('  Weight Adjustments: (none)');
  }

  assert.ok(score.score_composite >= 0 && score.score_composite <= 100);
  assert.ok(score.verified_evidence_used! >= 3);
});

test('E2E: full pipeline for DLF Gurgaon villa', async () => {
  const { computeScore } = await import('../../src/modules/crux/agents/scoring.agent');
  const property = realProperties[2]!;
  const output = makeFakeFetcherOutput(property.id, 6);
  const evidence = makeVerifiedEvidence(property.id);

  const score = await computeScore(output, 'yield', 'delivered', 'correction', evidence);

  console.log('\n=== DLF Phase 1 Gurgaon — Villa (yield/correction) ===');
  console.log(`  Composite Score: ${score.score_composite}/100`);
  console.log(`  Confidence: ${(score.confidence_score * 100).toFixed(0)}%`);
  console.log(`  Degraded: ${score.degraded}`);
  console.log(`  Verified Evidence Used: ${score.verified_evidence_used}`);
  console.log('  Breakdown:', JSON.stringify(score.score_breakdown, null, 2));
  if (score.weight_adjustments?.length) {
    console.log('  Weight Adjustments:');
    score.weight_adjustments.forEach(a => {
      console.log(`    ${a.category}: ${a.delta > 0 ? '+' : ''}${a.delta.toFixed(3)}`);
      console.log(`      ${a.reason}`);
    });
  }

  assert.ok(score.score_composite >= 0 && score.score_composite <= 100);
});

test('E2E: full pipeline for Noida Sector 62 commercial (partial failure)', async () => {
  const { computeScore } = await import('../../src/modules/crux/agents/scoring.agent');
  const property = realProperties[3]!;
  const output = makeFakeFetcherOutput(property.id, 3);
  const evidence = makeVerifiedEvidence(property.id);

  const score = await computeScore(output, 'balanced', 'delivered', 'growth', evidence);

  console.log('\n=== Sector 62 Noida — Commercial Retail (3/6 sources only) ===');
  console.log(`  Composite Score: ${score.score_composite}/100`);
  console.log(`  Confidence: ${(score.confidence_score * 100).toFixed(0)}%`);
  console.log(`  Degraded: ${score.degraded}`);
  console.log(`  Data Sources: ${score.data_sources_used.join(', ')}`);
  console.log('  Breakdown:', JSON.stringify(score.score_breakdown, null, 2));
  if (score.weight_adjustments?.length) {
    console.log('  Weight Adjustments:');
    score.weight_adjustments.forEach(a => {
      console.log(`    ${a.category}: ${a.delta > 0 ? '+' : ''}${a.delta.toFixed(3)} → ${a.reason}`);
    });
  }

  assert.ok(score.score_composite >= 0 && score.score_composite <= 100);
  assert.equal(score.confidence_score, 0.5, '3/6 sources = 0.5 confidence');
});

test('E2E: full pipeline for Powai Mumbai (all failed — degraded mode)', async () => {
  const { computeScore } = await import('../../src/modules/crux/agents/scoring.agent');
  const property = realProperties[4]!;
  const output = makeFakeFetcherOutput(property.id, 0);

  const score = await computeScore(output, 'balanced', 'delivered', 'growth');

  console.log('\n=== Powai Mumbai — All Sources Failed (degraded mode) ===');
  console.log(`  Composite Score: ${score.score_composite}/100`);
  console.log(`  Confidence: ${(score.confidence_score * 100).toFixed(0)}%`);
  console.log(`  Degraded: ${score.degraded}`);
  console.log(`  Data Sources: (none)`);
  console.log(`  Verified Evidence Used: ${score.verified_evidence_used}`);
  console.log('  Breakdown:', JSON.stringify(score.score_breakdown, null, 2));

  assert.equal(score.degraded, true, 'should be degraded when all sources fail');
  assert.equal(score.confidence_score, 0);
  assert.equal(score.data_sources_used.length, 0);
  assert.equal(score.weight_adjustments, undefined, 'no weight adjustments without evidence');
});

test('E2E: score differentiation across varied fetcher data', async () => {
  const { computeScore } = await import('../../src/modules/crux/agents/scoring.agent');

  const scenarios = [
    { name: 'Excellent AQI + Full Sources', sourcesSucceeded: 6, intent: 'balanced' as const, lifecycle: 'delivered' as const, cycle: 'growth' as const },
    { name: 'Bad AQI (Poor)', sourcesSucceeded: 6, intent: 'balanced' as const, lifecycle: 'delivered' as const, cycle: 'growth' as const },
    { name: 'NPA Developer Flag', sourcesSucceeded: 6, intent: 'balanced' as const, lifecycle: 'delivered' as const, cycle: 'growth' as const },
    { name: '3/6 Sources Only', sourcesSucceeded: 3, intent: 'balanced' as const, lifecycle: 'delivered' as const, cycle: 'growth' as const },
    { name: 'All Failed + Degraded', sourcesSucceeded: 0, intent: 'balanced' as const, lifecycle: 'delivered' as const, cycle: 'growth' as const },
    { name: 'Yield Intent + Correction', sourcesSucceeded: 6, intent: 'yield' as const, lifecycle: 'delivered' as const, cycle: 'correction' as const },
    { name: 'Appreciation + Near Completion', sourcesSucceeded: 6, intent: 'appreciation' as const, lifecycle: 'near_completion' as const, cycle: 'growth' as const },
  ];

  const scores: Array<{ name: string; composite: number }> = [];

  for (const scenario of scenarios) {
    const now = new Date().toISOString();
    const aqi = scenario.name.includes('Bad AQI') ? 250 : scenario.name.includes('All Failed') ? 200 : 50;
    const npaFlag = scenario.name.includes('NPA');
    const output = {
      property_id: 'prop-diff',
      cpcb_aqi: { source: 'cpcb_aqi', fetched_at: now, success: scenario.sourcesSucceeded >= 1, data: scenario.sourcesSucceeded >= 1 ? { aqi, category: aqi <= 50 ? 'Good' as const : aqi <= 100 ? 'Satisfactory' as const : 'Poor' as const, station: 'Test', recorded_at: now } : null },
      google_maps: { source: 'google_maps', fetched_at: now, success: scenario.sourcesSucceeded >= 2, data: scenario.sourcesSucceeded >= 2 ? { poi_count_500m: 35, commute_minutes_to_cbd: 15, walkability_score: null, transit_score: null } : null },
      nhb_residex: { source: 'nhb_residex', fetched_at: now, success: scenario.sourcesSucceeded >= 3, data: scenario.sourcesSucceeded >= 3 ? { city: 'Test', property_type: 'residential', hpi_current: 300, hpi_qoq_change: 2.5, period: 'Q1' } : null },
      mca21: { source: 'mca21', fetched_at: now, success: scenario.sourcesSucceeded >= 4, data: scenario.sourcesSucceeded >= 4 ? { company_name: 'Test', cin: 'CIN', company_status: 'Active' as const, npa_flag: npaFlag, incorporation_date: '2020-01-01', director_count: 4 } : null },
      ecourts: { source: 'ecourts', fetched_at: now, success: scenario.sourcesSucceeded >= 5, data: scenario.sourcesSucceeded >= 5 ? { cases_found: 2, open_cases: 1, closed_cases: 1, case_types: ['civil'] } : null },
      cpwd: { source: 'cpwd', fetched_at: now, success: scenario.sourcesSucceeded >= 6, data: scenario.sourcesSucceeded >= 6 ? { state: 'Test', city_tier: 'tier1' as const, construction_cost_per_sqft: 2500, last_updated: now } : null },
      fetched_at: now,
      sources_succeeded: scenario.sourcesSucceeded,
      sources_attempted: 6,
    };

    const score = await computeScore(output, scenario.intent, scenario.lifecycle, scenario.cycle);
    scores.push({ name: scenario.name, composite: score.score_composite });
  }

  console.log('\n=== Score Differentiation Across 7 Scenarios ===');
  for (const s of scores) {
    console.log(`  ${s.name.padEnd(40)} Score: ${s.composite}/100`);
  }

  const uniqueScores = new Set(scores.map(s => s.composite));
  console.log(`  Unique score values: ${uniqueScores.size}/${scores.length}`);
  assert.ok(uniqueScores.size >= 3, `Expected at least 3 different scores across 7 scenarios, got ${uniqueScores.size}`);
});
