# CRUX Environment Variables

## Auth (Clerk)

| Variable | Required | Description |
|---|---|---|
| `CLERK_SECRET_KEY` | Yes | Clerk backend secret. Never expose client-side. From Clerk Dashboard → API Keys → Secret Key |
| `CLERK_PUBLISHABLE_KEY` | Yes | Safe to expose to frontend. From Clerk Dashboard → API Keys → Publishable Key |

## Database (Supabase)

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Project URL from Supabase Dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key for backend writes. From Supabase Dashboard → Settings → API → Service role secret |
| `SUPABASE_ANON_KEY` | Yes | Anon key for auth operations. From Supabase Dashboard → Settings → API → Anon public |
| `DATABASE_URL` | Yes | Postgres connection string |

## LLM (Gemini)

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google AI Studio API key. From [ai.google.dev](https://ai.google.dev) → Get API key |

## Research (Tavily)

| Variable | Required | Description |
|---|---|---|
| `TAVILY_API_KEY` | Yes, when web research is enabled | Tavily API key for the CRUX Research Evidence Agent |
| `CRUX_RESEARCH_TTL_HOURS` | No | Cache TTL for research runs. Default: `24` |
| `CRUX_RESEARCH_MAX_WEB_RESULTS` | No | Max Tavily results fetched per run. Default: `8` |
| `CRUX_RESEARCH_MAX_EVIDENCE_ITEMS` | No | Max evidence items persisted per run. Default: `20` |
| `CRUX_RESEARCH_ALLOWED_DOMAINS` | No | Optional comma-separated allowed domain override for accepted web evidence |
| `CRUX_VERIFICATION_TTL_HOURS` | No | Cache TTL for verification runs. Default: `24` |

## Maps (Google)

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | Yes | Google Cloud Maps + Geocoding API key. From [Google Cloud Console](https://console.cloud.google.com) → APIs → Maps + Geocoding |

## Email (Resend)

| Variable | Required | Description |
|---|---|---|
| `RESEND_API_KEY` | Yes | Resend transactional email API key. From [Resend Dashboard](https://resend.com) → API Keys |

## App Configuration

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | HTTP listen port. Default: `8080` |
| `NODE_ENV` | Yes | Deployment environment: `development` / `staging` / `production` |
| `APP_ENV` | Yes | Same as NODE_ENV for CRUX |
| `FRONTEND_URL` | Yes | Allowed frontend origin for CORS. E.g., `http://localhost:3000` (dev), `https://crux.comfhutt.com` (prod) |
| `INTERNAL_API_SECRET` | Yes | Shared secret for internal service-to-service calls (Next.js → backend registration) |
| `CRUX_VERSION` | No | Scoring engine version stamped on every score. Default: `0.1.0` |

## Supabase Auth Hooks

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_HOOK_SECRET` | Yes | Supabase Auth Hook signing secret. From Supabase Dashboard → Authentication → Hooks → Copy signing secret |
| `SITE_URL` | No | Deployed site base URL, no trailing slash. E.g., `https://comfhutt.com` |

## CRUX Data Sources

| Variable | Required | Default | Description |
|---|---|---|---|
| `CPCB_API_URL` | No | `https://app.cpcbccr.com/caaqms/caaqms_viewData_v2` | Air quality data endpoint |
| `MCA21_SEARCH_URL` | No | `https://www.mca.gov.in/mcafoportal/companyLLPMasterData.do` | Company lookup endpoint |
| `ECOURTS_API_URL` | No | `https://webapi.ecourtsindia.com/api/partner` | E-courts case lookup endpoint |
| `ECOURTS_API_KEY` | No | `''` | E-courts API key (empty if not using) |
