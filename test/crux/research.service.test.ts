import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  EvidenceItem,
  ExtractedEvidenceDraft,
  PropertyProfile,
  ResearchRunInput,
  ResearchRunRow,
} from '../../src/modules/crux/shared/types'
import { ResearchService, type ResearchRepository } from '../../src/modules/crux/research/research.service'
import type { ResearchWebProvider } from '../../src/modules/crux/research/research.web'
import type { ResearchExtractor } from '../../src/modules/crux/research/research.extractor'

const baseProperty: PropertyProfile = {
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

class InMemoryResearchRepository implements ResearchRepository {
  property: PropertyProfile | null = baseProperty
  reusableRun: ResearchRunRow | null = null
  latestRun: ResearchRunRow | null = null
  evidenceByRun = new Map<string, EvidenceItem[]>()
  savedRuns: ResearchRunRow[] = []

  async getProperty(): Promise<PropertyProfile | null> {
    return this.property
  }

  async getReusableRun(): Promise<ResearchRunRow | null> {
    return this.reusableRun
  }

  async getRunById(runId: string): Promise<ResearchRunRow | null> {
    return this.savedRuns.find((run) => run.id === runId) ?? null
  }

  async getLatestRun(): Promise<ResearchRunRow | null> {
    return this.latestRun
  }

  async getEvidenceByRun(runId: string): Promise<EvidenceItem[]> {
    return this.evidenceByRun.get(runId) ?? []
  }

  async createRun(input: ResearchRunInput, ttlExpiresAt: string): Promise<ResearchRunRow> {
    const run: ResearchRunRow = {
      id: `run-${this.savedRuns.length + 1}`,
      property_id: input.property_id,
      status: 'running',
      initiated_by_surface: input.surface ?? 'api',
      provider: 'tavily',
      seed_urls: input.seed_urls ?? [],
      document_paths: input.document_paths ?? [],
      summary_counts: {
        queries_executed: 0,
        results_fetched: 0,
        documents_total: 0,
        documents_parsed: 0,
        documents_failed: 0,
        evidence_accepted: 0,
        evidence_weak: 0,
        evidence_rejected: 0,
      },
      started_at: new Date().toISOString(),
      completed_at: null,
      ttl_expires_at: ttlExpiresAt,
      last_error: null,
      created_at: new Date().toISOString(),
    }
    this.savedRuns.push(run)
    this.latestRun = run
    return run
  }

  async saveDocuments() {
    return []
  }

  async saveEvidence(items: Array<Omit<EvidenceItem, 'id' | 'created_at'>>): Promise<EvidenceItem[]> {
    const runId = items[0]?.run_id ?? (this.latestRun?.id ?? 'run-0')
    const saved = items.map((item, index) => ({
      id: `evidence-${index + 1}`,
      created_at: new Date().toISOString(),
      ...item,
    })) as EvidenceItem[]
    this.evidenceByRun.set(runId, saved)
    return saved
  }

  async completeRun(params: {
    runId: string
    status: ResearchRunRow['status']
    summary: ResearchRunRow['summary_counts']
    completedAt: string
    ttlExpiresAt: string
    lastError: string | null
  }): Promise<ResearchRunRow> {
    const run = this.savedRuns.find((entry) => entry.id === params.runId)
    if (!run) {
      throw new Error('run not found')
    }
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

class FakeWebProvider implements ResearchWebProvider {
  searches = 0

  constructor(
    private readonly rawContent: string = 'The project has a valid RERA filing and the locality added a metro link.',
  ) {}

  async search(): Promise<Array<{ title: string; url: string; snippet: string; raw_content: string | null; score: number | null; published_at: string | null }>> {
    this.searches += 1
    return [{
      title: 'Official project filing',
      url: 'https://maharera.maharashtra.gov.in/project/123',
      snippet: 'Official project filing',
      raw_content: this.rawContent,
      score: 0.92,
      published_at: '2026-05-01T00:00:00.000Z',
    }]
  }

  async fetchPage(url: string) {
    return {
      url,
      title: 'Official project filing',
      text_content: this.rawContent,
      excerpt: this.rawContent.slice(0, 120),
      fetched_at: new Date().toISOString(),
    }
  }
}

class FakeExtractor implements ResearchExtractor {
  constructor(private readonly drafts: ExtractedEvidenceDraft[]) {}

  async extractEvidence(): Promise<ExtractedEvidenceDraft[]> {
    return this.drafts
  }
}

test('research service reuses cached runs when force_refresh is false', async () => {
  const repository = new InMemoryResearchRepository()
  const cachedRun: ResearchRunRow = {
    id: 'cached-run',
    property_id: baseProperty.id,
    status: 'success',
    initiated_by_surface: 'api',
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
    ttl_expires_at: new Date(Date.now() + 60_000).toISOString(),
    last_error: null,
    created_at: new Date().toISOString(),
  }
  repository.reusableRun = cachedRun
  repository.evidenceByRun.set('cached-run', [{
    id: 'e-1',
    run_id: 'cached-run',
    property_id: baseProperty.id,
    domain: 'legal',
    source_kind: 'web',
    authority_tier: 'official',
    status: 'accepted',
    claim_text: 'No active litigation was listed for the project.',
    normalized_claim: { open_cases: 0 },
    source_title: 'Official filing',
    source_url: 'https://maharera.maharashtra.gov.in/project/123',
    source_path: null,
    excerpt: 'No active litigation was listed for the project in the filing.',
    observed_at: '2026-05-01T00:00:00.000Z',
    freshness_expires_at: '2027-05-01T00:00:00.000Z',
    confidence: 0.8,
    rejection_reason: null,
    claim_hash: 'abc',
    created_at: new Date().toISOString(),
  }])

  const provider = new FakeWebProvider()
  const service = new ResearchService(
    repository,
    provider,
    new FakeExtractor([]),
    () => new Date('2026-05-25T00:00:00.000Z'),
  )

  const result = await service.runResearch({ property_id: baseProperty.id })
  assert.equal(result.reused_cache, true)
  assert.equal(result.run.id, 'cached-run')
  assert.equal(provider.searches, 0)
})

test('force_refresh bypasses cached runs and executes a fresh search', async () => {
  const repository = new InMemoryResearchRepository()
  repository.reusableRun = {
    id: 'cached-run',
    property_id: baseProperty.id,
    status: 'success',
    initiated_by_surface: 'api',
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
    ttl_expires_at: new Date(Date.now() + 60_000).toISOString(),
    last_error: null,
    created_at: new Date().toISOString(),
  }

  const provider = new FakeWebProvider()
  const extractor = new FakeExtractor([{
    domain: 'legal',
    claim_text: 'The project has a valid RERA filing and no open litigation in the cited record.',
    normalized_claim: { rera_status: 'active' },
    observed_at: '2026-05-01T00:00:00.000Z',
    confidence: 0.9,
  }])
  const service = new ResearchService(repository, provider, extractor, () => new Date('2026-05-25T00:00:00.000Z'))

  const result = await service.runResearch({ property_id: baseProperty.id, force_refresh: true })
  assert.equal(result.reused_cache, false)
  assert.equal(provider.searches > 0, true)
  assert.equal(result.digest.accepted_count, 1)
})

test('partial document parse failure still yields partial_failed run with accepted evidence', async () => {
  const repository = new InMemoryResearchRepository()
  const provider = new FakeWebProvider()
  const extractor = new FakeExtractor([{
    domain: 'property',
    claim_text: 'The official filing confirms an active registration and transit-linked locality.',
    normalized_claim: { registration_status: 'active' },
    observed_at: '2026-05-01T00:00:00.000Z',
    confidence: 0.88,
  }])
  const service = new ResearchService(repository, provider, extractor, () => new Date('2026-05-25T00:00:00.000Z'))

  const result = await service.runResearch({
    property_id: baseProperty.id,
    document_paths: ['/definitely/missing/file.pdf'],
  })

  assert.equal(result.run.status, 'partial_failed')
  assert.equal(result.digest.accepted_count, 1)
})

test('stale evidence is persisted as rejected instead of accepted', async () => {
  const repository = new InMemoryResearchRepository()
  const provider = new FakeWebProvider('Old environmental notice from 2024.')
  const extractor = new FakeExtractor([{
    domain: 'environment',
    claim_text: 'The locality air quality notice is from a much older environmental bulletin.',
    normalized_claim: { aqi_notice: 'old' },
    observed_at: '2024-01-01T00:00:00.000Z',
    confidence: 0.7,
  }])
  const service = new ResearchService(repository, provider, extractor, () => new Date('2026-05-25T00:00:00.000Z'))

  const result = await service.runResearch({ property_id: baseProperty.id, force_refresh: true })
  assert.equal(result.digest.rejected_count, 1)
  assert.equal(result.digest.accepted_count, 0)
})
