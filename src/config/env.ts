import dotenv from "dotenv";

// Load .env before anything else
dotenv.config();

/**
 * Validated environment configuration.
 * Fails fast at startup if a required variable is missing.
 */
interface EnvConfig {
  /** Supabase project URL */
  SUPABASE_URL: string;
  /** Supabase service-role key (server-side only) */
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** Supabase anon key (for auth operations) */
  SUPABASE_ANON_KEY: string;
  /** Postgres connection string */
  DATABASE_URL: string;
  /** Resend transactional-email API key */
  RESEND_API_KEY: string;
  /** Allowed frontend origin for CORS */
  FRONTEND_URL: string;
  /** Deployment environment: development | staging | production */
  APP_ENV: string;
  /** Shared secret for internal service-to-service calls */
  INTERNAL_API_SECRET: string;
  /** HTTP listen port */
  PORT: number;
  /** Google AI Studio API key — powers CRUX Gemini agents */
  GEMINI_API_KEY: string;
  /** Google Cloud Maps + Geocoding API key */
  GOOGLE_MAPS_API_KEY: string;
  /** CRUX scoring engine version — stamped on every score */
  CRUX_VERSION: string;
  /** Clerk backend secret key for session verification */
  CLERK_SECRET_KEY: string;
  /** Clerk publishable key (safe for client reference) */
  CLERK_PUBLISHABLE_KEY: string;
  /** Clerk webhook signing secret for Svix verification */
  CLERK_WEBHOOK_SECRET: string;
  /** Tavily API key for CRUX research evidence agent */
  TAVILY_API_KEY: string;
  /** Research evidence cache TTL in hours */
  CRUX_RESEARCH_TTL_HOURS: number;
  /** Max Tavily web results to inspect per run */
  CRUX_RESEARCH_MAX_WEB_RESULTS: number;
  /** Max evidence items persisted per run */
  CRUX_RESEARCH_MAX_EVIDENCE_ITEMS: number;
  /** Optional comma-separated allowed domains override */
  CRUX_RESEARCH_ALLOWED_DOMAINS: string[];
  /** Verification cache TTL in hours */
  CRUX_VERIFICATION_TTL_HOURS: number;
  /** Firecrawl self-hosted URL on Azure VM */
  FIRECRAWL_URL: string;
  /** Per-request timeout in ms (30s for agent/interact) */
  FIRECRAWL_TIMEOUT_MS: number;
  /** Max retry attempts per endpoint */
  FIRECRAWL_RETRY_COUNT: number;
  /** Max pages per /v2/crawl */
  FIRECRAWL_CRAWL_MAX_PAGES: number;
  /** Max browser actions per /v2/agent */
  FIRECRAWL_AGENT_MAX_STEPS: number;
  /** Max results per /v2/search */
  FIRECRAWL_SEARCH_MAX_RESULTS: number;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env: EnvConfig = {
  SUPABASE_URL: requireEnv("SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  SUPABASE_ANON_KEY: requireEnv("SUPABASE_ANON_KEY"),
  DATABASE_URL: requireEnv("DATABASE_URL"),
  RESEND_API_KEY: requireEnv("RESEND_API_KEY"),
  FRONTEND_URL: requireEnv("FRONTEND_URL"),
  APP_ENV: requireEnv("APP_ENV"),
  INTERNAL_API_SECRET: requireEnv("INTERNAL_API_SECRET"),
  PORT: parseInt(process.env.PORT || "8080", 10),
  GEMINI_API_KEY: requireEnv("GEMINI_API_KEY"),
  GOOGLE_MAPS_API_KEY: requireEnv("GOOGLE_MAPS_API_KEY"),
  CRUX_VERSION: process.env.CRUX_VERSION || "0.1.0",
  CLERK_SECRET_KEY: requireEnv("CLERK_SECRET_KEY"),
  CLERK_PUBLISHABLE_KEY: requireEnv("CLERK_PUBLISHABLE_KEY"),
  CLERK_WEBHOOK_SECRET: requireEnv("CLERK_WEBHOOK_SECRET"),
  TAVILY_API_KEY: process.env.TAVILY_API_KEY || "",
  CRUX_RESEARCH_TTL_HOURS: parseInt(process.env.CRUX_RESEARCH_TTL_HOURS || "24", 10),
  CRUX_RESEARCH_MAX_WEB_RESULTS: parseInt(process.env.CRUX_RESEARCH_MAX_WEB_RESULTS || "3", 10),
  CRUX_RESEARCH_MAX_EVIDENCE_ITEMS: parseInt(process.env.CRUX_RESEARCH_MAX_EVIDENCE_ITEMS || "20", 10),
  CRUX_RESEARCH_ALLOWED_DOMAINS: (process.env.CRUX_RESEARCH_ALLOWED_DOMAINS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
  CRUX_VERIFICATION_TTL_HOURS: parseInt(process.env.CRUX_VERIFICATION_TTL_HOURS || "24", 10),
  FIRECRAWL_URL: process.env.FIRECRAWL_URL || "http://98.70.45.123:3002",
  FIRECRAWL_TIMEOUT_MS: parseInt(process.env.FIRECRAWL_TIMEOUT_MS || "30000", 10),
  FIRECRAWL_RETRY_COUNT: parseInt(process.env.FIRECRAWL_RETRY_COUNT || "3", 10),
  FIRECRAWL_CRAWL_MAX_PAGES: parseInt(process.env.FIRECRAWL_CRAWL_MAX_PAGES || "15", 10),
  FIRECRAWL_AGENT_MAX_STEPS: parseInt(process.env.FIRECRAWL_AGENT_MAX_STEPS || "8", 10),
  FIRECRAWL_SEARCH_MAX_RESULTS: parseInt(process.env.FIRECRAWL_SEARCH_MAX_RESULTS || "3", 10),
};

// Firecrawl self-hosted URL (all data sources now flow through Firecrawl)
export const FIRECRAWL_URL = process.env.FIRECRAWL_URL || 'http://98.70.45.123:3002';
