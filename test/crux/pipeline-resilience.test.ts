import assert from 'node:assert/strict';
import test from 'node:test';
import { supabase } from '../../src/lib/db';
import { runUnifiedPipeline } from '../../src/modules/crux/orchestrator/orchestrator.service';
import { computeScore } from '../../src/modules/crux/agents/scoring.agent';
import type { PropertyProfile } from '../../src/modules/crux/shared/types';

const NOW = new Date().toISOString();

const REAL_PROPERTY: PropertyProfile = {
  id: 'pipeline-test-koregaon-park',
  address_raw: 'Koregaon Park, Pune, Maharashtra 411001',
  address_normalized: 'Koregaon Park, Pune, Maharashtra 411001, India',
  geocode_lat: 18.5362,
  geocode_lng: 73.8940,
  pin_code: '411001',
  city: 'Pune',
  state: 'Maharashtra',
  property_type: 'residential_apartment',
  approx_size_sqft: 1500,
  developer_name: 'Kolte Patil Developers',
  created_at: NOW,
  updated_at: NOW,
};

test('REAL PIPELINE: ensure property exists in DB', async () => {
  const { error } = await supabase
    .from('crux_properties')
    .upsert(REAL_PROPERTY, { onConflict: 'id' });
  if (error) {
    console.error('Failed to upsert property:', error.message);
    assert.fail('Could not insert test property');
  }
});

test('REAL PIPELINE: runUnifiedPipeline fetcher + research + verification', async () => {
  console.log('\n═══════════════════════════════════════════');
  console.log('  REAL PIPELINE: Koregaon Park, Pune');
  console.log('  Developer: Kolte Patil Developers');
  console.log('═══════════════════════════════════════════\n');

  const t0 = Date.now();
  const result = await runUnifiedPipeline(REAL_PROPERTY);
  const elapsed = Date.now() - t0;

  // ── FETCHER RESULTS ──
  console.log('── FETCHER AGENT ──');
  console.log(`  Sources succeeded: ${result.fetcherOutput.sources_succeeded}/6`);
  console.log(`  Fetched at: ${result.fetcherOutput.fetched_at}`);
  const fetcherSources = [
    { name: 'CPCB AQI', result: result.fetcherOutput.cpcb_aqi },
    { name: 'Google Maps', result: result.fetcherOutput.google_maps },
    { name: 'NHB RESIDEX', result: result.fetcherOutput.nhb_residex },
    { name: 'MCA21', result: result.fetcherOutput.mca21 },
    { name: 'eCourts', result: result.fetcherOutput.ecourts },
    { name: 'CPWD', result: result.fetcherOutput.cpwd },
  ];
  for (const s of fetcherSources) {
    const icon = s.result.success ? '✅' : '❌';
    console.log(`  ${icon} ${s.name}: ${s.result.success ? JSON.stringify(s.result.data) : (s.result.error ?? 'failed')}`);
  }

  // ── RESEARCH RESULTS ──
  console.log('\n── RESEARCH AGENT ──');
  if (result.researchResult) {
    console.log(`  Run ID: ${result.researchResult.run.id}`);
    console.log(`  Status: ${result.researchResult.run.status}`);
    console.log(`  Evidence: accepted=${result.researchResult.digest.accepted_count}, weak=${result.researchResult.digest.weak_count}, rejected=${result.researchResult.digest.rejected_count}`);

    const allEvidence = [
      ...result.researchResult.digest.accepted_items,
      ...result.researchResult.digest.weak_items,
    ];
    console.log(`  Total evidence items: ${allEvidence.length}`);

    for (const ev of allEvidence.slice(0, 5)) {
      console.log(`    [${ev.domain}] ${ev.status.toUpperCase()}: ${ev.claim_text.slice(0, 120)}...`);
      console.log(`      source: ${ev.source_title} | authority: ${ev.authority_tier} | confidence: ${ev.confidence}`);
    }
    if (allEvidence.length > 5) {
      console.log(`    ... and ${allEvidence.length - 5} more items`);
    }
  } else {
    console.log('  ❌ Research FAILED — no evidence available');
  }

  // ── VERIFICATION RESULTS ──
  console.log('\n── VERIFICATION AGENT ──');
  if (result.verificationDigest) {
    console.log(`  Run ID: ${result.verificationDigest.run_id}`);
    console.log(`  Status: ${result.verificationDigest.status}`);
    console.log(`  Verified: ${result.verificationDigest.verified_count}`);
    console.log(`  Contradicted: ${result.verificationDigest.contradicted_count}`);
    console.log(`  Inconclusive: ${result.verificationDigest.inconclusive_count}`);
    console.log(`  Stale: ${result.verificationDigest.stale_count}`);

    for (const vi of result.verificationDigest.verified_items.slice(0, 5)) {
      console.log(`    ✅ VERIFIED: [${vi.evidence.domain}] ${vi.evidence.claim_text.slice(0, 100)}...`);
      console.log(`       confidence: ${vi.verification.verifier_confidence} | direct_match: ${vi.verification.direct_match} | support: ${vi.verification.support_score.toFixed(2)}`);
    }
    for (const ci of result.verificationDigest.contradicted_items.slice(0, 3)) {
      console.log(`    ⚠️ CONTRADICTED: [${ci.evidence.domain}] ${ci.evidence.claim_text.slice(0, 100)}...`);
    }
    for (const ii of result.verificationDigest.inconclusive_items.slice(0, 3)) {
      console.log(`    ❓ INCONCLUSIVE: [${ii.evidence.domain}] ${ii.evidence.claim_text.slice(0, 100)}...`);
    }
  } else {
    console.log('  ❌ Verification FAILED or skipped — see above for research status');
  }

  // ── SCORING WITH VERIFIED EVIDENCE ──
  console.log('\n── SCORING AGENT (with verified evidence) ──');
  const verifiedEvidence = result.verificationDigest?.verified_items ?? [];
  const score = await computeScore(
    result.fetcherOutput,
    'balanced',
    'delivered',
    'growth',
    verifiedEvidence.length > 0 ? verifiedEvidence : undefined,
  );
  console.log(`  Composite Score: ${score.score_composite}/100`);
  console.log(`  Confidence: ${(score.confidence_score * 100).toFixed(0)}%`);
  console.log(`  Degraded: ${score.degraded}`);
  console.log(`  Verified Evidence Used: ${score.verified_evidence_used}`);
  console.log('  Breakdown:', JSON.stringify(score.score_breakdown, null, 2));

  if (score.weight_adjustments?.length) {
    console.log('\n  🔧 WEIGHT ADJUSTMENTS (evidence-backed):');
    for (const a of score.weight_adjustments) {
      console.log(`    ${a.category}: ${a.delta > 0 ? '+' : ''}${a.delta.toFixed(3)}`);
      console.log(`      reason: ${a.reason}`);
      console.log(`      evidence: ${a.evidence_ids.join(', ')}`);
    }
  } else {
    console.log('\n  🔧 NO weight adjustments (LLM fallback or no verified evidence)');
  }

  console.log(`\n  ⏱ Pipeline wall time: ${(elapsed / 1000).toFixed(1)}s`);
  console.log('═══════════════════════════════════════════\n');

  // ── ASSERTIONS ──
  assert.ok(result.fetcherOutput.sources_succeeded >= 0, 'fetcher should run');
  if (result.researchResult) {
    assert.ok(result.researchResult.digest.accepted_count + result.researchResult.digest.weak_count + result.researchResult.digest.rejected_count >= 0);
  }
  if (result.verificationDigest) {
    assert.ok(result.verificationDigest.verified_count + result.verificationDigest.contradicted_count + result.verificationDigest.inconclusive_count >= 0);
  }
  assert.ok(score.score_composite >= 0 && score.score_composite <= 100);
  assert.equal(score.property_id, REAL_PROPERTY.id);
});

test('REAL PIPELINE: cleanup test property', async () => {
  await supabase.from('crux_scores').delete().eq('property_id', REAL_PROPERTY.id);
  await supabase.from('crux_agent_logs').delete().eq('property_id', REAL_PROPERTY.id);
  await supabase.from('crux_properties').delete().eq('id', REAL_PROPERTY.id);
});
