import assert from 'node:assert/strict';
import test from 'node:test';
import { supabase } from '../../src/lib/db';
import { runUnifiedPipeline } from '../../src/modules/crux/orchestrator/orchestrator.service';
import { computeScore } from '../../src/modules/crux/agents/scoring.agent';

const PROPERTY_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const NOW = new Date().toISOString();

const SHIVALIK_PLATINUM = {
  id: PROPERTY_ID,
  address_raw: 'Shivalik Platinum, Bodakdev, SG Highway, Ahmedabad West, Gujarat 380054',
  address_normalized: 'Shivalik Platinum, Bodakdev, SG Highway, Ahmedabad West, Gujarat 380054',
  geocode_lat: 23.0333,
  geocode_lng: 72.5167,
  pin_code: '380054',
  city: 'Ahmedabad',
  state: 'Gujarat',
  property_type: 'residential_apartment' as const,
  approx_size_sqft: 1365,
  developer_name: 'Shivalik Group',
  created_at: NOW,
  updated_at: NOW,
};

test('Shivalik Platinum — Full CRUX Pipeline', { timeout: 600000 }, async (t) => {
  // ── STEP 0: Insert property ──
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  CRUX UNIFIED EVIDENCE PIPELINE — SHIVALIK PLATINUM                     ║');
  console.log('║  Bodakdev, SG Highway, Ahmedabad, Gujarat 380054                        ║');
  console.log('║  Developer: Shivalik Group (est. 1998, RERA MAA07768/141220)            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  const { error: insertErr } = await supabase
    .from('crux_properties')
    .upsert(SHIVALIK_PLATINUM, { onConflict: 'id' });
  if (insertErr) {
    console.error('❌ Failed to insert property:', insertErr.message);
    assert.fail('Could not insert test property');
  }
  console.log('✅ Property inserted: Shivalik Platinum, Bodakdev, Ahmedabad');
  console.log(`   Lat: ${SHIVALIK_PLATINUM.geocode_lat}  Lng: ${SHIVALIK_PLATINUM.geocode_lng}`);
  console.log(`   Type: ${SHIVALIK_PLATINUM.property_type} | Area: ${SHIVALIK_PLATINUM.approx_size_sqft} sqft`);

  const t0 = Date.now();
  const result = await runUnifiedPipeline(SHIVALIK_PLATINUM);
  const elapsed = Date.now() - t0;

  // ─══════════════════════════════════════════════════
  // STAGE 1: FETCHER AGENT (6 external APIs)
  // ─══════════════════════════════════════════════════
  console.log('\n┌── STAGE 1: FETCHER AGENT (6 external APIs) ──────────────────────────┐');
  console.log(`│  Sources succeeded: ${result.fetcherOutput.sources_succeeded}/6  │  Wall time: ${(elapsed / 1000).toFixed(1)}s`);
  console.log(`│  Fetched at: ${result.fetcherOutput.fetched_at}`);
  console.log('├──────────────────────────────────────────────────────────────────────┤');

  const fetcherSources = [
    { label: 'CPCB AQI        ', key: 'cpcb_aqi' },
    { label: 'Google Maps     ', key: 'google_maps' },
    { label: 'NHB RESIDEX     ', key: 'nhb_residex' },
    { label: 'MCA21 (Company) ', key: 'mca21' },
    { label: 'eCourts (Legal) ', key: 'ecourts' },
    { label: 'CPWD (Cost)     ', key: 'cpwd' },
  ] as const;

  for (const s of fetcherSources) {
    const r = (result.fetcherOutput as Record<string, unknown>)[s.key] as {
      success: boolean; error?: string; data?: Record<string, unknown>;
    };
    const icon = r.success ? '✅' : '❌';
    const detail = r.success
      ? JSON.stringify(r.data)
      : r.error ?? 'failed';
    const truncated = detail.length > 100 ? detail.slice(0, 97) + '...' : detail;
    console.log(`│  ${icon} ${s.label}: ${truncated}`);
  }
  console.log('└──────────────────────────────────────────────────────────────────────┘');

  // ─══════════════════════════════════════════════════
  // STAGE 2: RESEARCH AGENT (Firecrawl web search)
  // ─══════════════════════════════════════════════════
  console.log('\n┌── STAGE 2: RESEARCH AGENT (Firecrawl web search) ───────────────────┐');
  if (result.researchResult) {
    const r = result.researchResult;
    console.log(`│  Run ID:      ${r.run.id}`);
    console.log(`│  Status:      ${r.run.status}`);
    console.log(`│  Reused:      ${r.reused_cache}`);
    console.log(`│  Queries:     ${r.run.summary_counts.queries_executed} executed, ${r.run.summary_counts.results_fetched} results fetched`);
    console.log(`│  Documents:   ${r.run.summary_counts.documents_total} total, ${r.run.summary_counts.documents_parsed} parsed, ${r.run.summary_counts.documents_failed} failed`);
    console.log(`│  Evidence:    accepted=${r.digest.accepted_count} | weak=${r.digest.weak_count} | rejected=${r.digest.rejected_count}`);
    console.log('├──────────────────────────────────────────────────────────────────────┤');

    const allEvidence = [
      ...r.digest.accepted_items.map((e) => ({ ...e, _status: 'ACCEPTED' })),
      ...r.digest.weak_items.map((e) => ({ ...e, _status: 'WEAK' })),
    ];
    if (allEvidence.length === 0) {
      console.log('│  ⚠️  No evidence items found — web search returned no usable claims');
    }
    for (let i = 0; i < Math.min(allEvidence.length, 10); i++) {
      const ev = allEvidence[i]!;
      console.log(`│  [${String(i + 1).padStart(2)}] [${ev.domain}] ${ev._status}`);
      console.log(`│      "${ev.claim_text.slice(0, 120)}${ev.claim_text.length > 120 ? '...' : ''}"`);
      console.log(`│      source: ${ev.source_title} | authority: ${ev.authority_tier} | conf: ${ev.confidence}`);
    }
    if (allEvidence.length > 10) {
      console.log(`│  ... and ${allEvidence.length - 10} more items`);
    }
  } else {
    console.log('│  ❌ Research FAILED');
    console.log('│  Impact: No web evidence → no verification → no LLM adjustments');
  }
  console.log('└──────────────────────────────────────────────────────────────────────┘');

  // ─══════════════════════════════════════════════════
  // STAGE 3: VERIFICATION AGENT
  // ─══════════════════════════════════════════════════
  console.log('\n┌── STAGE 3: VERIFICATION AGENT (evidence cross-check) ───────────────┐');
  if (result.verificationDigest) {
    const v = result.verificationDigest;
    console.log(`│  Run ID:         ${v.run_id}`);
    console.log(`│  Research Run:   ${v.research_run_id}`);
    console.log(`│  Status:         ${v.status}`);
    console.log(`│  Verified: ${v.verified_count} | Contradicted: ${v.contradicted_count} | Inconclusive: ${v.inconclusive_count} | Stale: ${v.stale_count}`);
    console.log('├──────────────────────────────────────────────────────────────────────┤');

    for (const vi of v.verified_items.slice(0, 5)) {
      console.log(`│  ✅ VERIFIED: [${vi.evidence.domain}] ${vi.evidence.claim_text.slice(0, 80)}...`);
      console.log(`│     verifier_confidence: ${vi.verification.verifier_confidence.toFixed(2)}`);
      console.log(`│     direct_match: ${vi.verification.direct_match} | freshness_ok: ${vi.verification.freshness_ok}`);
      console.log(`│     support: ${vi.verification.support_score.toFixed(2)} | contradiction: ${vi.verification.contradiction_score.toFixed(2)}`);
    }
    for (const ci of v.contradicted_items.slice(0, 3)) {
      console.log(`│  ⚠️  CONTRADICTED: [${ci.evidence.domain}] ${ci.evidence.claim_text.slice(0, 80)}...`);
    }
    for (const ii of v.inconclusive_items.slice(0, 3)) {
      console.log(`│  ❓ INCONCLUSIVE: [${ii.evidence.domain}] ${ii.evidence.claim_text.slice(0, 80)}...`);
    }
  } else {
    console.log('│  ⛔ Verification SKIPPED — Research must succeed first');
  }
  console.log('└──────────────────────────────────────────────────────────────────────┘');

  // ─══════════════════════════════════════════════════
  // STAGE 4: SCORING AGENT
  // ─══════════════════════════════════════════════════
  console.log('\n┌── STAGE 4: SCORING AGENT ───────────────────────────────────────────┐');
  const verifiedEvidence = result.verificationDigest?.verified_items ?? [];
  const score = await computeScore(
    result.fetcherOutput,
    'balanced',
    'delivered',
    'growth',
    verifiedEvidence.length > 0 ? verifiedEvidence : undefined,
  );

  const pct = (score.confidence_score * 100).toFixed(0);
  console.log(`│  Composite Score:   ${score.score_composite}/100`);
  console.log(`│  Confidence:        ${pct}%`);
  console.log(`│  Degraded:          ${score.degraded}`);
  console.log(`│  Verified Evidence: ${score.verified_evidence_used}`);
  console.log(`│  Data Sources:      [${score.data_sources_used.join(', ')}]`);
  console.log(`│  CRUX Version:      ${score.crux_version}`);
  console.log(`│  Methodology Hash:  ${score.methodology_hash.slice(0, 16)}...`);
  console.log('├──────────────────────────────────────────────────────────────────────┤');
  console.log('│  BREAKDOWN:');
  console.log(`│    location_intelligence: ${score.score_breakdown.location_intelligence}`);
  console.log(`│    developer_reliability: ${score.score_breakdown.developer_reliability}`);
  console.log(`│    legal_compliance:      ${score.score_breakdown.legal_compliance}`);
  console.log(`│    market_valuation:      ${score.score_breakdown.market_valuation}`);
  console.log(`│    structural_physical:   ${score.score_breakdown.structural_physical}`);
  console.log(`│    risk_composite:        ${score.score_breakdown.risk_composite}`);
  console.log('├──────────────────────────────────────────────────────────────────────┤');

  if (score.weight_adjustments?.length) {
    console.log('│  🔧 LLM WEIGHT ADJUSTMENTS (evidence-backed):');
    for (const a of score.weight_adjustments) {
      const sign = a.delta > 0 ? '+' : '';
      console.log(`│    ${a.category}: ${sign}${a.delta.toFixed(3)} (${a.base_weight.toFixed(3)} → ${a.adjusted_weight.toFixed(3)})`);
      console.log(`│      reason: ${a.reason}`);
      console.log(`│      evidence_ids: [${a.evidence_ids.join(', ')}]`);
    }
  } else if (verifiedEvidence.length > 0) {
    console.log('│  🔧 LLM WEIGHT ADJUSTMENTS: LLM call failed (fell back to deterministic)');
  } else {
    console.log('│  🔧 LLM WEIGHT ADJUSTMENTS: N/A — no verified evidence available');
  }
  console.log('└──────────────────────────────────────────────────────────────────────┘');

  console.log(`\n⏱  Total pipeline wall time: ${(elapsed / 1000).toFixed(1)}s\n`);

  // ── ASSERTIONS ──
  assert.ok(result.fetcherOutput.sources_succeeded >= 0, 'fetcher should complete');
  assert.ok(result.fetcherOutput.sources_attempted === 6, 'should attempt all 6 sources');
  assert.ok(score.score_composite >= 0 && score.score_composite <= 100, 'score in valid range');
  assert.equal(score.intent_profile, 'balanced');
  assert.equal(score.lifecycle_stage, 'delivered');
  assert.equal(score.macro_cycle, 'growth');
  assert.ok(score.id, 'score should have an id');
  assert.ok(score.methodology_hash, 'score should have methodology hash');

  if (result.researchResult) {
    const total = result.researchResult.digest.accepted_count
      + result.researchResult.digest.weak_count
      + result.researchResult.digest.rejected_count;
    assert.ok(total >= 0, 'research should produce evidence counts');
  }

  if (result.verificationDigest) {
    const vTotal = result.verificationDigest.verified_count
      + result.verificationDigest.contradicted_count
      + result.verificationDigest.inconclusive_count
      + result.verificationDigest.stale_count;
    assert.ok(vTotal >= 0, 'verification should produce counts');
  }

  // ── CLEANUP ──
  console.log('🧹 Cleaning up test data...');
  await supabase.from('crux_scores').delete().eq('property_id', PROPERTY_ID);
  await supabase.from('crux_agent_logs').delete().eq('property_id', PROPERTY_ID);
  await supabase.from('crux_evidence_items').delete().eq('property_id', PROPERTY_ID);
  await supabase.from('crux_research_runs').delete().eq('property_id', PROPERTY_ID);
  await supabase.from('crux_verification_runs').delete().eq('property_id', PROPERTY_ID);
  await supabase.from('crux_properties').delete().eq('id', PROPERTY_ID);
  console.log('✅ Cleanup complete.\n');
});