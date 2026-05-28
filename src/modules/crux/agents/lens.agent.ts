import type { Response } from 'express'
import { type Content, type Tool, type Part, SchemaType } from '@google/generative-ai'
import { geminiClient, LENS_CONFIG, GEMINI_MODELS } from '../../../lib/gemini'
import { supabase } from '../../../lib/db'
import { AppError } from '../shared/errors'
import {
  getSession,
  refreshSession,
  getMessageHistory,
  saveMessages,
  checkMessageLimit,
} from '../lens/lens.service'
import { getOrComputeScore } from '../scoring'
import { getLatestResearch, runResearch } from './research.agent'
import { buildResearchContextBlock } from '../research'
import { getLatestVerification, runVerification } from './verification.agent'
import { buildVerificationContextBlock } from '../verification'
import type { CruxScore } from '../shared/types'

interface PropertyRow {
  id: string
  address_raw: string
  address_normalized: string | null
  geocode_lat: number | null
  geocode_lng: number | null
  pin_code: string | null
  city: string | null
  state: string | null
  property_type: string | null
  approx_size_sqft: number | null
  research_context?: string
  verification_context?: string
}

function buildSystemPrompt(property: PropertyRow, score: CruxScore | null): string {
  return `
## LAYER 1 — ROLE
You are CRUX Lens, the AI property research assistant for ComfHutt. You help users understand any Indian property through rigorous, data-driven analysis. You are precise, honest, and cite data sources by name. You never fabricate data. If a data source is unavailable, you say so explicitly.
Work in a lightweight ReAct style internally: reason briefly from the current context, decide whether a tool is needed, use the tool if needed, then answer from the observed result. Do not expose hidden reasoning steps to the user.

## LAYER 2 — PROPERTY CONTEXT
You are analyzing this property:
${JSON.stringify({
  address: property.address_normalized ?? property.address_raw,
  city: property.city,
  state: property.state,
  pin_code: property.pin_code,
  property_type: property.property_type,
  coordinates: { lat: property.geocode_lat, lng: property.geocode_lng }
}, null, 2)}

## LAYER 3 — CRUX SCORE CONTEXT
${score ? `
CRUX Score for this property (intent: ${score.intent_profile}):
- Composite Score: ${score.score_composite}/100
- Confidence: ${(score.confidence_score * 100).toFixed(0)}%
- Score Breakdown: ${JSON.stringify(score.score_breakdown, null, 2)}
- Data Sources Used: ${score.data_sources_used.join(', ')}
- Verified Evidence Used: ${score.verified_evidence_used ?? 0} items
- Scored At: ${score.created_at}
- CRUX Version: ${score.crux_version}
` : `
No CRUX Score has been computed for this property yet. If the user asks about the score, you can offer to trigger one by using the triggerScore function tool.
`}

## LAYER 3D — SCORING METHODOLOGY (transparency layer)
${score?.weight_adjustments?.length ? `
The CRUX Score for this property incorporates the following evidence-backed weight adjustments:
${score.weight_adjustments.map(a => `- ${a.category}: weight shifted by ${a.delta > 0 ? '+' : ''}${a.delta.toFixed(3)} because ${a.reason}`).join('\n')}
` : `
No evidence-backed weight adjustments were applied for this property.
`}

## LAYER 3B — RESEARCH EVIDENCE CONTEXT
${property.research_context ?? 'No research evidence is cached for this property yet. Use triggerResearch when the user wants deeper evidence-backed research.'}

## LAYER 3C — VERIFICATION CONTEXT
${property.verification_context ?? 'No verification run is cached for this property yet. Use triggerVerification when the user wants confirmed or contradicted evidence.'}

## LAYER 4 — AVAILABLE TOOLS
You have access to these functions to assist users:
- triggerScore: Compute or refresh the CRUX Score for this property
- triggerResearch: Run or refresh CRUX Research evidence for this property
- triggerVerification: Verify the current research evidence for this property
- triggerCast: Get CRUX Cast (AI property valuation — fair market value range)
- triggerYield: Get CRUX Yield (rental income estimate and yield percentage)
- askClarification: Ask the user for a missing data point that would improve scoring accuracy

Use these tools proactively when the user's question requires live data. Do not ask the user to navigate elsewhere — bring the data into the conversation.

## LAYER 5 — HARD GUARDRAILS (NON-NEGOTIABLE)
⚠️ This analysis is for property research purposes only. It is NOT financial or investment advice. You are NOT a SEBI-registered Investment Adviser. Do not make buy/sell/hold recommendations for any property. Do not make predictions about future price appreciation. When asked for investment advice, redirect to research facts and remind the user to consult a registered financial advisor. This guardrail applies to every single response — never remove it or soften it.
`.trim()
}

const LENS_TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'triggerScore',
        description: 'Compute or retrieve the CRUX Score for the current property. Use when the user asks about the property rating, credibility score, or wants a full breakdown.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            intent: {
              type: SchemaType.STRING,
              format: 'enum',
              description: 'Investment intent: yield, appreciation, or balanced',
              enum: ['yield', 'appreciation', 'balanced']
            }
          },
          required: []
        }
      },
      {
        name: 'triggerResearch',
        description: 'Run or refresh CRUX Research for the current property. Use when the user wants citations, evidence-backed analysis, or deeper research.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            seed_urls: {
              type: SchemaType.ARRAY,
              description: 'Optional authoritative URLs to inspect first',
              items: { type: SchemaType.STRING }
            },
            document_paths: {
              type: SchemaType.ARRAY,
              description: 'Optional server-accessible document paths to parse',
              items: { type: SchemaType.STRING }
            },
            force_refresh: {
              type: SchemaType.BOOLEAN,
              description: 'Whether to bypass the current research cache'
            }
          },
          required: []
        }
      },
      {
        name: 'triggerVerification',
        description: 'Run or refresh CRUX Verification for the current property. Use when the user wants confirmed evidence, contradiction checks, or higher-confidence grounded analysis.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            force_refresh: {
              type: SchemaType.BOOLEAN,
              description: 'Whether to bypass the current verification cache'
            }
          },
          required: []
        }
      },
      {
        name: 'triggerCast',
        description: 'Get CRUX Cast — AI-powered property valuation using 3-method triangulation (Income Capitalization, Sales Comparable, Replacement Cost). Use when user asks about fair value, market price, or property worth.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {},
          required: []
        }
      },
      {
        name: 'triggerYield',
        description: 'Get CRUX Yield — rental income estimate and yield percentage. Use when user asks about rental income, rental returns, or expected yield.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {},
          required: []
        }
      },
      {
        name: 'askClarification',
        description: 'Ask the user for a specific data point that is missing and would improve scoring accuracy. Use when the scoring engine flagged missing parameters.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            question: {
              type: SchemaType.STRING,
              description: 'The specific question to ask the user'
            },
            parameter_name: {
              type: SchemaType.STRING,
              description: 'The internal parameter name this clarification addresses'
            }
          },
          required: ['question', 'parameter_name']
        }
      }
    ]
  }
]

export function createLensToolExecutor(deps: {
  getScore?: typeof getOrComputeScore
  runResearchFn?: typeof runResearch
  runVerificationFn?: typeof runVerification
} = {}) {
  const getScore = deps.getScore ?? getOrComputeScore
  const runResearchFn = deps.runResearchFn ?? runResearch
  const runVerificationFn = deps.runVerificationFn ?? runVerification

  return async function executeTool(
    toolName: string,
    toolArgs: Record<string, unknown>,
    propertyId: string
  ): Promise<{ result: unknown; moduleType: string | null }> {
    switch (toolName) {
      case 'triggerScore': {
        const intent = (toolArgs.intent as string) || 'balanced'
        const score = await getScore(
          propertyId,
          intent as 'yield' | 'appreciation' | 'balanced',
          'delivered',
          'growth'
        )
        return { result: score, moduleType: 'score' }
      }
      case 'triggerResearch': {
        const research = await runResearchFn({
          property_id: propertyId,
          seed_urls: Array.isArray(toolArgs.seed_urls) ? toolArgs.seed_urls as string[] : [],
          document_paths: Array.isArray(toolArgs.document_paths) ? toolArgs.document_paths as string[] : [],
          force_refresh: Boolean(toolArgs.force_refresh),
          surface: 'lens',
        })
        return { result: research, moduleType: 'research' }
      }
      case 'triggerVerification': {
        const verification = await runVerificationFn({
          property_id: propertyId,
          force_refresh: Boolean(toolArgs.force_refresh),
          surface: 'lens',
        })
        return { result: verification, moduleType: 'verification' }
      }
      case 'triggerCast': {
        return {
          result: { status: 'coming_soon', message: 'CRUX Cast is launching soon. Score and Lens are live now.' },
          moduleType: 'cast'
        }
      }
      case 'triggerYield': {
        return {
          result: { status: 'coming_soon', message: 'CRUX Yield is launching soon. Score and Lens are live now.' },
          moduleType: 'yield'
        }
      }
      case 'askClarification': {
        return {
          result: { question: toolArgs.question, parameter_name: toolArgs.parameter_name },
          moduleType: null
        }
      }
      default:
        return { result: { error: `Unknown tool: ${toolName}` }, moduleType: null }
    }
  }
}

const executeTool = createLensToolExecutor()

export async function streamLensMessage(
  sessionId: string,
  userMessage: string,
  res: Response
): Promise<void> {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  function writeChunk(data: {
    delta: string
    done: boolean
    module_result?: { type: string; data: unknown } | null
    error?: string
    message?: string
  }): void {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    } catch {
      // client disconnected — ignore
    }
  }

  let fullAssistantText = ''

  try {
    const session = await getSession(sessionId)
    await checkMessageLimit(sessionId)
    await refreshSession(sessionId)

    const [propertyResult, scoreResult, researchResult, verificationResult] = await Promise.allSettled([
      supabase
        .from('crux_properties')
        .select('*')
        .eq('id', session.property_id)
        .maybeSingle(),
      supabase
        .from('crux_scores')
        .select('*')
        .eq('property_id', session.property_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      getLatestResearch(session.property_id),
      getLatestVerification(session.property_id),
    ])

    const property = propertyResult.status === 'fulfilled' ? propertyResult.value.data : null
    const score = scoreResult.status === 'fulfilled' ? scoreResult.value.data : null
    const research = researchResult.status === 'fulfilled' ? researchResult.value : null
    const verification = verificationResult.status === 'fulfilled' ? verificationResult.value : null

    if (!property) {
      throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found for this session.')
    }

    const history = await getMessageHistory(sessionId)

    const systemPrompt = buildSystemPrompt({
      ...(property as PropertyRow),
      research_context: buildResearchContextBlock(research?.digest ?? null),
      verification_context: buildVerificationContextBlock(verification?.digest ?? null),
    }, score as CruxScore | null)

    const contents: Content[] = [
      ...history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      } as Content)),
      {
        role: 'user',
        parts: [{ text: userMessage }]
      }
    ]

    const model = geminiClient.getGenerativeModel({
      model: GEMINI_MODELS.LENS,
      systemInstruction: systemPrompt,
      generationConfig: {
        maxOutputTokens: LENS_CONFIG.maxOutputTokens,
        temperature: LENS_CONFIG.temperature,
      },
      tools: LENS_TOOLS,
    })

    let currentContents = [...contents]
    let iterationCount = 0
    const MAX_TOOL_ITERATIONS = 3

    while (iterationCount < MAX_TOOL_ITERATIONS) {
      iterationCount++

      const result = await model.generateContentStream({
        contents: currentContents
      })

      const response = await result.response
      const candidate = response.candidates?.[0]

      if (!candidate) break

      const functionCallParts = candidate.content.parts.filter((p: Part) => p.functionCall)

      if (functionCallParts.length > 0) {
        const toolResultParts = await Promise.all(
          functionCallParts.map(async (part: Part) => {
            const { name, args } = part.functionCall!
            const { result: toolResult, moduleType } = await executeTool(
              name,
              args as Record<string, unknown>,
              session.property_id
            )

            if (moduleType) {
              writeChunk({
                delta: '',
                done: false,
                module_result: { type: moduleType, data: toolResult }
              })
            }

            return {
              functionResponse: {
                name,
                response: { result: toolResult }
              }
            }
          })
        )

        const toolResults: Content = {
          role: 'user',
          parts: toolResultParts
        }

        currentContents = [
          ...currentContents,
          { role: 'model', parts: functionCallParts },
          toolResults
        ]
        continue
      }

      for await (const chunk of result.stream) {
        const text = chunk.text()
        if (text) {
          fullAssistantText += text
          writeChunk({ delta: text, done: false, module_result: null })
        }
      }

      break
    }

    writeChunk({ delta: '', done: true, module_result: null })

    saveMessages(sessionId, userMessage, fullAssistantText).catch(err => {
      console.error('[lens.agent] message save failed:', err)
    })

    const startTime = Date.now()
    supabase.from('crux_agent_logs').insert({
      agent_type: 'lens',
      property_id: session.property_id,
      input_payload: { session_id: sessionId, message_length: userMessage.length },
      output_payload: { response_length: fullAssistantText.length, iterations: iterationCount },
      llm_provider: 'gemini',
      latency_ms: Date.now() - startTime,
      tokens_used: null,
      status: 'success',
    }).then((res) => {
      if (res.error) console.error('[lens.agent] log write failed:', res.error)
    })

  } catch (err: unknown) {
    const appErr = err instanceof AppError
      ? err
      : new AppError(500, 'LENS_ERROR', 'An error occurred in CRUX Lens.')

    try {
      res.write(`data: ${JSON.stringify({ error: appErr.code, message: appErr.message, done: true })}\n\n`)
    } catch {
      // client already gone
    }
  } finally {
    res.end()
  }
}
