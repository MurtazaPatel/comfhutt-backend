import { generate, safeJsonParse, safeJsonExtractArray } from '../../../lib/llm'
import type { EvidenceDomain, ExtractedEvidenceDraft, PropertyProfile } from '../shared/types'

export interface ResearchExtractor {
  extractEvidence(params: {
    property: PropertyProfile
    sourceTitle: string
    sourceUrl: string | null
    sourcePath: string | null
    text: string
    observedAt: string | null
  }): Promise<ExtractedEvidenceDraft[]>
}

const VALID_DOMAINS: EvidenceDomain[] = [
  'property',
  'developer',
  'locality',
  'market',
  'legal',
  'environment',
]

function buildSystemPrompt(): string {
  return `
You are the CRUX Research Evidence Extractor. Your job is to find and extract ANY factual information from source text that could be relevant to evaluating a property.

Rules:
1. Output ONLY valid JSON. No markdown fences.
2. Output an array of 1-5 objects. Extract as many facts as you can find.
3. Each object must contain:
   - domain: one of property, developer, locality, market, legal, environment
   - claim_text: a precise factual statement grounded in the source text
   - normalized_claim: a compact JSON object with core fact fields (numbers, dates, names, statuses)
   - observed_at: ISO timestamp if the source explicitly implies one, otherwise null
   - confidence: number between 0 and 1 based on how directly the source supports the claim
4. Be aggressive — extract ANY factual data that could relate to the property, its developer, its city, or its state, even indirectly.
5. Examples of good claims:
   - "Ahmedabad HPI shows 2.2% QoQ growth in Dec 2025" → domain: market, normalized: {city: "Ahmedabad", hpi_qoq: 2.2, period: "Dec 2025"}
   - "Shivalik Developers registered under RERA MAA07768" → domain: developer, normalized: {developer: "Shivalik", rera_id: "MAA07768"}
   - "Gujarat construction cost tier-1 is 2800 per sqft" → domain: market, normalized: {state: "Gujarat", cost_per_sqft: 2800, tier: "tier1"}
   - "Bodakdev locality has metro connectivity planned for 2026" → domain: locality, normalized: {locality: "Bodakdev", metro_planned: "2026"}
   - "Developer has 3 pending RERA complaints for delayed possession" → domain: legal, normalized: {developer: "...", pending_complaints: 3, type: "delayed possession"}
6. For generic portal pages (RERA, government sites), extract facts about the regulatory framework, available data, recent circulars, or any numeric/metric data present.
7. If the text mentions the property's city, state, developer, or similar locations, extract ALL related facts.
8. Never fabricate — only extract what is explicitly present. But don't be too conservative — if a page about Gujarat RERA mentions Ahmedabad developers, that IS relevant.`.trim()
}

function buildUserPrompt(params: {
  property: PropertyProfile
  sourceTitle: string
  sourceUrl: string | null
  sourcePath: string | null
  text: string
  observedAt: string | null
}): string {
  return `
PROPERTY CONTEXT:
${JSON.stringify({
  address: params.property.address_normalized ?? params.property.address_raw,
  city: params.property.city,
  state: params.property.state,
  pin_code: params.property.pin_code,
  property_type: params.property.property_type,
  developer_name: params.property.developer_name ?? null,
}, null, 2)}

SOURCE METADATA:
${JSON.stringify({
  source_title: params.sourceTitle,
  source_url: params.sourceUrl,
  source_path: params.sourcePath,
  observed_at: params.observedAt,
}, null, 2)}

SOURCE TEXT:
${params.text}
`.trim()
}

export class GeminiResearchExtractor implements ResearchExtractor {
  async extractEvidence(params: {
    property: PropertyProfile
    sourceTitle: string
    sourceUrl: string | null
    sourcePath: string | null
    text: string
    observedAt: string | null
  }): Promise<ExtractedEvidenceDraft[]> {
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const raw = await generate({
          strategy: 'reasoning',
          systemInstruction: buildSystemPrompt(),
          prompt: buildUserPrompt(params),
          temperature: attempt === 0 ? 0.2 : 0.4,
          maxOutputTokens: 8192,
        })
        const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()

        let parsed = safeJsonParse<unknown>(clean)
        if (!Array.isArray(parsed)) {
          const partial = safeJsonExtractArray(clean)
          if (partial.length > 0) {
            parsed = partial
          } else if (attempt < 2) {
            throw new Error('JSON_RECOVERY_FAILED')
          } else {
            return []
          }
        }

        if (!Array.isArray(parsed)) return []

        const drafts: ExtractedEvidenceDraft[] = []
        for (const item of parsed) {
          if (!item || typeof item !== 'object') continue
          const record = item as Record<string, unknown>
          const domain = typeof record.domain === 'string' ? record.domain : ''
          if (!VALID_DOMAINS.includes(domain as EvidenceDomain)) continue

          const draft: ExtractedEvidenceDraft = {
            domain: domain as EvidenceDomain,
            claim_text: typeof record.claim_text === 'string' ? record.claim_text : '',
            normalized_claim: typeof record.normalized_claim === 'object' && record.normalized_claim
              ? record.normalized_claim as Record<string, unknown>
              : {},
            observed_at: typeof record.observed_at === 'string' ? record.observed_at : null,
            confidence: typeof record.confidence === 'number' ? record.confidence : 0.5,
          }
          if (draft.claim_text.length >= 10) drafts.push(draft)
        }

        if (drafts.length > 0) return drafts
        if (attempt < 2) throw new Error('EMPTY_EXTRACTION')
        return []
      } catch (error) {
        const msg = (error as Error)?.message?.slice(0, 100) ?? 'unknown'
        if (attempt === 2) { console.warn(`[extractor] exhausted: ${msg}`); return [] }
        const waitMs = 2000 * Math.pow(2, attempt)
        console.warn(`[extractor] attempt ${attempt + 1} failed (${msg}), retrying in ${waitMs}ms`)
        await new Promise(resolve => setTimeout(resolve, waitMs))
      }
    }
    return []
  }
}
