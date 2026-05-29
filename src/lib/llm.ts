// Multi-Provider LLM Client — CRUX Pipeline
// Architecture: Kimi K2.6 (Primary) → DeepSeek-R1-0528 (Reasoning) → Gemini 2.5 Flash (Fallback)
//
// Primary (fast, reliable JSON):    Kimi K2.6     → Fetcher, Verification, Scoring, Lens, Report
// Reasoning (creative, complex):    DeepSeek-R1   → Research query gen, Research extraction, Complex lens
// Fallback (always available):      Gemini 2.5    → Everything when primary/reasoning fail

import { GoogleGenerativeAI } from '@google/generative-ai'
import { env } from '../config/env'

if (!env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is required.')
}

export const geminiClient = new GoogleGenerativeAI(env.GEMINI_API_KEY)

const KIMI_URL = process.env.AZURE_BASE_URL_KIMI || ''
const KIMI_KEY = process.env.KIMI_API_KEY || ''
const KIMI_MODEL = process.env.MODEL_NAME_KIMI || 'Kimi-K2.6'
const KIMI_ON = Boolean(KIMI_URL && KIMI_KEY)

const DEEPSEEK_URL = process.env.AZURE_BASE_URL_DEEPSEEK || ''
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || ''
const DEEPSEEK_MODEL = process.env.MODEL_NAME_DEEPSEEK || 'DeepSeek-R1-0528'
const DEEPSEEK_ON = Boolean(DEEPSEEK_URL && DEEPSEEK_KEY)

export const LLM_MODELS = {
  FETCHER:       'primary',
  VERIFICATION:  'primary',
  SCORING:       'primary',
  LENS:          'primary',
  REPORT:        'primary',
  RESEARCH:      'reasoning',
  QUERY_GEN:     'reasoning',
} as const

export const LLM_DEFAULTS = {
  temperature: 0.2,
  maxOutputTokens: 4096,
} as const

export const LENS_CONFIG = {
  temperature: 0.7,
  maxOutputTokens: 1024,
} as const

export const REPORT_CONFIG = {
  temperature: 0.3,
  maxOutputTokens: 4096,
} as const

export interface LlmGenerateParams {
  model?: string
  strategy?: 'primary' | 'reasoning' | 'gemini'
  systemInstruction: string
  prompt: string
  temperature?: number
  maxOutputTokens?: number
}

async function azureCall(
  url: string,
  key: string,
  modelName: string,
  params: LlmGenerateParams,
): Promise<string> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: params.systemInstruction },
        { role: 'user', content: params.prompt },
      ],
      temperature: params.temperature ?? LLM_DEFAULTS.temperature,
      max_tokens: params.maxOutputTokens ?? LLM_DEFAULTS.maxOutputTokens,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`AZURE_HTTP_${response.status}: ${text.slice(0, 200)}`)
  }

  const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  return json.choices?.[0]?.message?.content ?? ''
}

async function callKimi(params: LlmGenerateParams): Promise<string> {
  return azureCall(KIMI_URL, KIMI_KEY, KIMI_MODEL, params)
}

async function callDeepSeek(params: LlmGenerateParams): Promise<string> {
  return azureCall(DEEPSEEK_URL, DEEPSEEK_KEY, DEEPSEEK_MODEL, params)
}

async function callGemini(params: LlmGenerateParams): Promise<string> {
  const model = geminiClient.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: params.systemInstruction,
    generationConfig: {
      temperature: params.temperature ?? LLM_DEFAULTS.temperature,
      maxOutputTokens: params.maxOutputTokens ?? LLM_DEFAULTS.maxOutputTokens,
    },
  })
  const result = await model.generateContent(params.prompt)
  return result.response.text().trim()
}

async function tryOrNull(fn: () => Promise<string>, label: string): Promise<string | null> {
  try {
    const result = await fn()
    return result
  } catch (err) {
    console.warn(`[llm] ${label} failed: ${(err as Error)?.message?.slice(0, 100)}`)
    return null
  }
}

export async function generate(params: LlmGenerateParams): Promise<string> {
  const strategy = params.strategy ?? 'primary'

  if (strategy === 'primary') {
    if (KIMI_ON) {
      const result = await tryOrNull(() => callKimi(params), 'Kimi K2.6')
      if (result) return result
    }
    if (DEEPSEEK_ON) {
      const result = await tryOrNull(() => callDeepSeek(params), 'DeepSeek-R1')
      if (result) return result
    }
    return callGemini(params)
  }

  if (strategy === 'reasoning') {
    if (DEEPSEEK_ON) {
      const result = await tryOrNull(() => callDeepSeek(params), 'DeepSeek-R1')
      if (result) return result
    }
    if (KIMI_ON) {
      const result = await tryOrNull(() => callKimi(params), 'Kimi K2.6')
      if (result) return result
    }
    return callGemini(params)
  }

  return callGemini(params)
}

export function safeJsonParse<T>(raw: string): T | null {
  let text = raw.trim().replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim()

  const tryParse = (s: string): T | null => {
    try { return JSON.parse(s) } catch { return null }
  }

  let result = tryParse(text)
  if (result) return result

  text = text.replace(/,\s*([}\]])/g, '$1')
  result = tryParse(text)
  if (result) return result

  let braces = 0, brackets = 0, inString = false, escaped = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (escaped) { escaped = false; continue }
    if (ch === '\\') { escaped = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') braces++
    if (ch === '}') braces--
    if (ch === '[') brackets++
    if (ch === ']') brackets--
  }
  if (inString) text += '"'
  while (brackets > 0) { text += ']'; brackets-- }
  while (braces > 0) { text += '}'; braces-- }

  result = tryParse(text)
  if (result) return result

  return null
}

export function safeJsonExtractArray(raw: string): unknown[] {
  let text = raw.trim().replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim()

  const arr = safeJsonParse<unknown[]>(text)
  if (Array.isArray(arr)) return arr

  const items: unknown[] = []
  const pattern = /\{(?:[^{}]|\{[^{}]*\})*\}/g
  let match
  while ((match = pattern.exec(text)) !== null) {
    const parsed = safeJsonParse<unknown>(match[0])
    if (parsed && typeof parsed === 'object') items.push(parsed)
  }
  return items
}

export const generateWithFallback = generate

// Backwards compat — streaming agents (lens) need Gemini SDK directly
export const GEMINI_MODELS = {
  LENS: 'gemini-2.5-flash',
  REPORT_AGENT: 'gemini-2.5-flash',
  FETCHER_AGENT: 'gemini-2.5-flash',
  RESEARCH_AGENT: 'gemini-2.5-flash',
  VERIFICATION_AGENT: 'gemini-2.5-flash',
  SCORING_AGENT: 'gemini-2.5-flash',
} as const