import assert from 'node:assert/strict';
import test from 'node:test';
import { supabase } from '../../src/lib/db';
import { runUnifiedPipeline } from '../../src/modules/crux/orchestrator/orchestrator.service';
import { computeScore } from '../../src/modules/crux/agents/scoring.agent';
import { env } from '../../src/config/env';

const PROPERTY_ID = 'ac86df83-6931-416d-83d0-da578f61e3e0';

test('FULL PIPELINE: Koregaon Park, Pune — Fetcher → Research → Verification → Scoring', async () => {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  CRUX UNIFIED EVIDENCE PIPELINE — LIVE TEST                ║');
  console.log('║  Property: Koregaon Park, Pune, Maharashtra 411001         ║');
  console.log('║  FIRECRAWL_URL:', (env.FIRECRAWL_URL ? 'configured' : '❌ NOT CONFIGURED — Research will fail'));
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const { data: row, error } = await supabase
    .from('crux_properties')
    .select('*')
    .eq('id', PROPERTY_ID)
    .maybeSingle();

  if (error || !row) {
    console.log('❌ Property not found in DB:', error?.message);
    assert.fail('Property must exist in DB');
  }

  const property = row as unknown as {
    id: string; address_raw: string; address_normalized: string | null;
    geocode_lat: number; geocode_lng: number; pin_code: string | null;
    city: string | null; state: string | null; property_type: string | null;
    approx_size_sqft: number | null;
  };

  console.log('✅ Property loaded:', property.address_normalized ?? property.address_raw);
  console.log('   Lat:', property.geocode_lat, 'Lng:', property.geocode_lng);
  console.log('   City:', property.city, 'State:', property.state);

  const t0 = Date.now();
  const result = await runUnifiedPipeline(property);
  const elapsed = Date.now() - t0;

  // ─══════════════════════════════════════════════════
  // STAGE 1: FETCHER AGENT (6 external APIs)
  // ─══════════════════════════════════════════════════
  console.log('\n┌── STAGE 1: FETCHER AGENT (6 external APIs) ──────────────┐');
  console.log(`│  Success: ${result.fetcherOutput.sources_succeeded}/6 in ${elapsed}ms`);
  console.log('├───────────────────────────────────────────────────────────┤');

  const fetcherSources = [
    { label: 'CPCB AQI       ', key: 'cpcb_aqi' },
    { label: 'Google Maps    ', key: 'google_maps' },
    { label: 'NHB RESIDEX    ', key: 'nhb_residex' },
    { label: 'MCA21 (Company)', key: 'mca21' },
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
    console.log(`│  ${icon} ${s.label}: ${detail.slice(0, 80)}${detail.length > 80 ? '...' : ''}`);
  }
  console.log('└───────────────────────────────────────────────────────────┘');

  // ─══════════════════════════════════════════════════
  // STAGE 2: RESEARCH AGENT (Firecrawl web search)
  // ─══════════════════════════════════════════════════
  console.log('\n┌── STAGE 2: RESEARCH AGENT (Tavily web search) ──────────┐');
  if (result.researchResult) {
    const r = result.researchResult;
    console.log(`│  Run ID:  ${r.run.id}`);
    console.log(`│  Status:  ${r.run.status}`);
    console.log(`│  Reused:  ${r.reused_cache}`);
    console.log(`│  Summary: queries=${r.run.summary_counts.queries_executed}, results=${r.run.summary_counts.results_fetched}`);
    console.log(`│  Evidence: accepted=${r.digest.accepted_count}, weak=${r.digest.weak_count}, rejected=${r.digest.rejected_count}`);
    console.log('├───────────────────────────────────────────────────────────┤');

    const allEvidence = [...r.digest.accepted_items, ...r.digest.weak_items];
    if (allEvidence.length === 0) {
      console.log('│  ⚠️  No evidence items found — web search returned no usable claims');
    }
    for (let i = 0; i < Math.min(allEvidence.length, 8); i++) {
      const ev = allEvidence[i]!;
      console.log(`│  [${i+1}] [${ev.domain}] ${ev.status.toUpperCase()}`);
      console.log(`│      "${ev.claim_text.slice(0, 100)}${ev.claim_text.length > 100 ? '...' : ''}"`);
      console.log(`│      source: ${ev.source_title} | authority: ${ev.authority_tier} | conf: ${ev.confidence}`);
    }
    if (allEvidence.length > 8) {
      console.log(`│  ... and ${allEvidence.length - 8} more items`);
    }
  } else {
    console.log('│  ❌ Research FAILED');
    console.log('│  Reason: FIRECRAWL_URL is not configured or Firecrawl unreachable');
    console.log('│  Impact: No web evidence → no verification → no LLM adjustments');
  }
  console.log('└───────────────────────────────────────────────────────────┘');

  // ─══════════════════════════════════════════════════
  // STAGE 3: VERIFICATION AGENT
  // ─══════════════════════════════════════════════════
  console.log('\n┌── STAGE 3: VERIFICATION AGENT (evidence cross-check) ───┐');
  if (result.verificationDigest) {
    const v = result.verificationDigest;
    console.log(`│  Run ID:   ${v.run_id}`);
    console.log(`│  Status:   ${v.status}`);
    console.log(`│  Verified: ${v.verified_count} | Contradicted: ${v.contradicted_count} | Inconclusive: ${v.inconclusive_count} | Stale: ${v.stale_count}`);
    console.log('├───────────────────────────────────────────────────────────┤');

    for (const vi of v.verified_items.slice(0, 5)) {
      console.log(`│  ✅ VERIFIED: [${vi.evidence.domain}] ${vi.evidence.claim_text.slice(0, 80)}...`);
      console.log(`│     verifier_confidence: ${vi.verification.verifier_confidence.toFixed(2)} | direct_match: ${vi.verification.direct_match}`);
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
  console.log('└───────────────────────────────────────────────────────────┘');

  // ─══════════════════════════════════════════════════
  // STAGE 4: SCORING AGENT (deterministic + LLM adjustment)
  // ─══════════════════════════════════════════════════
  console.log('\n┌── STAGE 4: SCORING AGENT ───────────────────────────────┐');
  const verifiedEvidence = result.verificationDigest?.verified_items ?? [];
  const score = await computeScore(
    result.fetcherOutput,
    'balanced',
    'delivered',
    'growth',
    verifiedEvidence.length > 0 ? verifiedEvidence : undefined,
  );

  console.log(`│  Composite: ${score.score_composite}/100`);
  console.log(`│  Confidence: ${(score.confidence_score * 100).toFixed(0)}%`);
  console.log(`│  Degraded: ${score.degraded}`);
  console.log(`│  Verified Evidence Used: ${score.verified_evidence_used}`);
  console.log(`│  Data Sources: [${score.data_sources_used.join(', ')}]`);
  console.log('├───────────────────────────────────────────────────────────┤');
  console.log(`│  location_intelligence: ${score.score_breakdown.location_intelligence}`);
  console.log(`│  developer_reliability: ${score.score_breakdown.developer_reliability}`);
  console.log(`│  legal_compliance:      ${score.score_breakdown.legal_compliance}`);
  console.log(`│  market_valuation:      ${score.score_breakdown.market_valuation}`);
  console.log(`│  structural_physical:   ${score.score_breakdown.structural_physical}`);
  console.log(`│  risk_composite:        ${score.score_breakdown.risk_composite}`);
  console.log('├───────────────────────────────────────────────────────────┤');

  if (score.weight_adjustments?.length) {
    console.log('│  🔧 LLM WEIGHT ADJUSTMENTS (evidence-backed):');
    for (const a of score.weight_adjustments) {
      console.log(`│    ${a.category}: ${a.delta > 0 ? '+' : ''}${a.delta.toFixed(3)} | reason: ${a.reason}`);
      console.log(`│      evidence_ids: [${a.evidence_ids.join(', ')}]`);
    }
  } else if (verifiedEvidence.length > 0) {
    console.log('│  🔧 LLM WEIGHT ADJUSTMENTS: LLM call failed (fell back to deterministic weights)');
  } else {
    console.log('│  🔧 LLM WEIGHT ADJUSTMENTS: N/A — no verified evidence available');
  }
  console.log('└───────────────────────────────────────────────────────────┘');

  console.log(`\n⏱ Total pipeline wall time: ${(elapsed / 1000).toFixed(1)}s\n`);

  assert.ok(result.fetcherOutput.sources_succeeded >= 0);
  assert.ok(score.score_composite >= 0 && score.score_composite <= 100);
});
