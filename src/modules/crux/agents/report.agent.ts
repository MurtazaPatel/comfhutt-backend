import { geminiClient, GEMINI_MODELS, REPORT_CONFIG } from '../../../lib/gemini'
import { supabase } from '../../../lib/db'
import { AppError } from '../shared/errors'
import { getOrComputeScore } from '../scoring'
import { getCachedReport, saveReport, CruxReportRow } from '../report/report.service'
import { getLatestResearch } from './research.agent'
import { buildResearchCitations, buildResearchContextBlock, buildResearchHighlights } from '../research'
import type { IntentProfile, LifecycleStage, MacroCycle } from '../shared/types'

const SEBI_DISCLAIMER =
  'This report is generated for property research purposes only. ' +
  'It does not constitute financial, investment, or legal advice. ' +
  'CRUX is not a SEBI-registered Investment Adviser. ' +
  'Past performance and data-based analysis do not guarantee future outcomes. ' +
  'Consult a registered financial advisor before making any investment decision.'

function buildReportSystemPrompt(): string {
  return `
You are CRUX Report, the narrative analysis engine for ComfHutt's property intelligence platform.

Your job is to translate structured property scoring data into clear, honest, plain-language analysis for Indian retail property buyers and investors.

STRICT RULES — follow without exception:
1. NEVER mention specific weights, percentages, or numerical formulas used in scoring. The methodology is proprietary. You may say "multiple verified data sources" or "our analysis" but never "location is weighted at 30%".
2. NEVER make buy/sell/hold recommendations. Never say "this is a good investment" or "you should buy". Describe facts only.
3. NEVER fabricate data. If a data source was unavailable, acknowledge the gap honestly: "Court records data was unavailable for this analysis."
4. ALWAYS cite data sources by name (eCourts, MCA21, CPCB, NHB RESIDEX, CPWD, Google Maps). This is what makes CRUX credible.
5. ALWAYS write in plain English a non-expert Indian investor can understand. No jargon.
6. ALWAYS structure your response as valid JSON matching the schema provided.
7. NEVER include the SEBI disclaimer in your output — it is appended separately by the system.
8. Use a quiet ReAct-style process internally: inspect the score and evidence, check for gaps or contradictions, then write the final JSON. Never output the internal reasoning.

Tone: professional, direct, honest. Like a knowledgeable friend who happens to understand property data — not a salesperson, not a lawyer.
`.trim()
}

function buildReportUserPrompt(
  property: {
    address: string
    city: string
    state: string
    pin_code: string
    property_type: string
  },
  score: {
    score_composite: number
    score_breakdown: Record<string, unknown>
    confidence_score: number
    data_sources_used: string[]
    degraded: boolean
    intent_profile: string
    lifecycle_stage: string
    macro_cycle: string
  },
  researchContext: string
): string {
  return `
Generate a CRUX property analysis report for the following property and score data.

PROPERTY:
${JSON.stringify(property, null, 2)}

CRUX SCORE DATA:
- Composite Score: ${score.score_composite}/100
- Confidence: ${(score.confidence_score * 100).toFixed(0)}%
- Intent Profile: ${score.intent_profile}
- Lifecycle Stage: ${score.lifecycle_stage}
- Macro Market Cycle: ${score.macro_cycle}
- Data Sources Used: ${score.data_sources_used.join(', ')}
- Degraded Data: ${score.degraded ? 'Yes — some sources were unavailable' : 'No'}
- Score Breakdown: ${JSON.stringify(score.score_breakdown, null, 2)}

RESEARCH EVIDENCE:
${researchContext}

Respond ONLY with a valid JSON object matching this exact schema — no preamble, no markdown fences:
{
  "summary": "2-3 sentence overall plain-language summary of this property's credibility profile",
  "category_narratives": {
    "legal_title": "1-2 sentences on legal/title integrity based on eCourts and MCA21 data",
    "location_quality": "1-2 sentences on location quality based on AQI, satellite, POI data",
    "developer_reliability": "1-2 sentences on developer credibility based on MCA21 data",
    "market_valuation": "1-2 sentences on pricing vs market based on NHB RESIDEX and CPWD",
    "demand_signals": "1-2 sentences on demand signals based on Google Maps and market data"
  },
  "risk_flags": [
    "Plain-language risk statement 1",
    "Plain-language risk statement 2",
    "Plain-language risk statement 3"
  ],
  "positive_signals": [
    "Plain-language positive statement 1",
    "Plain-language positive statement 2",
    "Plain-language positive statement 3"
  ],
  "research_highlights": [
    "Optional evidence-backed research highlight 1",
    "Optional evidence-backed research highlight 2"
  ]
}

Rules for risk_flags and positive_signals:
- 3 items minimum, 5 maximum each
- Each statement must be specific to THIS property's data — never generic
- Risk flags must be honest even if unflattering — credibility depends on it
- If confidence is below 0.5, include a risk flag noting data gaps
- research_highlights may be empty if no accepted research evidence exists
`.trim()
}

export function buildReportRow(params: {
  propertyId: string
  scoreId: string
  intent: string
  parsed: {
    summary: string
    category_narratives: CruxReportRow['category_narratives']
    risk_flags: string[]
    positive_signals: string[]
    research_highlights?: string[]
  }
  research: Awaited<ReturnType<typeof getLatestResearch>>
  cruxVersion: string
}): Omit<CruxReportRow, 'id'> {
  return {
    property_id: params.propertyId,
    score_id: params.scoreId,
    intent_profile: params.intent,
    summary: params.parsed.summary,
    category_narratives: params.parsed.category_narratives,
    risk_flags: params.parsed.risk_flags.slice(0, 5),
    positive_signals: params.parsed.positive_signals.slice(0, 5),
    research_highlights: Array.isArray(params.parsed.research_highlights)
      ? params.parsed.research_highlights.slice(0, 5)
      : buildResearchHighlights(params.research?.digest ?? null),
    citations: buildResearchCitations(params.research?.digest ?? null),
    sebi_disclaimer: SEBI_DISCLAIMER,
    crux_version: params.cruxVersion,
    generated_at: new Date().toISOString(),
    ttl_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }
}

export async function generateReport(propertyId: string, intent: string = 'balanced'): Promise<CruxReportRow> {
  const startTime = Date.now()

  // 1. Check cache first
  const cached = await getCachedReport(propertyId, intent)
  if (cached) return cached

  // 2. Fetch property
  const { data: property, error: propError } = await supabase
    .from('crux_properties')
    .select('*')
    .eq('id', propertyId)
    .maybeSingle()

  if (propError || !property) {
    throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found.')
  }

  // 3. Get or compute score
  const score = await getOrComputeScore(
    propertyId,
    intent as IntentProfile,
    'delivered' as LifecycleStage,
    'growth' as MacroCycle
  )

  const research = await getLatestResearch(propertyId)
  const researchContext = buildResearchContextBlock(research?.digest ?? null)

  // 4. Build prompts
  const systemPrompt = buildReportSystemPrompt()
  const userPrompt = buildReportUserPrompt(
    {
      address: property.address_normalized,
      city: property.city,
      state: property.state,
      pin_code: property.pin_code,
      property_type: property.property_type,
    },
    {
      score_composite: score.score_composite,
      score_breakdown: score.score_breakdown as unknown as Record<string, unknown>,
      confidence_score: score.confidence_score,
      data_sources_used: score.data_sources_used,
      degraded: score.degraded,
      intent_profile: intent,
      lifecycle_stage: score.lifecycle_stage ?? 'delivered',
      macro_cycle: score.macro_cycle ?? 'growth',
    },
    researchContext,
  )

  // 5. Call Gemini — non-streaming, JSON output
  const model = geminiClient.getGenerativeModel({
    model: GEMINI_MODELS.REPORT_AGENT,
    systemInstruction: systemPrompt,
    generationConfig: {
      maxOutputTokens: REPORT_CONFIG.maxOutputTokens,
      temperature: REPORT_CONFIG.temperature,
    },
  })

  const result = await model.generateContent(userPrompt)
  const rawText = result.response.text().trim()

  // 6. Parse JSON response — strip markdown fences if present
  let parsed: {
    summary: string
    category_narratives: CruxReportRow['category_narratives']
    risk_flags: string[]
    positive_signals: string[]
    research_highlights?: string[]
  }

  try {
    const clean = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    parsed = JSON.parse(clean)
  } catch {
    throw new AppError(500, 'REPORT_PARSE_FAILED', 'Report generation produced invalid JSON. Try again.')
  }

  // 7. Validate required fields
  if (
    !parsed.summary ||
    !parsed.category_narratives ||
    !Array.isArray(parsed.risk_flags) ||
    !Array.isArray(parsed.positive_signals)
  ) {
    throw new AppError(500, 'REPORT_PARSE_FAILED', 'Report response missing required fields.')
  }

  // 8. Assemble final report row
  const reportData = buildReportRow({
    propertyId,
    scoreId: score.id ?? '',
    intent,
    parsed,
    research,
    cruxVersion: score.crux_version,
  })

  // 9. Save to cache
  const saved = await saveReport(reportData)

  // 10. Write agent log (non-blocking)
  supabase.from('crux_agent_logs').insert({
    agent_type: 'report',
    property_id: propertyId,
    input_payload: { intent, score_composite: score.score_composite, research_accepted: research?.digest.accepted_count ?? 0 },
    output_payload: {
      risk_flags: saved.risk_flags.length,
      positive_signals: saved.positive_signals.length,
      research_highlights: saved.research_highlights.length,
    },
    latency_ms: Date.now() - startTime,
    llm_provider: 'gemini',
    tokens_used: null,
    status: 'success',
  }).then(({ error }: { error: unknown }) => {
    if (error) console.error('[report.agent] log write failed:', error)
  })

  return saved
}
