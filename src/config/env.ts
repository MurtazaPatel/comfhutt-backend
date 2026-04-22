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
};

// CRUX Data Source URLs (defaults to public government endpoints)
export const CPCB_API_URL = process.env.CPCB_API_URL || 'https://app.cpcbccr.com/caaqms/caaqms_viewData_v2';
export const MCA21_SEARCH_URL = process.env.MCA21_SEARCH_URL || 'https://www.mca.gov.in/mcafoportal/companyLLPMasterData.do';
export const ECOURTS_API_URL = process.env.ECOURTS_API_URL || 'https://webapi.ecourtsindia.com/api/partner';
export const ECOURTS_API_KEY = process.env.ECOURTS_API_KEY || '';
export const NHB_RESIDEX_TABLE = 'crux_residex_cache';
export const CPWD_RATES_TABLE = 'crux_cpwd_cache';
