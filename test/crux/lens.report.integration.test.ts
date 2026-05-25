import assert from 'node:assert/strict'
import test from 'node:test'
import { createLensToolExecutor } from '../../src/modules/crux/agents/lens.agent'
import { buildReportRow } from '../../src/modules/crux/agents/report.agent'

test('Lens triggerResearch emits a research module result', async () => {
  const executeTool = createLensToolExecutor({
    runResearchFn: async () => ({
      run: {
        id: 'run-1',
        property_id: 'property-1',
        status: 'success',
        initiated_by_surface: 'lens',
        provider: 'tavily',
        seed_urls: [],
        document_paths: [],
        summary_counts: {
          queries_executed: 1,
          results_fetched: 1,
          documents_total: 0,
          documents_parsed: 0,
          documents_failed: 0,
          evidence_accepted: 1,
          evidence_weak: 0,
          evidence_rejected: 0,
        },
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        ttl_expires_at: new Date().toISOString(),
        last_error: null,
        created_at: new Date().toISOString(),
      },
      digest: {
        run_id: 'run-1',
        status: 'success',
        accepted_count: 1,
        weak_count: 0,
        rejected_count: 0,
        accepted_items: [],
        weak_items: [],
      },
      reused_cache: false,
    }),
  })

  const result = await executeTool('triggerResearch', { force_refresh: true }, 'property-1')
  assert.equal(result.moduleType, 'research')
})

test('Lens triggerVerification emits a verification module result', async () => {
  const executeTool = createLensToolExecutor({
    runVerificationFn: async () => ({
      run: {
        id: 'verification-run-1',
        property_id: 'property-1',
        research_run_id: 'run-1',
        status: 'success',
        initiated_by_surface: 'lens',
        summary_counts: {
          evidence_items_considered: 1,
          verified_count: 1,
          contradicted_count: 0,
          inconclusive_count: 0,
          stale_count: 0,
        },
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        ttl_expires_at: new Date().toISOString(),
        last_error: null,
        created_at: new Date().toISOString(),
      },
      digest: {
        run_id: 'verification-run-1',
        research_run_id: 'run-1',
        status: 'success',
        verified_count: 1,
        contradicted_count: 0,
        inconclusive_count: 0,
        stale_count: 0,
        verified_items: [],
        contradicted_items: [],
        inconclusive_items: [],
        stale_items: [],
      },
      reused_cache: false,
    }),
  })

  const result = await executeTool('triggerVerification', { force_refresh: true }, 'property-1')
  assert.equal(result.moduleType, 'verification')
})

test('buildReportRow prefers verification highlights and citations when verification exists', () => {
  const report = buildReportRow({
    propertyId: 'property-1',
    scoreId: 'score-1',
    intent: 'balanced',
    parsed: {
      summary: 'Property summary',
      category_narratives: {
        legal_title: 'Legal narrative',
        location_quality: 'Location narrative',
        developer_reliability: 'Developer narrative',
        market_valuation: 'Market narrative',
        demand_signals: 'Demand narrative',
      },
      risk_flags: ['Risk one', 'Risk two', 'Risk three'],
      positive_signals: ['Positive one', 'Positive two', 'Positive three'],
      research_highlights: ['Research highlight one'],
    },
    research: {
      run: {
        id: 'run-1',
        property_id: 'property-1',
        status: 'success',
        initiated_by_surface: 'report',
        provider: 'tavily',
        seed_urls: [],
        document_paths: [],
        summary_counts: {
          queries_executed: 1,
          results_fetched: 1,
          documents_total: 0,
          documents_parsed: 0,
          documents_failed: 0,
          evidence_accepted: 1,
          evidence_weak: 0,
          evidence_rejected: 0,
        },
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        ttl_expires_at: new Date().toISOString(),
        last_error: null,
        created_at: new Date().toISOString(),
      },
      digest: {
        run_id: 'run-1',
        status: 'success',
        accepted_count: 1,
        weak_count: 0,
        rejected_count: 0,
        accepted_items: [{
          id: 'e-1',
          run_id: 'run-1',
          property_id: 'property-1',
          domain: 'legal',
          source_kind: 'web',
          authority_tier: 'official',
          status: 'accepted',
          claim_text: 'The official filing shows an active registration.',
          normalized_claim: { registration_status: 'active' },
          source_title: 'Official filing',
          source_url: 'https://maharera.maharashtra.gov.in/project/123',
          source_path: null,
          excerpt: 'The official filing shows an active registration.',
          observed_at: '2026-05-01T00:00:00.000Z',
          freshness_expires_at: '2027-05-01T00:00:00.000Z',
          confidence: 0.9,
          rejection_reason: null,
          claim_hash: 'hash-1',
          created_at: new Date().toISOString(),
        }],
        weak_items: [],
      },
      reused_cache: false,
    },
    verification: {
      run: {
        id: 'verification-run-1',
        property_id: 'property-1',
        research_run_id: 'run-1',
        status: 'success',
        initiated_by_surface: 'report',
        summary_counts: {
          evidence_items_considered: 1,
          verified_count: 1,
          contradicted_count: 0,
          inconclusive_count: 0,
          stale_count: 0,
        },
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        ttl_expires_at: new Date().toISOString(),
        last_error: null,
        created_at: new Date().toISOString(),
      },
      digest: {
        run_id: 'verification-run-1',
        research_run_id: 'run-1',
        status: 'success',
        verified_count: 1,
        contradicted_count: 0,
        inconclusive_count: 0,
        stale_count: 0,
        verified_items: [{
          evidence: {
            id: 'e-1',
            run_id: 'run-1',
            property_id: 'property-1',
            domain: 'legal',
            source_kind: 'web',
            authority_tier: 'official',
            status: 'accepted',
            claim_text: 'The official filing shows an active registration.',
            normalized_claim: { registration_status: 'active' },
            source_title: 'Official filing',
            source_url: 'https://maharera.maharashtra.gov.in/project/123',
            source_path: null,
            excerpt: 'The official filing shows an active registration.',
            observed_at: '2026-05-01T00:00:00.000Z',
            freshness_expires_at: '2027-05-01T00:00:00.000Z',
            confidence: 0.9,
            rejection_reason: null,
            claim_hash: 'hash-1',
            created_at: new Date().toISOString(),
          },
          verification: {
            id: 'verification-1',
            run_id: 'verification-run-1',
            property_id: 'property-1',
            research_run_id: 'run-1',
            evidence_item_id: 'e-1',
            verification_status: 'verified',
            verifier_confidence: 0.93,
            direct_match: true,
            freshness_ok: true,
            support_score: 0.88,
            contradiction_score: 0.04,
            supporting_evidence_ids: [],
            contradicting_evidence_ids: [],
            verification_notes: null,
            created_at: new Date().toISOString(),
          },
        }],
        contradicted_items: [],
        inconclusive_items: [],
        stale_items: [],
      },
      reused_cache: false,
    },
    cruxVersion: '0.1.0',
  })

  assert.deepEqual(report.research_highlights, ['Research highlight one'])
  assert.equal(report.citations.length, 1)
  assert.equal(report.citations[0]?.authority_tier, 'official')
})
