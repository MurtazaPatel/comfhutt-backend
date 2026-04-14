// Gemini 2.5 Flash client
// Powers: CRUX Lens (streaming chat) + all CRUX Agents (function-calling)
// Single client instance — imported wherever Gemini is needed

import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env';

// Validate at startup — fail fast if key missing
if (!env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is required. Add it to .env and GCP Secret Manager.');
}

export const geminiClient = new GoogleGenerativeAI(env.GEMINI_API_KEY);

// Model identifiers — change here only, not scattered across agents
export const GEMINI_MODELS = {
  LENS: 'gemini-2.5-flash',      // streaming chat
  FETCHER_AGENT: 'gemini-2.5-flash',  // function-calling data orchestration
  SCORING_AGENT: 'gemini-2.5-flash',  // clarification question generation
  REPORT_AGENT: 'gemini-2.5-flash',   // narrative report generation
} as const;

// Shared generation config defaults — override per agent as needed
export const GEMINI_DEFAULTS = {
  temperature: 0.2,      // low = more deterministic — right for agents
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
