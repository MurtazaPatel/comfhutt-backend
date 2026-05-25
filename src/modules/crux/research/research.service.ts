import { env } from '../../../config/env'
import { supabase } from '../../../lib/db'
import { AppError } from '../shared/errors'
import type {
  EvidenceItem,
  EvidenceStatus,
  ExtractedEvidenceDraft,
  PropertyProfile,
  ResearchDocumentRow,
  ResearchEvidenceDigest,
  ResearchRunInput,
  ResearchRunRow,
  ResearchRunStatus,
} from '../shared/types'
import { parseDocument, type ParsedDocument } from './research.documents'
import { GeminiResearchExtractor, type ResearchExtractor } from './research.extractor'
import {
  buildEvidenceDigest,
  buildResearchQueries,
  buildResearchSummary,
  buildSeedUrlResults,
  classifyAuthorityTier,
  computeClaimHash,
  computeEvidenceStatus,
  computeFreshnessExpiry,
  getAllowedDomains,
  isExpired,
} from './research.policy'
import { TavilyWebProvider, type ResearchWebProvider } from './research.web'

export interface ResearchRunResult {
  run: ResearchRunRow
  digest: ResearchEvidenceDigest
  reused_cache: boolean
}

interface EvidenceInsert {
  run_id: string
  property_id: string
  domain: EvidenceItem['domain']
  source_kind: EvidenceItem['source_kind']
  authority_tier: EvidenceItem['authority_tier']
  status: EvidenceStatus
  claim_text: string
  normalized_claim: Record<string, unknown>
  source_title: string
  source_url: string | null
  source_path: string | null
  excerpt: string
  observed_at: string | null
  freshness_expires_at: string | null
  confidence: number
  rejection_reason: string | null
  claim_hash: string
}

export interface ResearchRepository {
  getProperty(propertyId: string): Promise<PropertyProfile | null>
  getReusableRun(propertyId: string, nowIso: string): Promise<ResearchRunRow | null>
  getRunById(runId: string): Promise<ResearchRunRow | null>
  getLatestRun(propertyId: string): Promise<ResearchRunRow | null>
  getEvidenceByRun(runId: string): Promise<EvidenceItem[]>
  createRun(input: ResearchRunInput, ttlExpiresAt: string): Promise<ResearchRunRow>
  saveDocuments(runId: string, documents: ParsedDocument[]): Promise<ResearchDocumentRow[]>
  saveEvidence(items: EvidenceInsert[]): Promise<EvidenceItem[]>
  completeRun(params: {
    runId: string
    status: ResearchRunStatus
    summary: ResearchRunRow['summary_counts']
    completedAt: string
    ttlExpiresAt: string
    lastError: string | null
  }): Promise<ResearchRunRow>
  logRun(params: {
    propertyId: string
    inputPayload: Record<string, unknown>
    outputPayload: Record<string, unknown>
    latencyMs: number
    status: 'success' | 'error'
  }): Promise<void>
}

class SupabaseResearchRepository implements ResearchRepository {
  async getProperty(propertyId: string): Promise<PropertyProfile | null> {
    const { data, error } = await supabase
      .from('crux_properties')
      .select('*')
      .eq('id', propertyId)
      .maybeSingle()

    if (error) {
      throw new AppError(500, 'DB_READ_FAILED', error.message)
    }

    return data as PropertyProfile | null
  }

  async getReusableRun(propertyId: string, nowIso: string): Promise<ResearchRunRow | null> {
    const { data, error } = await supabase
      .from('crux_research_runs')
      .select('*')
      .eq('property_id', propertyId)
      .in('status', ['success', 'partial_failed'])
      .gt('ttl_expires_at', nowIso)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return null
    return data as ResearchRunRow | null
  }

  async getRunById(runId: string): Promise<ResearchRunRow | null> {
    const { data, error } = await supabase
      .from('crux_research_runs')
      .select('*')
      .eq('id', runId)
      .maybeSingle()

    if (error) return null
    return data as ResearchRunRow | null
  }

  async getLatestRun(propertyId: string): Promise<ResearchRunRow | null> {
    const { data, error } = await supabase
      .from('crux_research_runs')
      .select('*')
      .eq('property_id', propertyId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return null
    return data as ResearchRunRow | null
  }

  async getEvidenceByRun(runId: string): Promise<EvidenceItem[]> {
    const { data, error } = await supabase
      .from('crux_evidence_items')
      .select('*')
      .eq('run_id', runId)
      .order('created_at', { ascending: false })

    if (error || !data) return []
    return data as EvidenceItem[]
  }

  async createRun(input: ResearchRunInput, ttlExpiresAt: string): Promise<ResearchRunRow> {
    const startedAt = new Date().toISOString()
    const { data, error } = await supabase
      .from('crux_research_runs')
      .insert({
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
        started_at: startedAt,
        completed_at: null,
        ttl_expires_at: ttlExpiresAt,
        last_error: null,
      })
      .select('*')
      .single()

    if (error || !data) {
      throw new AppError(500, 'RESEARCH_RUN_CREATE_FAILED', 'Failed to create research run.')
    }

    return data as ResearchRunRow
  }

  async saveDocuments(runId: string, documents: ParsedDocument[]): Promise<ResearchDocumentRow[]> {
    if (documents.length === 0) return []

    const { data, error } = await supabase
      .from('crux_research_documents')
      .insert(
        documents.map((document) => ({
          run_id: runId,
          file_path: document.file_path,
          file_type: document.file_type,
          content_hash: document.content_hash,
          parse_status: document.parse_status,
          parse_error: document.parse_error,
          parsed_at: document.parsed_at,
        })),
      )
      .select('*')

    if (error || !data) {
      throw new AppError(500, 'RESEARCH_DOCUMENT_SAVE_FAILED', 'Failed to persist research documents.')
    }

    return data as ResearchDocumentRow[]
  }

  async saveEvidence(items: EvidenceInsert[]): Promise<EvidenceItem[]> {
    if (items.length === 0) return []

    const { data, error } = await supabase
      .from('crux_evidence_items')
      .insert(items)
      .select('*')

    if (error || !data) {
      throw new AppError(500, 'RESEARCH_EVIDENCE_SAVE_FAILED', 'Failed to persist research evidence.')
    }

    return data as EvidenceItem[]
  }

  async completeRun(params: {
    runId: string
    status: ResearchRunStatus
    summary: ResearchRunRow['summary_counts']
    completedAt: string
    ttlExpiresAt: string
    lastError: string | null
  }): Promise<ResearchRunRow> {
    const { data, error } = await supabase
      .from('crux_research_runs')
      .update({
        status: params.status,
        summary_counts: params.summary,
        completed_at: params.completedAt,
        ttl_expires_at: params.ttlExpiresAt,
        last_error: params.lastError,
      })
      .eq('id', params.runId)
      .select('*')
      .single()

    if (error || !data) {
      throw new AppError(500, 'RESEARCH_RUN_UPDATE_FAILED', 'Failed to update research run.')
    }

    return data as ResearchRunRow
  }

  async logRun(params: {
    propertyId: string
    inputPayload: Record<string, unknown>
    outputPayload: Record<string, unknown>
    latencyMs: number
    status: 'success' | 'error'
  }): Promise<void> {
    const { error } = await supabase
      .from('crux_agent_logs')
      .insert({
        agent_type: 'research',
        property_id: params.propertyId,
        input_payload: params.inputPayload,
        output_payload: params.outputPayload,
        llm_provider: 'gemini',
        tokens_used: null,
        latency_ms: params.latencyMs,
        status: params.status,
      })

    if (error) {
      console.error('[research.agent] log write failed:', error.message)
    }
  }
}

function chunkText(text: string, maxLength: number = 6000): string[] {
  const normalized = text.trim()
  if (!normalized) return []
  if (normalized.length <= maxLength) return [normalized]

  const chunks: string[] = []
  let cursor = 0
  while (cursor < normalized.length && chunks.length < 4) {
    const slice = normalized.slice(cursor, cursor + maxLength)
    const splitIndex = slice.lastIndexOf('\n')
    const boundary = splitIndex > maxLength / 2 ? splitIndex : slice.length
    chunks.push(normalized.slice(cursor, cursor + boundary).trim())
    cursor += boundary
  }

  return chunks.filter(Boolean)
}

interface ExtractSource {
  source_kind: EvidenceItem['source_kind']
  source_title: string
  source_url: string | null
  source_path: string | null
  excerpt: string
  observed_at: string | null
  text_content: string
}

function capEvidence(items: EvidenceInsert[]): EvidenceInsert[] {
  const scoreStatus = (status: EvidenceStatus): number => {
    if (status === 'accepted') return 0
    if (status === 'weak') return 1
    return 2
  }

  return [...items]
    .sort((left, right) => {
      const statusDelta = scoreStatus(left.status) - scoreStatus(right.status)
      if (statusDelta !== 0) return statusDelta
      return right.confidence - left.confidence
    })
    .slice(0, env.CRUX_RESEARCH_MAX_EVIDENCE_ITEMS)
}

export class ResearchService {
  constructor(
    private readonly repository: ResearchRepository,
    private readonly webProvider: ResearchWebProvider,
    private readonly extractor: ResearchExtractor,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async runResearch(input: ResearchRunInput): Promise<ResearchRunResult> {
    const startedAt = Date.now()
    const property = await this.repository.getProperty(input.property_id)

    if (!property) {
      throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found.')
    }

    const nowDate = this.now()
    const nowIso = nowDate.toISOString()

    if (!input.force_refresh) {
      const cachedRun = await this.repository.getReusableRun(input.property_id, nowIso)
      if (cachedRun) {
        const cachedEvidence = await this.repository.getEvidenceByRun(cachedRun.id)
        return {
          run: cachedRun,
          digest: buildEvidenceDigest(cachedRun.id, cachedRun.status, cachedEvidence),
          reused_cache: true,
        }
      }
    }

    const ttlExpiresAt = new Date(nowDate.getTime() + env.CRUX_RESEARCH_TTL_HOURS * 60 * 60 * 1000).toISOString()
    const run = await this.repository.createRun(input, ttlExpiresAt)
    const allowedDomains = getAllowedDomains(input.seed_urls)
    const queries = buildResearchQueries(property)
    const errors: string[] = []

    const webPromise = this.collectWebSources(queries, input.seed_urls ?? [])
    const documentPromise = this.collectDocumentSources(input.document_paths ?? [])

    const [webSources, documentSources] = await Promise.all([webPromise, documentPromise])

    errors.push(...webSources.errors, ...documentSources.errors)

    await this.repository.saveDocuments(run.id, documentSources.documents)

    const extractSources = [...webSources.sources, ...documentSources.sources]
    const evidenceInserts: EvidenceInsert[] = []
    const seenClaimHashes = new Set<string>()

    for (const source of extractSources) {
      const chunks = chunkText(source.text_content)
      for (const chunk of chunks) {
        let drafts: ExtractedEvidenceDraft[] = []
        try {
          drafts = await this.extractor.extractEvidence({
            property,
            sourceTitle: source.source_title,
            sourceUrl: source.source_url,
            sourcePath: source.source_path,
            text: chunk,
            observedAt: source.observed_at,
          })
        } catch (error) {
          errors.push(error instanceof Error ? error.message : 'EVIDENCE_EXTRACTION_FAILED')
          continue
        }

        for (const draft of drafts) {
          const observedAt = draft.observed_at ?? source.observed_at ?? null
          const freshnessExpiresAt = computeFreshnessExpiry(draft.domain, observedAt)
          const authorityTier = classifyAuthorityTier(source.source_url, source.source_path, allowedDomains)
          let { status, rejection_reason } = computeEvidenceStatus(
            draft.claim_text,
            source.excerpt,
            authorityTier,
            source.source_url,
            source.source_path,
            draft.confidence,
          )

          if (isExpired(freshnessExpiresAt, this.now())) {
            status = 'rejected'
            rejection_reason = 'STALE_EVIDENCE'
          }

          const claimHash = computeClaimHash(
            draft,
            source.source_url ?? source.source_path ?? source.source_title,
          )

          if (seenClaimHashes.has(claimHash)) {
            continue
          }

          seenClaimHashes.add(claimHash)
          evidenceInserts.push({
            run_id: run.id,
            property_id: property.id,
            domain: draft.domain,
            source_kind: source.source_kind,
            authority_tier: authorityTier,
            status,
            claim_text: draft.claim_text.trim(),
            normalized_claim: draft.normalized_claim,
            source_title: source.source_title,
            source_url: source.source_url,
            source_path: source.source_path,
            excerpt: source.excerpt,
            observed_at: observedAt,
            freshness_expires_at: freshnessExpiresAt,
            confidence: draft.confidence,
            rejection_reason,
            claim_hash: claimHash,
          })
        }
      }
    }

    const savedEvidence = await this.repository.saveEvidence(capEvidence(evidenceInserts))
    const summary = buildResearchSummary(
      savedEvidence,
      documentSources.documents.length,
      documentSources.documents.filter((document) => document.parse_status !== 'parsed').length,
      queries.length,
      webSources.resultCount,
    )

    const status = this.resolveRunStatus(savedEvidence, errors, summary)
    const completedRun = await this.repository.completeRun({
      runId: run.id,
      status,
      summary,
      completedAt: new Date().toISOString(),
      ttlExpiresAt,
      lastError: errors[0] ?? null,
    })

    await this.repository.logRun({
      propertyId: property.id,
      inputPayload: {
        property_id: property.id,
        surface: input.surface ?? 'api',
        queries,
        seed_urls: input.seed_urls ?? [],
        document_paths: input.document_paths ?? [],
      },
      outputPayload: {
        status,
        summary,
        errors,
      },
      latencyMs: Date.now() - startedAt,
      status: status === 'failed' ? 'error' : 'success',
    })

    return {
      run: completedRun,
      digest: buildEvidenceDigest(completedRun.id, completedRun.status, savedEvidence),
      reused_cache: false,
    }
  }

  async getLatestResearch(propertyId: string): Promise<ResearchRunResult | null> {
    const run = await this.repository.getLatestRun(propertyId)
    if (!run) return null
    const evidence = await this.repository.getEvidenceByRun(run.id)
    return {
      run,
      digest: buildEvidenceDigest(run.id, run.status, evidence),
      reused_cache: false,
    }
  }

  private resolveRunStatus(
    evidence: EvidenceItem[],
    errors: string[],
    summary: ResearchRunRow['summary_counts'],
  ): ResearchRunStatus {
    if (errors.length === 0) return 'success'
    if (
      evidence.length > 0
      || summary.results_fetched > 0
      || summary.documents_total > 0
      || summary.queries_executed > 0
    ) {
      return 'partial_failed'
    }
    return 'failed'
  }

  private async collectWebSources(queries: string[], seedUrls: string[]): Promise<{
    sources: ExtractSource[]
    resultCount: number
    errors: string[]
  }> {
    const errors: string[] = []
    const urlMap = new Map<string, { title: string; raw_content: string | null; published_at: string | null }>()

    for (const result of buildSeedUrlResults(seedUrls)) {
      urlMap.set(result.url, {
        title: result.title,
        raw_content: result.raw_content,
        published_at: result.published_at,
      })
    }

    for (const query of queries) {
      try {
        const results = await this.webProvider.search(query, {
          maxResults: env.CRUX_RESEARCH_MAX_WEB_RESULTS,
        })
        for (const result of results) {
          if (!urlMap.has(result.url)) {
            urlMap.set(result.url, {
              title: result.title,
              raw_content: result.raw_content,
              published_at: result.published_at,
            })
          }
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'WEB_SEARCH_FAILED')
      }
    }

    const sourceEntries = Array.from(urlMap.entries()).slice(0, env.CRUX_RESEARCH_MAX_WEB_RESULTS)
    const sources: ExtractSource[] = []

    for (const [url, metadata] of sourceEntries) {
      try {
        if (metadata.raw_content) {
          sources.push({
            source_kind: 'web',
            source_title: metadata.title,
            source_url: url,
            source_path: null,
            observed_at: metadata.published_at,
            excerpt: metadata.raw_content.slice(0, 280),
            text_content: metadata.raw_content,
          })
          continue
        }

        const page = await this.webProvider.fetchPage(url)
        sources.push({
          source_kind: 'web',
          source_title: metadata.title || page.title,
          source_url: page.url,
          source_path: null,
          observed_at: metadata.published_at,
          excerpt: page.excerpt,
          text_content: page.text_content,
        })
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'WEB_PAGE_FETCH_FAILED')
      }
    }

    return {
      sources,
      resultCount: sourceEntries.length,
      errors,
    }
  }

  private async collectDocumentSources(documentPaths: string[]): Promise<{
    sources: ExtractSource[]
    documents: ParsedDocument[]
    errors: string[]
  }> {
    const parsedDocuments = await Promise.all(documentPaths.map(async (documentPath) => {
      try {
        return await parseDocument(documentPath)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'DOCUMENT_PARSE_FAILED'
        return {
          file_path: documentPath,
          file_type: 'unknown',
          content_hash: '',
          parse_status: 'failed',
          parse_error: message,
          parsed_at: null,
          text_content: '',
          source_title: documentPath,
          excerpt: '',
        } satisfies ParsedDocument
      }
    }))

    return {
      sources: parsedDocuments
        .filter((document) => document.parse_status === 'parsed' && document.text_content)
        .map((document) => ({
          source_kind: 'document' as const,
          source_title: document.source_title,
          source_url: null,
          source_path: document.file_path,
          observed_at: document.parsed_at,
          excerpt: document.excerpt,
          text_content: document.text_content,
        })),
      documents: parsedDocuments,
      errors: parsedDocuments
        .filter((document) => document.parse_status !== 'parsed')
        .map((document) => document.parse_error ?? 'DOCUMENT_PARSE_FAILED'),
    }
  }
}

export function createResearchService(): ResearchService {
  return new ResearchService(
    new SupabaseResearchRepository(),
    new TavilyWebProvider(),
    new GeminiResearchExtractor(),
  )
}

export const defaultResearchService = createResearchService()
