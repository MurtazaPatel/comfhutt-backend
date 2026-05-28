import type {
  EvidenceItem,
  PropertyProfile,
  ResearchCitation,
  VerificationDigest,
  VerificationRunSummary,
  VerificationStatus,
  VerifiedEvidenceItem,
} from '../shared/types'

export interface DeterministicVerificationSignals {
  direct_match: boolean
  freshness_ok: boolean
  supporting_evidence_ids: string[]
  contradicting_evidence_ids: string[]
  support_score: number
  contradiction_score: number
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function tokenizeAddress(address: string): string[] {
  return normalize(address)
    .split(' ')
    .filter((token) => token.length >= 4)
    .slice(0, 6)
}

function clamp(value: number, min: number = 0, max: number = 1): number {
  return Math.max(min, Math.min(max, value))
}

function hasAnyToken(tokens: string[], haystack: string): boolean {
  return tokens.some((token) => haystack.includes(token))
}

export function computeDirectMatch(evidence: EvidenceItem, property: PropertyProfile): boolean {
  const combined = normalize([
    evidence.claim_text,
    evidence.source_title,
    evidence.source_url,
    evidence.source_path,
  ].filter(Boolean).join(' '))

  const city = normalize(property.city)
  const state = normalize(property.state)
  const developer = normalize(property.developer_name)
  const addressTokens = tokenizeAddress(property.address_normalized ?? property.address_raw)

  switch (evidence.domain) {
    case 'property':
    case 'legal':
      return hasAnyToken(addressTokens, combined)
        || Boolean(developer && combined.includes(developer))
        || Boolean(city && combined.includes(city))
    case 'developer':
      return Boolean(developer) && combined.includes(developer)
    case 'locality':
    case 'market':
    case 'environment':
      return Boolean(city && combined.includes(city)) || Boolean(state && combined.includes(state))
    default:
      return false
  }
}

function primitiveEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function compareNormalizedClaims(left: Record<string, unknown>, right: Record<string, unknown>): 'support' | 'contradict' | 'none' {
  const sharedKeys = Object.keys(left).filter((key) => key in right)
  if (sharedKeys.length === 0) return 'none'

  let supportCount = 0
  let contradictionCount = 0

  for (const key of sharedKeys) {
    const leftValue = left[key]
    const rightValue = right[key]

    if (primitiveEqual(leftValue, rightValue)) {
      supportCount += 1
      continue
    }

    const bothNumbers = typeof leftValue === 'number' && typeof rightValue === 'number'
    if (bothNumbers && Math.abs(leftValue - rightValue) <= 1) {
      supportCount += 1
      continue
    }

    if (
      typeof leftValue !== 'object'
      && typeof rightValue !== 'object'
      && leftValue !== undefined
      && rightValue !== undefined
    ) {
      contradictionCount += 1
    }
  }

  if (contradictionCount > 0) return 'contradict'
  if (supportCount > 0) return 'support'
  return 'none'
}

export function computeDeterministicSignals(
  evidence: EvidenceItem,
  peers: EvidenceItem[],
  property: PropertyProfile,
  now: Date,
): DeterministicVerificationSignals {
  const freshness_ok = !evidence.freshness_expires_at || new Date(evidence.freshness_expires_at).getTime() >= now.getTime()
  const direct_match = computeDirectMatch(evidence, property)

  const supporting_evidence_ids: string[] = []
  const contradicting_evidence_ids: string[] = []

  for (const peer of peers) {
    if (peer.id === evidence.id || peer.domain !== evidence.domain) continue
    const relation = compareNormalizedClaims(evidence.normalized_claim, peer.normalized_claim)
    if (relation === 'support') supporting_evidence_ids.push(peer.id)
    if (relation === 'contradict') contradicting_evidence_ids.push(peer.id)
  }

  const authorityBase = evidence.authority_tier === 'official'
    ? 0.75
    : evidence.authority_tier === 'primary'
      ? 0.62
      : evidence.authority_tier === 'secondary'
        ? 0.42
        : 0.28

  const support_score = clamp(
    authorityBase
    + evidence.confidence * 0.2
    + (direct_match ? 0.1 : -0.15)
    + supporting_evidence_ids.length * 0.08
    - contradicting_evidence_ids.length * 0.12,
  )

  const contradiction_score = clamp(
    contradicting_evidence_ids.length * 0.15
    + (!direct_match ? 0.08 : 0)
    + (freshness_ok ? 0 : 0.10),
  )

  return {
    direct_match,
    freshness_ok,
    supporting_evidence_ids,
    contradicting_evidence_ids,
    support_score,
    contradiction_score,
  }
}

const VERIFICATION_ORDER: VerificationStatus[] = ['verified', 'contradicted', 'inconclusive', 'stale']

export function buildVerificationSummary(items: VerifiedEvidenceItem[]): VerificationRunSummary {
  return {
    evidence_items_considered: items.length,
    verified_count: items.filter((item) => item.verification.verification_status === 'verified').length,
    contradicted_count: items.filter((item) => item.verification.verification_status === 'contradicted').length,
    inconclusive_count: items.filter((item) => item.verification.verification_status === 'inconclusive').length,
    stale_count: items.filter((item) => item.verification.verification_status === 'stale').length,
  }
}

function sortItems(items: VerifiedEvidenceItem[]): VerifiedEvidenceItem[] {
  return [...items].sort((left, right) => {
    const statusDelta = VERIFICATION_ORDER.indexOf(left.verification.verification_status)
      - VERIFICATION_ORDER.indexOf(right.verification.verification_status)
    if (statusDelta !== 0) return statusDelta
    return right.verification.verifier_confidence - left.verification.verifier_confidence
  })
}

export function buildVerificationDigest(
  runId: string,
  researchRunId: string,
  status: 'running' | 'success' | 'partial_failed' | 'failed',
  items: VerifiedEvidenceItem[],
): VerificationDigest {
  const sorted = sortItems(items)

  return {
    run_id: runId,
    research_run_id: researchRunId,
    status,
    verified_count: sorted.filter((item) => item.verification.verification_status === 'verified').length,
    contradicted_count: sorted.filter((item) => item.verification.verification_status === 'contradicted').length,
    inconclusive_count: sorted.filter((item) => item.verification.verification_status === 'inconclusive').length,
    stale_count: sorted.filter((item) => item.verification.verification_status === 'stale').length,
    verified_items: sorted.filter((item) => item.verification.verification_status === 'verified'),
    contradicted_items: sorted.filter((item) => item.verification.verification_status === 'contradicted'),
    inconclusive_items: sorted.filter((item) => item.verification.verification_status === 'inconclusive'),
    stale_items: sorted.filter((item) => item.verification.verification_status === 'stale'),
  }
}

export function buildVerificationContextBlock(digest: VerificationDigest | null): string {
  if (!digest) {
    return 'No verification run is cached for this property yet.'
  }

  const verifiedLines = digest.verified_items.slice(0, 4).map((item, index) => {
    const source = item.evidence.source_url ?? item.evidence.source_path ?? 'unknown source'
    return `${index + 1}. VERIFIED: ${item.evidence.claim_text} (source: ${item.evidence.source_title} — ${source})`
  })

  const contradictedLines = digest.contradicted_items.slice(0, 3).map((item, index) => {
    return `${index + 1}. CONTRADICTED: ${item.evidence.claim_text}`
  })

  if (verifiedLines.length === 0 && contradictedLines.length === 0) {
    return 'Verification has run, but no evidence was strong enough to verify conclusively.'
  }

  return [
    verifiedLines.length > 0 ? `Verified evidence:\n${verifiedLines.join('\n')}` : '',
    contradictedLines.length > 0 ? `Contradicted evidence:\n${contradictedLines.join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
}

export function buildVerificationHighlights(digest: VerificationDigest | null): string[] {
  if (!digest) return []
  return digest.verified_items.slice(0, 3).map((item) => item.evidence.claim_text)
}

export function buildVerificationCitations(digest: VerificationDigest | null): ResearchCitation[] {
  if (!digest) return []
  return digest.verified_items.slice(0, 10).map((item) => ({
    claim: item.evidence.claim_text,
    source_title: item.evidence.source_title,
    source_url_or_path: item.evidence.source_url ?? item.evidence.source_path ?? 'unknown source',
    authority_tier: item.evidence.authority_tier,
    observed_at: item.evidence.observed_at,
  }))
}
