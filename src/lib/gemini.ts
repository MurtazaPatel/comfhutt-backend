// Gemini 2.5 Flash client
// Powers: CRUX Lens (streaming chat) + all CRUX Agents (function-calling)
// Single client instance — imported wherever Gemini is needed
// Auto-fallback to Kimi K2.6 (Azure OpenAI) when Gemini fails

import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env';

// Validate at startup — fail fast if key missing
if (!env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is required. Add it to .env and GCP Secret Manager.');
}

export const geminiClient = new GoogleGenerativeAI(env.GEMINI_API_KEY);

const KIMI_BASE_URL = process.env.AZURE_BASE_URL_KIMI || ''
const KIMI_API_KEY = process.env.KIMI_API_KEY || ''
const KIMI_MODEL = process.env.MODEL_NAME || 'Kimi-K2.6'
const KIMI_ENABLED = Boolean(KIMI_BASE_URL && KIMI_API_KEY)

// Model identifiers — change here only, not scattered across agents
export const GEMINI_MODELS = {
  LENS: 'gemini-2.5-flash',
  FETCHER_AGENT: 'gemini-2.5-flash',
  RESEARCH_AGENT: 'gemini-2.5-flash',
  VERIFICATION_AGENT: 'gemini-2.5-flash',
  SCORING_AGENT: 'gemini-2.5-flash',
  REPORT_AGENT: 'gemini-2.5-flash',
} as const;

// Shared generation config defaults — override per agent as needed
export const GEMINI_DEFAULTS = {
  temperature: 0.2,
  maxOutputTokens: 2048,
} as const;

// Lens gets slightly higher temperature — natural conversation
export const LENS_CONFIG = {
  temperature: 0.7,
  maxOutputTokens: 1024,
} as const;

// Report agent needs more tokens — narrative sections are long
export const REPORT_CONFIG = {
  temperature: 0.3,
  maxOutputTokens: 4096,
} as const;

export interface LlmGenerateParams {
  model?: string
  systemInstruction: string
  prompt: string
  temperature?: number
  maxOutputTokens?: number
}

async function callKimi(params: LlmGenerateParams): Promise<string> {
  const response = await fetch(KIMI_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIMI_API_KEY}`,
    },
    body: JSON.stringify({
      model: KIMI_MODEL,
      messages: [
        { role: 'system', content: params.systemInstruction },
        { role: 'user', content: params.prompt },
      ],
      temperature: params.temperature ?? GEMINI_DEFAULTS.temperature,
      max_tokens: params.maxOutputTokens ?? GEMINI_DEFAULTS.maxOutputTokens,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`KIMI_HTTP_${response.status}: ${text.slice(0, 200)}`)
  }

  const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  return json.choices?.[0]?.message?.content ?? ''
}

async function callGemini(params: LlmGenerateParams): Promise<string> {
  const model = geminiClient.getGenerativeModel({
    model: params.model ?? GEMINI_MODELS.FETCHER_AGENT,
    systemInstruction: params.systemInstruction,
    generationConfig: {
      temperature: params.temperature ?? GEMINI_DEFAULTS.temperature,
      maxOutputTokens: params.maxOutputTokens ?? GEMINI_DEFAULTS.maxOutputTokens,
    },
  })

  const result = await model.generateContent(params.prompt)
  return result.response.text().trim()
}

export async function generateWithFallback(params: LlmGenerateParams): Promise<string> {
  try {
    return await callGemini(params)
  } catch (geminiError) {
    const geminiMsg = (geminiError as Error)?.message?.slice(0, 120) ?? 'unknown'

    if (KIMI_ENABLED) {
      console.warn(`[llm] Gemini failed (${geminiMsg}), falling back to Kimi K2.6...`)
      try {
        const result = await callKimi(params)
        console.log('[llm] Kimi K2.6 fallback succeeded')
        return result
      } catch (kimiError) {
        const kimiMsg = (kimiError as Error)?.message?.slice(0, 120) ?? 'unknown'
        console.error(`[llm] Kimi K2.6 fallback also failed: ${kimiMsg}`)
      }
    }

    throw geminiError
  }
}

export async function generateWithRace(params: LlmGenerateParams): Promise<string> {
  if (!KIMI_ENABLED) return callGemini(params)

  try {
    return await Promise.race([
      callGemini(params).catch((err) => {
        console.warn(`[llm] Gemini lost race: ${(err as Error)?.message?.slice(0, 80)}`)
        return new Promise<string>(() => {})
      }),
      callKimi(params),
    ])
  } catch {
    return callGemini(params)
  }
}
