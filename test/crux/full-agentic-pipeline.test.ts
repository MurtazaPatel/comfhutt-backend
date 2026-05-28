import assert from 'node:assert/strict';
import { supabase } from '../../src/lib/db';
import { runUnifiedPipeline } from '../../src/modules/crux/orchestrator/orchestrator.service';
import { computeScore } from '../../src/modules/crux/agents/scoring.agent';

const PROPERTY_ID = 'f7d3b2a1-9c4e-5d8f-b123-456789abcdef';
const NOW = new Date().toISOString();

const TEST_PROPERTY = {
  id: PROPERTY_ID,
  address_raw: 'Godrej Garden City, Jagatpur, SG Highway, Ahmedabad, Gujarat 382470',
  address_normalized: 'Godrej Garden City, Jagatpur, SG Highway, Ahmedabad, Gujarat 382470',
  geocode_lat: 23.0833, geocode_lng: 72.5500,
  pin_code: '382470', city: 'Ahmedabad', state: 'Gujarat',
  property_type: 'residential_apartment' as const,
  approx_size_sqft: 1450, developer_name: 'Godrej Properties',
  created_at: NOW, updated_at: NOW,
};

async function run() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  CRUX FULL AGENTIC PIPELINE — Godrej Garden City, Ahmedabad     ║');
  console.log('║  Parallel Gemini extraction + Kimi fallback                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  await supabase.from('crux_scores').delete().eq('property_id', PROPERTY_ID);
  await supabase.from('crux_agent_logs').delete().eq('property_id', PROPERTY_ID);
  await supabase.from('crux_evidence_items').delete().eq('property_id', PROPERTY_ID);
  await supabase.from('crux_evidence_verifications').delete().eq('property_id', PROPERTY_ID);
  await supabase.from('crux_verification_runs').delete().eq('property_id', PROPERTY_ID);
  await supabase.from('crux_research_runs').delete().eq('property_id', PROPERTY_ID);
  await supabase.from('crux_research_documents').delete().eq('run_id', PROPERTY_ID);
  await supabase.from('crux_properties').delete().eq('id', PROPERTY_ID);
  await supabase.from('crux_properties').upsert(TEST_PROPERTY, { onConflict: 'id' });

  console.log('Property: Godrej Garden City, Jagatpur, Ahmedabad');
  console.log('Developer: Godrej Properties | Apartment | 1450 sqft\n');

  const t0 = Date.now();
  const result = await runUnifiedPipeline(TEST_PROPERTY);
  const elapsed = Date.now() - t0;

  console.log('┌── STAGE 1: FETCHER ────────────────────────────────────────────────┐');
  console.log(`│  Live sources: ${result.fetcherOutput.sources_succeeded}/6  |  ${(elapsed / 1000).toFixed(1)}s`);
  for (const k of ['cpcb_aqi','google_maps','nhb_residex','mca21','ecourts','cpwd']) {
    const r = (result.fetcherOutput as any)[k];
    const d = r.success ? JSON.stringify(r.data).slice(0, 120) : (r.error ?? 'failed');
    console.log(`│  ${r.success ? '✅' : '❌'} ${k}: ${d}`);
  }
  console.log('└────────────────────────────────────────────────────────────────────┘\n');

  console.log('┌── STAGE 2: RESEARCH ───────────────────────────────────────────────┐');
  if (result.researchResult) {
    const r = result.researchResult;
    console.log(`│  Status: ${r.run.status} | Queries: ${r.run.summary_counts.queries_executed} | Results: ${r.run.summary_counts.results_fetched}`);
    console.log(`│  Evidence: acc=${r.digest.accepted_count} weak=${r.digest.weak_count} rej=${r.digest.rejected_count}`);
    const all = [...r.digest.accepted_items.map((e: any) => ({...e,_s:'ACCEPTED'})), ...r.digest.weak_items.map((e: any) => ({...e,_s:'WEAK'}))];
    for (let i = 0; i < Math.min(all.length, 12); i++) {
      const ev = all[i] as any;
      console.log(`│  [${i+1}] [${ev.domain}] ${ev._s} | ${ev.authority_tier} | "${(ev.claim_text||'').slice(0,110)}"`);
    }
  } else { console.log('│  ❌ Failed'); }
  console.log('└────────────────────────────────────────────────────────────────────┘\n');

  console.log('┌── STAGE 3: VERIFICATION ───────────────────────────────────────────┐');
  if (result.verificationDigest) {
    const v = result.verificationDigest;
    console.log(`│  Verified=${v.verified_count} Contradicted=${v.contradicted_count} Inconclusive=${v.inconclusive_count} Stale=${v.stale_count}`);
    for (const vi of v.verified_items.slice(0, 4)) {
      console.log(`│  ✅ [${vi.evidence.domain}] "${vi.evidence.claim_text.slice(0, 100)}"`);
    }
  } else { console.log('│  ⛔ Skipped'); }
  console.log('└────────────────────────────────────────────────────────────────────┘\n');

  console.log('┌── STAGE 4: SCORING ────────────────────────────────────────────────┐');
  const verifiedEvidence = result.verificationDigest?.verified_items ?? [];
  const score = await computeScore(result.fetcherOutput, 'balanced', 'delivered', 'growth', verifiedEvidence.length > 0 ? verifiedEvidence : undefined);
  console.log(`│  SCORE: ${score.score_composite}/100 | CONFIDENCE: ${(score.confidence_score*100).toFixed(0)}%`);
  console.log(`│  location_intelligence: ${score.score_breakdown.location_intelligence}`);
  console.log(`│  developer_reliability: ${score.score_breakdown.developer_reliability}`);
  console.log(`│  legal_compliance:      ${score.score_breakdown.legal_compliance}`);
  console.log(`│  market_valuation:      ${score.score_breakdown.market_valuation}`);
  console.log(`│  structural_physical:   ${score.score_breakdown.structural_physical}`);
  console.log(`│  risk_composite:        ${score.score_breakdown.risk_composite}`);
  if (score.weight_adjustments?.length) {
    for (const a of score.weight_adjustments) console.log(`│  🔧 ${a.category}: ${a.delta>0?'+':''}${a.delta.toFixed(3)} | ${a.reason}`);
  }
  console.log('└────────────────────────────────────────────────────────────────────┘');
  console.log(`\n⏱  ${(elapsed/1000).toFixed(1)}s — Pipeline complete.\n`);

  await supabase.from('crux_scores').delete().eq('property_id', PROPERTY_ID);
  await supabase.from('crux_agent_logs').delete().eq('property_id', PROPERTY_ID);
  await supabase.from('crux_evidence_items').delete().eq('property_id', PROPERTY_ID);
  await supabase.from('crux_evidence_verifications').delete().eq('property_id', PROPERTY_ID);
  await supabase.from('crux_verification_runs').delete().eq('property_id', PROPERTY_ID);
  await supabase.from('crux_research_runs').delete().eq('property_id', PROPERTY_ID);
  await supabase.from('crux_properties').delete().eq('id', PROPERTY_ID);
}

run().catch(err => { console.error('FATAL:', err); process.exit(1); });
