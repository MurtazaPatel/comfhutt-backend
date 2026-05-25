import { geminiClient, GEMINI_MODELS } from '../../../lib/gemini'
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
You are the CRUX Research Evidence Extractor.

Your only job is to extract verifiable property research evidence from grounded source text.

Rules:
1. Output ONLY valid JSON. No markdown fences.
2. Output an array of objects.
3. Each object must contain:
   - domain: one of property, developer, locality, market, legal, environment
   - claim_text: a precise factual statement grounded in the source text
   - normalized_claim: a compact JSON object with the core fact fields
   - observed_at: ISO timestamp if the source explicitly implies one, otherwise null
   - confidence: number between 0 and 1
4. Do not infer facts that are not explicitly supported.
5. Do not produce generic advice or recommendations.
6. If the text does not contain usable evidence, return [].
7. Use an internal ReAct-style loop:
   - Observe the source text
   - Check whether each fact is explicit and source-grounded
   - Extract only the facts that survive that check
   Your final output must still be JSON only with no reasoning text.
`.trim()
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
    const model = geminiClient.getGenerativeModel({
      model: GEMINI_MODELS.RESEARCH_AGENT,
      systemInstruction: buildSystemPrompt(),
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
      },
    })

    const result = await model.generateContent(buildUserPrompt(params))
    const raw = result.response.text().trim()
    const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(clean) as unknown

    if (!Array.isArray(parsed)) return []

    const drafts: ExtractedEvidenceDraft[] = []

    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      const domain = typeof record.domain === 'string' ? record.domain : ''
      if (!VALID_DOMAINS.includes(domain as EvidenceDomain)) continue

      drafts.push({
        domain: domain as EvidenceDomain,
        claim_text: typeof record.claim_text === 'string' ? record.claim_text : '',
        normalized_claim: typeof record.normalized_claim === 'object' && record.normalized_claim
          ? record.normalized_claim as Record<string, unknown>
          : {},
        observed_at: typeof record.observed_at === 'string' ? record.observed_at : null,
        confidence: typeof record.confidence === 'number' ? record.confidence : 0,
      })
    }

    return drafts
  }
}
