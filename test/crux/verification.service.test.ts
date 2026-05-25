import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  EvidenceItem,
  EvidenceVerificationRow,
  PropertyProfile,
  ResearchEvidenceDigest,
  ResearchRunRow,
  VerificationRunInput,
  VerificationRunRow,
} from '../../src/modules/crux/shared/types'
import { VerificationService, type VerificationRepository } from '../../src/modules/crux/verification/verification.service'
import type { EvidenceVerifier, VerificationAssessment } from '../../src/modules/crux/verification/verification.extractor'

const property: PropertyProfile = {
  id: 'property-1',
  address_raw: '123 Test Street, Mumbai',
  address_normalized: '123 Test Street, Mumbai',
  geocode_lat: 19.076,
  geocode_lng: 72.8777,
  pin_code: '400001',
  city: 'Mumbai',
  state: 'Maharashtra',
  property_type: 'residential_apartment',
  approx_size_sqft: 1200,
  developer_name: 'Example Developer',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

function createEvidence(overrides: Partial<EvidenceItem>): EvidenceItem {
  return {
    id: 'evidence-1',
    run_id: 'research-run-1',
    property_id: property.id,
    domain: 'legal',
    source_kind: 'web',
    authority_tier: 'official',
    status: 'accepted',
    claim_text: 'Example Developer project at 123 Test Street, Mumbai has no open litigation.',
    normalized_claim: { open_cases: 0, registration_status: 'active' },
    source_title: 'Official filing',
    source_url: 'https://maharera.maharashtra.gov.in/project/123',
    source_path: null,
    excerpt: 'Example Developer project at 123 Test Street, Mumbai has no open litigation.',
    observed_at: '2026-05-01T00:00:00.000Z',
    freshness_expires_at: '2027-05-01T00:00:00.000Z',
    confidence: 0.9,
    rejection_reason: null,
    claim_hash: 'hash-1',
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

function createResearchResult(items: EvidenceItem[]): { run: ResearchRunRow; digest: ResearchEvidenceDigest; reused_cache: boolean } {
  return {
    run: {
      id: 'research-run-1',
      property_id: property.id,
      status: 'success',
      initiated_by_surface: 'api',
      provider: 'tavily',
      seed_urls: [],
      document_paths: [],
      summary_counts: {
        queries_executed: 1,
        results_fetched: items.length,
        documents_total: 0,
        documents_parsed: 0,
        documents_failed: 0,
        evidence_accepted: items.filter((item) => item.status === 'accepted').length,
        evidence_weak: items.filter((item) => item.status === 'weak').length,
        evidence_rejected: items.filter((item) => item.status === 'rejected').length,
      },
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      ttl_expires_at: new Date(Date.now() + 60_000).toISOString(),
      last_error: null,
      created_at: new Date().toISOString(),
    },
    digest: {
      run_id: 'research-run-1',
      status: 'success',
      accepted_count: items.filter((item) => item.status === 'accepted').length,
      weak_count: items.filter((item) => item.status === 'weak').length,
      rejected_count: items.filter((item) => item.status === 'rejected').length,
      accepted_items: items.filter((item) => item.status === 'accepted'),
      weak_items: items.filter((item) => item.status === 'weak'),
    },
    reused_cache: false,
  }
}

class InMemoryVerificationRepository implements VerificationRepository {
  property: PropertyProfile | null = property
  reusableRun: VerificationRunRow | null = null
  latestRun: VerificationRunRow | null = null
  verificationsByRun = new Map<string, EvidenceVerificationRow[]>()
  runs: VerificationRunRow[] = []

  async getProperty(): Promise<PropertyProfile | null> {
    return this.property
  }

  async getReusableRun(): Promise<VerificationRunRow | null> {
    return this.reusableRun
  }

  async getLatestRun(): Promise<VerificationRunRow | null> {
    return this.latestRun
  }

  async getVerificationsByRun(runId: string): Promise<EvidenceVerificationRow[]> {
    return this.verificationsByRun.get(runId) ?? []
  }

  async createRun(input: VerificationRunInput, researchRunId: string, ttlExpiresAt: string): Promise<VerificationRunRow> {
    const run: VerificationRunRow = {
      id: `verification-run-${this.runs.length + 1}`,
      property_id: input.property_id,
      research_run_id: researchRunId,
      status: 'running',
      initiated_by_surface: input.surface ?? 'api',
      summary_counts: {
        evidence_items_considered: 0,
        verified_count: 0,
        contradicted_count: 0,
        inconclusive_count: 0,
        stale_count: 0,
      },
      started_at: new Date().toISOString(),
      completed_at: null,
      ttl_expires_at: ttlExpiresAt,
      last_error: null,
      created_at: new Date().toISOString(),
    }
    this.runs.push(run)
    this.latestRun = run
    return run
  }

  async saveVerifications(items: Array<Omit<EvidenceVerificationRow, 'id' | 'created_at'>>): Promise<EvidenceVerificationRow[]> {
    const runId = items[0]?.run_id ?? (this.latestRun?.id ?? 'verification-run-0')
    const saved = items.map((item, index) => ({
      id: `verification-${index + 1}`,
      created_at: new Date().toISOString(),
      ...item,
    })) as EvidenceVerificationRow[]
    this.verificationsByRun.set(runId, saved)
    return saved
  }

  async completeRun(params: {
    runId: string
    status: VerificationRunRow['status']
    summary: VerificationRunRow['summary_counts']
    completedAt: string
    ttlExpiresAt: string
    lastError: string | null
  }): Promise<VerificationRunRow> {
    const run = this.runs.find((entry) => entry.id === params.runId)
    if (!run) throw new Error('run not found')
    run.status = params.status
    run.summary_counts = params.summary
    run.completed_at = params.completedAt
    run.ttl_expires_at = params.ttlExpiresAt
    run.last_error = params.lastError
    this.latestRun = run
    return run
  }

  async logRun(): Promise<void> {
    return
  }
}

class FakeVerifier implements EvidenceVerifier {
  constructor(
    private readonly resolver: (evidence: EvidenceItem) => VerificationAssessment | Promise<VerificationAssessment>,
  ) {}

  async verifyEvidence(params: { evidence: EvidenceItem }): Promise<VerificationAssessment> {
    return this.resolver(params.evidence)
  }
}

test('verification service reuses cached runs when available', async () => {
  const repository = new InMemoryVerificationRepository()
  repository.reusableRun = {
    id: 'cached-verification',
    property_id: property.id,
    research_run_id: 'research-run-1',
    status: 'success',
    initiated_by_surface: 'api',
    summary_counts: {
      evidence_items_considered: 1,
      verified_count: 1,
      contradicted_count: 0,
      inconclusive_count: 0,
      stale_count: 0,
    },
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    ttl_expires_at: new Date(Date.now() + 60_000).toISOString(),
    last_error: null,
    created_at: new Date().toISOString(),
  }
  repository.verificationsByRun.set('cached-verification', [{
    id: 'verification-1',
    run_id: 'cached-verification',
    property_id: property.id,
    research_run_id: 'research-run-1',
    evidence_item_id: 'evidence-1',
    verification_status: 'verified',
    verifier_confidence: 0.9,
    direct_match: true,
    freshness_ok: true,
    support_score: 0.9,
    contradiction_score: 0.1,
    supporting_evidence_ids: [],
    contradicting_evidence_ids: [],
    verification_notes: null,
    created_at: new Date().toISOString(),
  }])

  const service = new VerificationService(
    repository,
    new FakeVerifier(() => ({
      verification_status: 'verified',
      verifier_confidence: 0.9,
      support_score: 0.9,
      contradiction_score: 0.1,
      supporting_evidence_ids: [],
      contradicting_evidence_ids: [],
      verification_notes: null,
    })),
    async () => createResearchResult([createEvidence({})]),
    () => new Date('2026-05-25T00:00:00.000Z'),
  )

  const result = await service.runVerification({ property_id: property.id })
  assert.equal(result.reused_cache, true)
  assert.equal(result.run.id, 'cached-verification')
})

test('verification service marks contradictory evidence as contradicted', async () => {
  const repository = new InMemoryVerificationRepository()
  const service = new VerificationService(
    repository,
    new FakeVerifier((evidence) => ({
      verification_status: evidence.id === 'evidence-1' ? 'contradicted' : 'verified',
      verifier_confidence: 0.86,
      support_score: 0.3,
      contradiction_score: 0.8,
      supporting_evidence_ids: [],
      contradicting_evidence_ids: evidence.id === 'evidence-1' ? ['evidence-2'] : [],
      verification_notes: 'Contradictory peer evidence found.',
    })),
    async () => createResearchResult([
      createEvidence({ id: 'evidence-1', normalized_claim: { open_cases: 0 } }),
      createEvidence({ id: 'evidence-2', claim_text: 'Court record lists 3 open cases.', normalized_claim: { open_cases: 3 } }),
    ]),
    () => new Date('2026-05-25T00:00:00.000Z'),
  )

  const result = await service.runVerification({ property_id: property.id, force_refresh: true })
  assert.equal(result.digest.contradicted_count >= 1, true)
})

test('verification service falls back to partial_failed when verifier throws', async () => {
  const repository = new InMemoryVerificationRepository()
  const service = new VerificationService(
    repository,
    new FakeVerifier(() => {
      throw new Error('Verifier unavailable')
    }),
    async () => createResearchResult([createEvidence({})]),
    () => new Date('2026-05-25T00:00:00.000Z'),
  )

  const result = await service.runVerification({ property_id: property.id, force_refresh: true })
  assert.equal(result.run.status, 'partial_failed')
  assert.equal(result.digest.verified_count + result.digest.inconclusive_count + result.digest.stale_count + result.digest.contradicted_count, 1)
})

test('verification service marks stale evidence as stale', async () => {
  const repository = new InMemoryVerificationRepository()
  const service = new VerificationService(
    repository,
    new FakeVerifier(() => ({
      verification_status: 'verified',
      verifier_confidence: 0.9,
      support_score: 0.9,
      contradiction_score: 0.1,
      supporting_evidence_ids: [],
      contradicting_evidence_ids: [],
      verification_notes: null,
    })),
    async () => createResearchResult([
      createEvidence({
        freshness_expires_at: '2025-01-01T00:00:00.000Z',
      }),
    ]),
    () => new Date('2026-05-25T00:00:00.000Z'),
  )

  const result = await service.runVerification({ property_id: property.id, force_refresh: true })
  assert.equal(result.digest.stale_count, 1)
})
