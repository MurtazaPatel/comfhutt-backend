import { createHash } from 'node:crypto'
import { env } from '../../../config/env'
import type {
  EvidenceAuthorityTier,
  EvidenceDomain,
  EvidenceItem,
  EvidenceStatus,
  ExtractedEvidenceDraft,
  PropertyProfile,
  ResearchCitation,
  ResearchEvidenceDigest,
  ResearchRunSummary,
  SearchResult,
} from '../shared/types'

const DEFAULT_ALLOWED_DOMAINS = [
  'gov.in',
  'nic.in',
  'rera.gujarat.gov.in',
  'maharera.maharashtra.gov.in',
  'up-rera.in',
  'gujrera.gujarat.gov.in',
  'ecourts.gov.in',
  'mca.gov.in',
  'nhb.org.in',
  'cpcb.nic.in',
  'cpwd.gov.in',
]

const FRESHNESS_DAYS: Record<EvidenceDomain, number> = {
  property: 180,
  developer: 180,
  locality: 120,
  market: 90,
  legal: 365,
  environment: 14,
}

export function getAllowedDomains(seedUrls: string[] = []): string[] {
  const seedHosts = seedUrls
    .map((url) => extractHostname(url))
    .filter((host): host is string => Boolean(host))

  return Array.from(
    new Set([
      ...DEFAULT_ALLOWED_DOMAINS,
      ...env.CRUX_RESEARCH_ALLOWED_DOMAINS,
      ...seedHosts,
    ]),
  )
}

export function extractHostname(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

function matchesDomain(hostname: string, candidate: string): boolean {
  return hostname === candidate || hostname.endsWith(`.${candidate}`)
}

export function isAllowedDomain(url: string | null | undefined, allowedDomains: string[]): boolean {
  const hostname = extractHostname(url)
  if (!hostname) return false
  return allowedDomains.some((candidate) => matchesDomain(hostname, candidate))
}

export function classifyAuthorityTier(
  sourceUrl: string | null,
  sourcePath: string | null,
  allowedDomains: string[],
): EvidenceAuthorityTier {
  if (sourcePath) return 'primary'

  const hostname = extractHostname(sourceUrl)
  if (!hostname) return 'unknown'

  if (
    hostname.endsWith('.gov.in')
    || hostname.endsWith('.nic.in')
    || hostname === 'mca.gov.in'
    || hostname.endsWith('.rera.gov.in')
    || hostname.includes('rera')
    || hostname.includes('ecourts')
  ) {
    return 'official'
  }

  if (allowedDomains.some((candidate) => matchesDomain(hostname, candidate))) {
    return 'primary'
  }

  return 'secondary'
}

export function computeEvidenceStatus(
  claimText: string,
  excerpt: string,
  authorityTier: EvidenceAuthorityTier,
  sourceUrl: string | null,
  sourcePath: string | null,
  confidence: number,
): { status: EvidenceStatus; rejection_reason: string | null } {
  const trimmedClaim = claimText.trim()
  const trimmedExcerpt = excerpt.trim()

  if (!trimmedClaim || trimmedClaim.length < 20) {
    return { status: 'rejected', rejection_reason: 'CLAIM_TOO_SHORT' }
  }

  if (!trimmedExcerpt || trimmedExcerpt.length < 30) {
    return { status: 'rejected', rejection_reason: 'MISSING_EXCERPT' }
  }

  if (!sourceUrl && !sourcePath) {
    return { status: 'rejected', rejection_reason: 'MISSING_SOURCE' }
  }

  if (confidence < 0.25) {
    return { status: 'rejected', rejection_reason: 'LOW_CONFIDENCE' }
  }

  if (authorityTier === 'official' || authorityTier === 'primary') {
    return { status: 'accepted', rejection_reason: null }
  }

  return { status: 'weak', rejection_reason: 'SOURCE_NOT_AUTHORITATIVE' }
}

export function computeFreshnessExpiry(domain: EvidenceDomain, observedAt: string | null): string | null {
  if (!observedAt) return null
  const base = new Date(observedAt)
  if (Number.isNaN(base.getTime())) return null
  base.setUTCDate(base.getUTCDate() + FRESHNESS_DAYS[domain])
  return base.toISOString()
}

export function isExpired(freshnessExpiresAt: string | null, now: Date): boolean {
  if (!freshnessExpiresAt) return false
  return new Date(freshnessExpiresAt).getTime() < now.getTime()
}

export function computeClaimHash(draft: ExtractedEvidenceDraft, sourceIdentity: string): string {
  const canonical = JSON.stringify({
    domain: draft.domain,
    claim_text: draft.claim_text.trim().toLowerCase(),
    normalized_claim: draft.normalized_claim,
    source: sourceIdentity,
  })
  return createHash('sha256').update(canonical).digest('hex')
}

export function createSourceExcerpt(rawText: string, maxLength: number = 280): string {
  const clean = rawText.replace(/\s+/g, ' ').trim()
  return clean.length <= maxLength ? clean : `${clean.slice(0, maxLength - 1)}…`
}

export function buildResearchSummary(items: EvidenceItem[], documentsTotal: number, documentsFailed: number, queriesExecuted: number, resultsFetched: number): ResearchRunSummary {
  return {
    queries_executed: queriesExecuted,
    results_fetched: resultsFetched,
    documents_total: documentsTotal,
    documents_parsed: Math.max(documentsTotal - documentsFailed, 0),
    documents_failed: documentsFailed,
    evidence_accepted: items.filter((item) => item.status === 'accepted').length,
    evidence_weak: items.filter((item) => item.status === 'weak').length,
    evidence_rejected: items.filter((item) => item.status === 'rejected').length,
  }
}

function sortEvidence(items: EvidenceItem[]): EvidenceItem[] {
  const authorityRank: Record<EvidenceAuthorityTier, number> = {
    official: 0,
    primary: 1,
    secondary: 2,
    unknown: 3,
  }

  return [...items].sort((left, right) => {
    const authorityDelta = authorityRank[left.authority_tier] - authorityRank[right.authority_tier]
    if (authorityDelta !== 0) return authorityDelta
    return right.confidence - left.confidence
  })
}

export function buildEvidenceDigest(
  runId: string,
  status: 'success' | 'partial_failed' | 'failed' | 'running',
  items: EvidenceItem[],
): ResearchEvidenceDigest {
  const sorted = sortEvidence(items)
  return {
    run_id: runId,
    status,
    accepted_count: sorted.filter((item) => item.status === 'accepted').length,
    weak_count: sorted.filter((item) => item.status === 'weak').length,
    rejected_count: sorted.filter((item) => item.status === 'rejected').length,
    accepted_items: sorted.filter((item) => item.status === 'accepted'),
    weak_items: sorted.filter((item) => item.status === 'weak'),
  }
}

export function buildResearchContextBlock(digest: ResearchEvidenceDigest | null): string {
  if (!digest) {
    return 'No research evidence is cached for this property yet.'
  }

  if (digest.accepted_count === 0 && digest.weak_count === 0) {
    return 'Research has run for this property, but no usable evidence was accepted yet.'
  }

  const lines = digest.accepted_items.slice(0, 5).map((item, index) => {
    const source = item.source_url ?? item.source_path ?? 'unknown source'
    return `${index + 1}. [${item.domain}] ${item.claim_text} (source: ${item.source_title} — ${source}, authority: ${item.authority_tier})`
  })

  if (lines.length === 0) {
    return 'Only weak research evidence exists for this property. State that evidence is limited.'
  }

  return `Accepted research evidence:\n${lines.join('\n')}`
}

export function buildResearchCitations(digest: ResearchEvidenceDigest | null): ResearchCitation[] {
  if (!digest) return []

  return digest.accepted_items.slice(0, 10).map((item) => ({
    claim: item.claim_text,
    source_title: item.source_title,
    source_url_or_path: item.source_url ?? item.source_path ?? 'unknown source',
    authority_tier: item.authority_tier,
    observed_at: item.observed_at,
  }))
}

export function buildResearchHighlights(digest: ResearchEvidenceDigest | null): string[] {
  if (!digest) return []

  return digest.accepted_items.slice(0, 3).map((item) => item.claim_text)
}

export function buildSeedUrlResults(seedUrls: string[]): SearchResult[] {
  return seedUrls.map((url) => ({
    title: url,
    url,
    snippet: '',
    raw_content: null,
    score: null,
    published_at: null,
  }))
}

export function buildResearchQueries(property: PropertyProfile): string[] {
  const address = property.address_normalized ?? property.address_raw
  const city = property.city ?? ''
  const state = property.state ?? ''
  const developer = property.developer_name?.trim()

  const queries = [
    `"${address}" ${city} ${state} RERA OR approval OR project details`,
    `"${address}" ${city} ${state} litigation OR court OR dispute`,
    `${city} ${state} residential market pricing infrastructure`,
    `${city} ${state} air quality environment property locality`,
  ]

  if (developer) {
    queries.push(`"${developer}" company filings litigation RERA projects`)
  }

  return Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean)))
}
