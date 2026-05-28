import { env } from '../../../config/env'
import { supabase } from '../../../lib/db'
import { AppError } from '../shared/errors'
import type {
  EvidenceItem,
  EvidenceVerificationRow,
  PropertyProfile,
  VerificationDigest,
  VerificationRunInput,
  VerificationRunRow,
  VerificationRunStatus,
  VerifiedEvidenceItem,
} from '../shared/types'
import { defaultResearchService, type ResearchRunResult } from '../research'
import { GeminiEvidenceVerifier, type EvidenceVerifier, type VerificationAssessment } from './verification.extractor'
import {
  buildVerificationDigest,
  buildVerificationSummary,
  computeDeterministicSignals,
} from './verification.policy'

export interface VerificationRunResult {
  run: VerificationRunRow
  digest: VerificationDigest
  reused_cache: boolean
}

interface VerificationInsert {
  run_id: string
  property_id: string
  research_run_id: string
  evidence_item_id: string
  verification_status: EvidenceVerificationRow['verification_status']
  verifier_confidence: number
  direct_match: boolean
  freshness_ok: boolean
  support_score: number
  contradiction_score: number
  supporting_evidence_ids: string[]
  contradicting_evidence_ids: string[]
  verification_notes: string | null
}

export interface VerificationRepository {
  getProperty(propertyId: string): Promise<PropertyProfile | null>
  getReusableRun(propertyId: string, researchRunId: string, nowIso: string): Promise<VerificationRunRow | null>
  getLatestRun(propertyId: string): Promise<VerificationRunRow | null>
  getVerificationsByRun(runId: string): Promise<EvidenceVerificationRow[]>
  createRun(input: VerificationRunInput, researchRunId: string, ttlExpiresAt: string): Promise<VerificationRunRow>
  saveVerifications(items: VerificationInsert[]): Promise<EvidenceVerificationRow[]>
  completeRun(params: {
    runId: string
    status: VerificationRunStatus
    summary: VerificationRunRow['summary_counts']
    completedAt: string
    ttlExpiresAt: string
    lastError: string | null
  }): Promise<VerificationRunRow>
  logRun(params: {
    propertyId: string
    inputPayload: Record<string, unknown>
    outputPayload: Record<string, unknown>
    latencyMs: number
    status: 'success' | 'error'
  }): Promise<void>
}

class SupabaseVerificationRepository implements VerificationRepository {
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

  async getReusableRun(propertyId: string, researchRunId: string, nowIso: string): Promise<VerificationRunRow | null> {
    const { data, error } = await supabase
      .from('crux_verification_runs')
      .select('*')
      .eq('property_id', propertyId)
      .eq('research_run_id', researchRunId)
      .in('status', ['success', 'partial_failed'])
      .gt('ttl_expires_at', nowIso)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return null
    return data as VerificationRunRow | null
  }

  async getLatestRun(propertyId: string): Promise<VerificationRunRow | null> {
    const { data, error } = await supabase
      .from('crux_verification_runs')
      .select('*')
      .eq('property_id', propertyId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return null
    return data as VerificationRunRow | null
  }

  async getVerificationsByRun(runId: string): Promise<EvidenceVerificationRow[]> {
    const { data, error } = await supabase
      .from('crux_evidence_verifications')
      .select('*')
      .eq('run_id', runId)
      .order('created_at', { ascending: false })

    if (error || !data) return []
    return data as EvidenceVerificationRow[]
  }

  async createRun(input: VerificationRunInput, researchRunId: string, ttlExpiresAt: string): Promise<VerificationRunRow> {
    const { data, error } = await supabase
      .from('crux_verification_runs')
      .insert({
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
        ttl_expires_at: ttlExpiresAt,
      })
      .select('*')
      .single()

    if (error || !data) {
      console.error('[verification] createRun failed:', JSON.stringify({ code: error?.code, message: error?.message, details: error?.details, hint: error?.hint }))
      throw new AppError(500, 'VERIFICATION_RUN_CREATE_FAILED', 'Failed to create verification run.')
    }

    return data as VerificationRunRow
  }

  async saveVerifications(items: VerificationInsert[]): Promise<EvidenceVerificationRow[]> {
    if (items.length === 0) return []

    const { data, error } = await supabase
      .from('crux_evidence_verifications')
      .insert(items)
      .select('*')

    if (error || !data) {
      throw new AppError(500, 'EVIDENCE_VERIFICATION_SAVE_FAILED', 'Failed to persist verification verdicts.')
    }

    return data as EvidenceVerificationRow[]
  }

  async completeRun(params: {
    runId: string
    status: VerificationRunStatus
    summary: VerificationRunRow['summary_counts']
    completedAt: string
    ttlExpiresAt: string
    lastError: string | null
  }): Promise<VerificationRunRow> {
    const { data, error } = await supabase
      .from('crux_verification_runs')
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
      throw new AppError(500, 'VERIFICATION_RUN_UPDATE_FAILED', 'Failed to update verification run.')
    }

    return data as VerificationRunRow
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
        agent_type: 'verification',
        property_id: params.propertyId,
        input_payload: params.inputPayload,
        output_payload: params.outputPayload,
        llm_provider: 'gemini',
        tokens_used: null,
        latency_ms: params.latencyMs,
        status: params.status,
      })

    if (error) {
      console.error('[verification.agent] log write failed:', error.message)
    }
  }
}

function mapVerifiedEvidenceItems(
  evidenceItems: EvidenceItem[],
  verifications: EvidenceVerificationRow[],
): VerifiedEvidenceItem[] {
  const evidenceMap = new Map(evidenceItems.map((item) => [item.id, item]))

  return verifications
    .map((verification) => {
      const evidence = evidenceMap.get(verification.evidence_item_id)
      if (!evidence) return null
      return { evidence, verification }
    })
    .filter((item): item is VerifiedEvidenceItem => Boolean(item))
}

function finalizeVerificationStatus(
  evidence: EvidenceItem,
  deterministic: ReturnType<typeof computeDeterministicSignals>,
  assessment: VerificationAssessment,
): EvidenceVerificationRow['verification_status'] {
  if (!deterministic.freshness_ok || assessment.verification_status === 'stale') {
    return 'stale'
  }

  const contradictionScore = Math.max(deterministic.contradiction_score, assessment.contradiction_score)
  const supportScore = Math.max(deterministic.support_score, assessment.support_score)
  const directMatch = deterministic.direct_match
  const canVerify = evidence.status === 'accepted' || evidence.status === 'weak'
  const authorityTier = evidence.authority_tier

  if (assessment.verification_status === 'contradicted' || contradictionScore >= 0.85) {
    return 'contradicted'
  }

  if (assessment.verification_status === 'verified' && canVerify && directMatch && contradictionScore < 0.60) {
    return 'verified'
  }

  if (canVerify && authorityTier === 'secondary' && directMatch && supportScore >= 0.60 && contradictionScore < 0.40) {
    return 'verified'
  }

  if (canVerify && (authorityTier === 'official' || authorityTier === 'primary') && directMatch && supportScore >= 0.50 && contradictionScore < 0.55) {
    return 'verified'
  }

  if (canVerify && (authorityTier === 'unknown') && directMatch && supportScore >= 0.65 && contradictionScore < 0.35) {
    return 'verified'
  }

  return 'inconclusive'
}

export class VerificationService {
  constructor(
    private readonly repository: VerificationRepository,
    private readonly verifier: EvidenceVerifier,
    private readonly getLatestResearchResult: (propertyId: string) => Promise<ResearchRunResult | null>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async runVerification(input: VerificationRunInput): Promise<VerificationRunResult> {
    const startedAt = Date.now()
    const property = await this.repository.getProperty(input.property_id)

    if (!property) {
      throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found.')
    }

    const research = await this.getLatestResearchResult(input.property_id)
    if (!research) {
      throw new AppError(404, 'RESEARCH_NOT_FOUND', 'Research must exist before verification can run.')
    }

    const nowDate = this.now()
    const nowIso = nowDate.toISOString()
    if (!input.force_refresh) {
      const cachedRun = await this.repository.getReusableRun(input.property_id, research.run.id, nowIso)
      if (cachedRun) {
        const cachedVerifications = await this.repository.getVerificationsByRun(cachedRun.id)
        const digest = buildVerificationDigest(
          cachedRun.id,
          cachedRun.research_run_id,
          cachedRun.status,
          mapVerifiedEvidenceItems([...research.digest.accepted_items, ...research.digest.weak_items], cachedVerifications),
        )

        return { run: cachedRun, digest, reused_cache: true }
      }
    }

    const ttlExpiresAt = new Date(nowDate.getTime() + env.CRUX_VERIFICATION_TTL_HOURS * 60 * 60 * 1000).toISOString()
    const run = await this.repository.createRun(input, research.run.id, ttlExpiresAt)
    const evidenceItems = [...research.digest.accepted_items, ...research.digest.weak_items]
    const errors: string[] = []
    const inserts: VerificationInsert[] = []
    const verifier = this.verifier

    for (let i = 0; i < evidenceItems.length; i += 5) {
      const batch = evidenceItems.slice(i, i + 5)
      const batchResults = await Promise.all(
        batch.map(async (evidence) => {
          const peers = evidenceItems.filter((peer) => peer.id !== evidence.id)
          const deterministic = computeDeterministicSignals(evidence, peers, property, nowDate)

          let assessment: VerificationAssessment = {
            verification_status: deterministic.freshness_ok ? 'inconclusive' : 'stale',
            verifier_confidence: 0.5,
            support_score: deterministic.support_score,
            contradiction_score: deterministic.contradiction_score,
            supporting_evidence_ids: deterministic.supporting_evidence_ids,
            contradicting_evidence_ids: deterministic.contradicting_evidence_ids,
            verification_notes: deterministic.direct_match
              ? 'Deterministic verification fallback used.'
              : 'Entity match is weak; deterministic verification fallback used.',
          }

          try {
            assessment = await verifier.verifyEvidence({
              property,
              evidence,
              peers,
              deterministic,
            })
          } catch {
            return { item: null, error: 'EVIDENCE_VERIFICATION_FAILED' }
          }

          const verification_status = finalizeVerificationStatus(evidence, deterministic, assessment)
          return {
            item: {
              run_id: run.id,
              property_id: property.id,
              research_run_id: research.run.id,
              evidence_item_id: evidence.id,
              verification_status,
              verifier_confidence: assessment.verifier_confidence,
              direct_match: deterministic.direct_match,
              freshness_ok: deterministic.freshness_ok,
              support_score: Math.max(deterministic.support_score, assessment.support_score),
              contradiction_score: Math.max(deterministic.contradiction_score, assessment.contradiction_score),
              supporting_evidence_ids: Array.from(new Set([
                ...deterministic.supporting_evidence_ids,
                ...assessment.supporting_evidence_ids,
              ])),
              contradicting_evidence_ids: Array.from(new Set([
                ...deterministic.contradicting_evidence_ids,
                ...assessment.contradicting_evidence_ids,
              ])),
              verification_notes: assessment.verification_notes,
            } as VerificationInsert,
            error: null,
          }
        }),
      )
      for (const result of batchResults) {
        if (result.item) inserts.push(result.item)
        if (result.error) errors.push(result.error)
      }
    }

    const savedVerifications = await this.repository.saveVerifications(inserts)
    const verifiedItems = mapVerifiedEvidenceItems(evidenceItems, savedVerifications)
    const summary = buildVerificationSummary(verifiedItems)
    const status: VerificationRunStatus = errors.length === 0
      ? 'success'
      : verifiedItems.length > 0
        ? 'partial_failed'
        : 'failed'

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
        research_run_id: research.run.id,
        evidence_items_considered: evidenceItems.length,
        surface: input.surface ?? 'api',
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
      digest: buildVerificationDigest(completedRun.id, research.run.id, completedRun.status, verifiedItems),
      reused_cache: false,
    }
  }

  async getLatestVerification(propertyId: string): Promise<VerificationRunResult | null> {
    const run = await this.repository.getLatestRun(propertyId)
    if (!run) return null

    const research = await this.getLatestResearchResult(propertyId)
    if (!research || research.run.id !== run.research_run_id) return null

    const verifications = await this.repository.getVerificationsByRun(run.id)
    const evidenceItems = [...research.digest.accepted_items, ...research.digest.weak_items]

    return {
      run,
      digest: buildVerificationDigest(run.id, run.research_run_id, run.status, mapVerifiedEvidenceItems(evidenceItems, verifications)),
      reused_cache: false,
    }
  }
}

export function createVerificationService(): VerificationService {
  return new VerificationService(
    new SupabaseVerificationRepository(),
    new GeminiEvidenceVerifier(),
    (propertyId: string) => defaultResearchService.getLatestResearch(propertyId),
  )
}

export const defaultVerificationService = createVerificationService()
