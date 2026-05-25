import { geminiClient, GEMINI_MODELS } from '../../../lib/gemini'
import type { EvidenceItem, PropertyProfile, VerificationStatus } from '../shared/types'

export interface VerificationAssessment {
  verification_status: VerificationStatus
  verifier_confidence: number
  support_score: number
  contradiction_score: number
  supporting_evidence_ids: string[]
  contradicting_evidence_ids: string[]
  verification_notes: string | null
}

export interface EvidenceVerifier {
  verifyEvidence(params: {
    property: PropertyProfile
    evidence: EvidenceItem
    peers: EvidenceItem[]
    deterministic: {
      direct_match: boolean
      freshness_ok: boolean
      supporting_evidence_ids: string[]
      contradicting_evidence_ids: string[]
      support_score: number
      contradiction_score: number
    }
  }): Promise<VerificationAssessment>
}

function buildSystemPrompt(): string {
  return `
You are the CRUX Verification Agent.

Your job is to verify whether a candidate evidence item is supported, contradicted, inconclusive, or stale when compared with the property context and peer evidence.

Rules:
1. Output ONLY valid JSON. No markdown fences.
2. Use an internal ReAct-style loop:
   - Observe the candidate evidence and peer evidence
   - Check direct relevance to the property
   - Check support and contradiction signals
   - Decide the final verification status
   Do not output the hidden reasoning.
3. Allowed verification_status values: verified, contradicted, inconclusive, stale.
4. Prefer "inconclusive" over overclaiming.
5. If evidence is clearly outdated, use "stale".
6. Include only evidence item IDs that were explicitly provided in the peer list.
`.trim()
}

function buildUserPrompt(params: {
  property: PropertyProfile
  evidence: EvidenceItem
  peers: EvidenceItem[]
  deterministic: {
    direct_match: boolean
    freshness_ok: boolean
    supporting_evidence_ids: string[]
    contradicting_evidence_ids: string[]
    support_score: number
    contradiction_score: number
  }
}): string {
  return `
PROPERTY CONTEXT:
${JSON.stringify({
  address: params.property.address_normalized ?? params.property.address_raw,
  city: params.property.city,
  state: params.property.state,
  property_type: params.property.property_type,
  developer_name: params.property.developer_name ?? null,
}, null, 2)}

CANDIDATE EVIDENCE:
${JSON.stringify({
  id: params.evidence.id,
  domain: params.evidence.domain,
  claim_text: params.evidence.claim_text,
  authority_tier: params.evidence.authority_tier,
  status_from_research: params.evidence.status,
  normalized_claim: params.evidence.normalized_claim,
  source_title: params.evidence.source_title,
  source_url: params.evidence.source_url,
  source_path: params.evidence.source_path,
  excerpt: params.evidence.excerpt,
  observed_at: params.evidence.observed_at,
  freshness_expires_at: params.evidence.freshness_expires_at,
  confidence: params.evidence.confidence,
}, null, 2)}

DETERMINISTIC SIGNALS:
${JSON.stringify(params.deterministic, null, 2)}

PEER EVIDENCE:
${JSON.stringify(params.peers.map((peer) => ({
  id: peer.id,
  domain: peer.domain,
  claim_text: peer.claim_text,
  normalized_claim: peer.normalized_claim,
  authority_tier: peer.authority_tier,
  source_title: peer.source_title,
  observed_at: peer.observed_at,
})), null, 2)}

Respond with:
{
  "verification_status": "verified | contradicted | inconclusive | stale",
  "verifier_confidence": 0.0,
  "support_score": 0.0,
  "contradiction_score": 0.0,
  "supporting_evidence_ids": ["..."],
  "contradicting_evidence_ids": ["..."],
  "verification_notes": "short explanation"
}
`.trim()
}

const ALLOWED_STATUSES: VerificationStatus[] = ['verified', 'contradicted', 'inconclusive', 'stale']

export class GeminiEvidenceVerifier implements EvidenceVerifier {
  async verifyEvidence(params: {
    property: PropertyProfile
    evidence: EvidenceItem
    peers: EvidenceItem[]
    deterministic: {
      direct_match: boolean
      freshness_ok: boolean
      supporting_evidence_ids: string[]
      contradicting_evidence_ids: string[]
      support_score: number
      contradiction_score: number
    }
  }): Promise<VerificationAssessment> {
    const model = geminiClient.getGenerativeModel({
      model: GEMINI_MODELS.VERIFICATION_AGENT,
      systemInstruction: buildSystemPrompt(),
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
      },
    })

    const result = await model.generateContent(buildUserPrompt(params))
    const raw = result.response.text().trim()
    const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(clean) as Record<string, unknown>

    const status = typeof parsed.verification_status === 'string' && ALLOWED_STATUSES.includes(parsed.verification_status as VerificationStatus)
      ? parsed.verification_status as VerificationStatus
      : 'inconclusive'

    const supportingIds = Array.isArray(parsed.supporting_evidence_ids)
      ? parsed.supporting_evidence_ids.filter((value): value is string => typeof value === 'string')
      : []
    const contradictingIds = Array.isArray(parsed.contradicting_evidence_ids)
      ? parsed.contradicting_evidence_ids.filter((value): value is string => typeof value === 'string')
      : []

    return {
      verification_status: status,
      verifier_confidence: typeof parsed.verifier_confidence === 'number' ? parsed.verifier_confidence : 0.5,
      support_score: typeof parsed.support_score === 'number' ? parsed.support_score : params.deterministic.support_score,
      contradiction_score: typeof parsed.contradiction_score === 'number' ? parsed.contradiction_score : params.deterministic.contradiction_score,
      supporting_evidence_ids: supportingIds,
      contradicting_evidence_ids: contradictingIds,
      verification_notes: typeof parsed.verification_notes === 'string' ? parsed.verification_notes : null,
    }
  }
}
