import { createHash } from 'node:crypto'
import { env } from '../../../config/env'
import { generateWithFallback, GEMINI_MODELS } from '../../../lib/gemini'
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

const PRIMARY_TIER_DOMAINS = [
  'timesofindia.indiatimes.com',
  'economictimes.indiatimes.com',
  'thehindu.com',
  'indianexpress.com',
  'business-standard.com',
  'livemint.com',
  'financialexpress.com',
  'knightfrank.com',
  'jll.co.in',
  'cbre.co.in',
  'anarock.com',
  'propequity.in',
  'cushmanwakefield.com',
  'crisil.com',
  'icra.in',
  'careratings.com',
  'indiaratings.co.in',
  'bseindia.com',
  'nseindia.com',
  'screener.in',
  'zaubacorp.com',
  'tofler.in',
  'liasesforas.com',
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

function recoverJson(text: string): string | null {
  let recovered = text.trim()
  let openBraces = 0, openBrackets = 0, inString = false, escaped = false
  for (let i = 0; i < recovered.length; i++) {
    const ch = recovered[i]
    if (escaped) { escaped = false; continue }
    if (ch === '\\') { escaped = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') openBraces++
    if (ch === '}') openBraces--
    if (ch === '[') openBrackets++
    if (ch === ']') openBrackets--
  }
  if (inString) { recovered += '"' }
  while (openBrackets > 0) { recovered += ']'; openBrackets-- }
  while (openBraces > 0) { recovered += '}'; openBraces-- }
  try { JSON.parse(recovered); return recovered } catch { return null }
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
  const hostname = extractHostname(sourceUrl)
  if (!hostname && !sourcePath) return 'unknown'

  if (hostname) {
    if (
      hostname.endsWith('.gov.in')
      || hostname.endsWith('.nic.in')
      || hostname === 'mca.gov.in'
      || hostname.endsWith('.rera.gov.in')
      || hostname.includes('rera')
      || hostname.includes('ecourts')
      || hostname.includes('consumerhelpline')
      || hostname.includes('ncdrc')
      || hostname.includes('cpcb')
      || hostname.includes('nhb.org')
      || hostname.includes('sebi.gov')
      || hostname.includes('rbi.org')
      || hostname.endsWith('.gov')
    ) {
      return 'official'
    }

    if (PRIMARY_TIER_DOMAINS.some((candidate) => matchesDomain(hostname, candidate))) {
      return 'primary'
    }

    if (allowedDomains.some((candidate) => matchesDomain(hostname, candidate))) {
      return 'primary'
    }
  }

  if (sourcePath) return 'primary'

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

  if (authorityTier === 'official') {
    return { status: 'accepted', rejection_reason: null }
  }

  if (authorityTier === 'primary' && confidence >= 0.40) {
    return { status: 'accepted', rejection_reason: null }
  }

  if (authorityTier === 'secondary' && confidence >= 0.55) {
    return { status: 'accepted', rejection_reason: null }
  }

  if (confidence >= 0.25) {
    return { status: 'weak', rejection_reason: null }
  }

  return { status: 'rejected', rejection_reason: 'SOURCE_NOT_AUTHORITATIVE' }
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

export interface ResearchQuery {
  query: string
  rationale: string
  domain_hint?: string | null
  authority_tier: EvidenceAuthorityTier
}

export async function generateSmartQueries(property: PropertyProfile): Promise<ResearchQuery[]> {
  const city = property.city ?? ''
  const state = property.state ?? ''
  const developer = property.developer_name?.trim() ?? ''
  const address = property.address_normalized ?? property.address_raw

  const systemPrompt = `You are the CRUX Research Strategist — the intelligence behind India's most advanced property research engine. Your job is to think like an investigative journalist, a property lawyer, and a financial analyst simultaneously.

For a given property, generate 8-12 search queries that would uncover intelligence that:
1. No competitor would think to search for
2. Reveals risks or opportunities hidden from public listings
3. Comes from authoritative government or institutional sources
4. Provides specific, verifiable, data-backed claims

Categories (generate at least 1 query per category):
- DEVELOPER INTEGRITY: Past project delays, RERA complaints, consumer court cases, financial health
- LOCALITY INTELLIGENCE: Upcoming infrastructure (metro, highways), crime statistics, flooding/waterlogging history
- MARKET DYNAMICS: Oversupply indicators, absorption rates, price trends, rental yield data
- LEGAL RISKS: Land title disputes, environmental clearance status, building plan approvals, occupancy certificate
- ENVIRONMENTAL: AQI trends over time, groundwater levels, seismic zone, flood plain mapping
- HIDDEN RISKS: Community opposition, litigation by neighboring societies, political connections

For each query, provide:
- "query": the exact search query string
- "rationale": a brief explanation of what hidden intelligence this would uncover
- "domain_hint": restrict to specific authoritative domains (e.g. "site:gujrera.gujarat.gov.in") or null
- "authority_tier": "official"|"primary"|"secondary" based on expected source quality

OUTPUT: Valid JSON array only. No other text.`

  const userPrompt = `
PROPERTY CONTEXT:
${JSON.stringify({
  address,
  city,
  state,
  pin_code: property.pin_code,
  property_type: property.property_type,
  developer_name: developer || null,
}, null, 2)}

Generate 8-12 creative, high-signal search queries for this property.
Respond with ONLY a JSON array — no markdown, no explanation.`

  try {
    const raw = await generateWithFallback({
      model: GEMINI_MODELS.RESEARCH_AGENT,
      systemInstruction: systemPrompt,
      prompt: userPrompt,
      temperature: 0.7,
      maxOutputTokens: 8192,
    })
    const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    let parsed: unknown
    try {
      parsed = JSON.parse(clean)
    } catch {
      const recovered = recoverJson(clean)
      if (recovered) {
        parsed = JSON.parse(recovered)
      } else {
        throw new Error('GEMINI_INVALID_JSON')
      }
    }

    if (!Array.isArray(parsed)) return buildResearchQueries(property).map(q => ({ query: q, rationale: '', authority_tier: 'secondary' as EvidenceAuthorityTier }))

    const queries: ResearchQuery[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      const query = typeof record.query === 'string' ? record.query.trim() : ''
      if (!query || query.length < 5) continue

      const tier = typeof record.authority_tier === 'string' && ['official', 'primary', 'secondary'].includes(record.authority_tier)
        ? record.authority_tier as EvidenceAuthorityTier
        : 'secondary'

      queries.push({
        query,
        rationale: typeof record.rationale === 'string' ? record.rationale : '',
        domain_hint: typeof record.domain_hint === 'string' ? record.domain_hint : null,
        authority_tier: tier,
      })
    }

    if (queries.length === 0) {
      return buildResearchQueries(property).map(q => ({ query: q, rationale: '', authority_tier: 'secondary' as EvidenceAuthorityTier }))
    }

    return queries.slice(0, 12)
  } catch (error) {
    const errMsg = (error as Error)?.message?.slice(0, 100) ?? 'unknown'
    console.warn(`[research.policy] Gemini query generation failed (${errMsg}), retrying with Kimi K2.6...`)
    
    try {
      const raw = await generateWithFallback({
        model: GEMINI_MODELS.RESEARCH_AGENT,
        systemInstruction: systemPrompt,
        prompt: userPrompt,
        temperature: 0.7,
        maxOutputTokens: 8192,
      })
      const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
      let parsed: unknown
      try {
        parsed = JSON.parse(clean)
      } catch {
        const recovered = recoverJson(clean)
        if (recovered) parsed = JSON.parse(recovered)
        else throw new Error('KIMI_INVALID_JSON')
      }

      if (Array.isArray(parsed)) {
        const queries: ResearchQuery[] = []
        for (const item of parsed) {
          if (!item || typeof item !== 'object') continue
          const record = item as Record<string, unknown>
          const query = typeof record.query === 'string' ? record.query.trim() : ''
          if (!query || query.length < 5) continue
          const tier = typeof record.authority_tier === 'string' && ['official', 'primary', 'secondary'].includes(record.authority_tier)
            ? record.authority_tier as EvidenceAuthorityTier : 'secondary'
          queries.push({ query, rationale: typeof record.rationale === 'string' ? record.rationale : '', domain_hint: typeof record.domain_hint === 'string' ? record.domain_hint : null, authority_tier: tier })
        }
        if (queries.length > 0) {
          console.log('[research.policy] Kimi K2.6 generated', queries.length, 'smart queries')
          return queries.slice(0, 12)
        }
      }
    } catch (kimiError) {
      console.warn('[research.policy] Kimi K2.6 also failed:', (kimiError as Error)?.message?.slice(0, 100))
    }
    
    return buildResearchQueries(property).map(q => ({ query: q, rationale: '', authority_tier: 'secondary' as EvidenceAuthorityTier }))
  }
}

export function buildResearchQueries(property: PropertyProfile): string[] {
  const city = property.city ?? ''
  const state = property.state ?? ''
  const developer = property.developer_name?.trim()

  const queries = [
    `${city} ${state} ${developer ? developer + ' ' : ''}RERA project registration approval`,
    `${city} ${state} residential real estate market pricing 2025`,
    `${city} ${state} infrastructure development metro transport`,
    `${developer ? developer + ' ' : ''}${city} builder complaints reviews delivery`,
    `${city} ${state} air quality environment pollution`,
  ]

  if (developer) {
    queries.push(`${developer} company CIN registration RERA projects`)
  }

  return Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean)))
}
