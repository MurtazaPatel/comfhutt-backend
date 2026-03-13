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
};
