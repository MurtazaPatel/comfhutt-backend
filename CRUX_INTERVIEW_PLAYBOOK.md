# CRUX Interview Playbook

This document analyzes the repository as if you must defend it in a senior AI engineering or backend systems interview.

It is intentionally honest:
- it explains what is already built,
- it distinguishes MVP scaffolding from true production behavior,
- it turns current gaps into credible evolution stories.

TypeScript sanity check:
- `npm run typecheck` passed
- `npm run build` passed

## 1. Beginner-Friendly Explanation

### Simple words
ComfHutt is building a backend for a property intelligence product called CRUX.

The idea is:
1. someone gives the system an Indian property address,
2. the backend geocodes and stores the property,
3. CRUX pulls data from multiple sources,
4. it computes a credibility-style score,
5. it can explain that score in plain language,
6. it can expose that through API endpoints, chat, reports, cards, and watch features.

In plain English: this is an AI-assisted property research backend, not just a chatbot.

### Technical depth
The repository is an Express + TypeScript backend deployed toward Google Cloud Run, using:
- Clerk for primary application auth,
- Supabase for database and some auth/email flows,
- Gemini for chat and report generation,
- deterministic TypeScript services for most scoring logic,
- OpenAPI plus shared type generation for contract discipline.

The product is broader than CRUX:
- marketing and waitlist flows,
- contact capture,
- developer/property onboarding,
- property listing mocks,
- auth and billing stubs,
- CRUX intelligence workflows.

### Interview-ready phrasing
"This repo is an MVP backend for a property intelligence platform. The core value is that it combines deterministic data pipelines with LLM-driven explanation. The AI is not the whole system; it sits on top of structured scoring, persistence, caching, and API contracts."

## 2. Overall Product Purpose

### Simple words
CRUX tries to answer:
"How credible, risky, and understandable is this property for a buyer or investor?"

It does that by combining:
- location signals,
- market signals,
- developer/legal signals,
- narrative explanation,
- lightweight monitoring and shareability.

### Technical depth
The primary product surface is the CRUX module under `src/modules/crux/`.

Core user journeys:
- ingest a property from an address,
- score it,
- chat with it through Lens,
- generate a report,
- create a shareable card,
- register a watch.

Secondary product surfaces:
- `contact`, `choices`, `early-access`, `developer-onboarding`, `properties`, `auth`, `billing`.

This means the repo is both:
- an application backend,
- and an AI product backend.

### Interview-ready phrasing
"The product purpose is not generic chat. It is decision support for property research. The score is the structured core, and the LLM layers are used mainly for explanation and interaction."

## 3. Full Architecture

### Simple words
Think of the backend as 6 layers:
1. HTTP API layer
2. auth and middleware layer
3. CRUX business logic layer
4. AI layer
5. database and cache layer
6. external services layer

### Technical depth
Architecture map:

1. Entry/runtime
- `src/index.ts`
- `src/app.ts`

2. Cross-cutting middleware
- security headers
- CORS
- rate limits
- request IDs
- auth guards
- validation
- error handling

3. Route layer
- `src/routes/index.ts`
- feature routers including `src/routes/crux.ts`

4. Domain/service layer
- CRUX ingestion, scoring, Lens sessioning, report persistence, card generation, watch services
- general services for auth, user sync, search history, leads, contact, onboarding

5. AI layer
- `src/lib/gemini.ts`
- `src/modules/crux/agents/lens.agent.ts`
- `src/modules/crux/agents/report.agent.ts`

6. Persistence
- Supabase tables and RPCs defined in `supabase/migrations/*.sql`
- geocode cache
- score cache
- report cache
- search history
- lens session + messages
- cards
- users
- watch credits/registrations
- agent logs

7. Contract layer
- `src/openapi/*`
- `packages/types/*`

8. Deployment layer
- `Dockerfile`
- Cloud Run assumptions in code comments and health route design

### Interview-ready phrasing
"The system is a layered Express backend with clear separation between transport, middleware, domain services, AI orchestration, and persistence. The CRUX intelligence engine is a module within that broader platform."

## 4. Mental Model Diagram

```text
Client
  |
  v
Express App
  |
  +--> Security middleware
  +--> Clerk auth
  +--> Validation + rate limiting
  |
  v
Route handlers
  |
  +--> CRUX Ingestion
  |      -> geocode cache
  |      -> Google Maps geocode
  |      -> crux_properties
  |
  +--> CRUX Score
  |      -> fetcher service
  |           -> CPCB
  |           -> Google Maps
  |           -> NHB RESIDEX mock
  |           -> MCA21
  |           -> eCourts
  |           -> CPWD mock
  |      -> scoring service
  |      -> crux_scores
  |      -> crux_searches
  |
  +--> CRUX Lens chat
  |      -> session + message history
  |      -> Gemini tool-calling
  |      -> triggerScore / triggerCast / triggerYield / askClarification
  |      -> SSE stream back to client
  |
  +--> CRUX Report
  |      -> cached score
  |      -> Gemini narrative JSON
  |      -> crux_reports
  |
  +--> CRUX Card
  |      -> score + report snapshot
  |      -> crux_cards
  |
  +--> CRUX Watch
         -> credit decrement RPC
         -> watch registration
```

## 5. Execution Flows

### 5.1 App boot

### Simple words
The app loads env vars, creates the Express app, applies middleware, mounts routes, and starts listening.

### Technical depth
Boot path:
- `src/config/env.ts` validates required env vars at startup.
- `src/index.ts` calls `createApp()`.
- `src/app.ts` applies:
  - `trust proxy`
  - Helmet
  - CORS
  - request ID
  - webhook raw-body route
  - JSON/body parsing
  - Clerk middleware
  - global rate limiter
  - routes
  - global error handler

### Interview-ready phrasing
"The process fails fast on missing config, then mounts a standard middleware chain with auth, validation, rate limiting, and a last-position error handler."

### 5.2 Property ingestion lifecycle

### Simple words
The system checks if the address was already geocoded. If yes, it reuses it. If not, it asks Google Maps for coordinates and address details, caches them, and creates a property row.

### Technical depth
Path:
- route: `POST /api/crux/property` in `src/routes/crux.ts`
- validation: `PropertyIngestionSchema`
- handler calls `ingestProperty()` in `src/modules/crux/ingestion/index.ts`

Flow:
1. validate address length
2. look up `crux_geocode_cache`
3. if miss, call Google Geocoding API
4. parse normalized address, lat/lng, pin code, city, state
5. upsert geocode cache with 30-day TTL
6. look up `crux_properties` by raw address
7. insert property if missing

Important nuance:
- `crux_properties` has no unique constraint on `address_raw`, so concurrent duplicate inserts are possible.

### Interview-ready phrasing
"Ingestion is cache-first geocoding plus property normalization. It is efficient enough for MVP, but I would add an address-level uniqueness strategy or canonicalization key before calling it production-safe."

### 5.3 Score lifecycle

### Simple words
When someone asks for a score, the backend first tries to serve a recent cached user search. If not, it either returns a cached score row or computes a new score from external signals.

### Technical depth
Entry routes:
- `GET /api/crux/score/:property_id`
- `POST /api/crux/score/:property_id/compute`

Core flow:
1. auth via Clerk
2. validate property ID and query params
3. `findRecentSearch()` checks 24-hour user-level search history cache
4. if no recent search cache, `getOrComputeScore()` checks `crux_scores`
5. if score cache miss, `computeAndPersist()`:
   - read property
   - call `fetchAllSources(profile)`
   - call `computeScore(fetcherOutput, intent, lifecycle, macroCycle)`
   - upsert `crux_scores`
   - async-write `crux_agent_logs`
6. persist a search snapshot into `crux_searches`

### Interview-ready phrasing
"The score path uses a layered cache model: first user search history, then score table TTL, then live recomputation. That minimizes cost but has some cache-key correctness issues I would fix."

### 5.4 Lens chat lifecycle

### Simple words
Lens is the conversational face of CRUX. It remembers the recent conversation, sees the property and any existing score, and can call internal tools like score generation while streaming text back to the client.

### Technical depth
Entry:
- `POST /api/crux/lens/session`
- `POST /api/crux/lens/:session_id/message`
- `GET /api/crux/lens/:session_id/history`

Message flow:
1. fetch session and check expiry
2. enforce message limit
3. refresh session expiry
4. fetch property and latest score in parallel
5. fetch up to 10 previous messages
6. build system prompt with property context, score context, and guardrails
7. call Gemini with function declarations
8. if model asks for tool calls, execute tools
9. optionally emit `module_result` SSE frames
10. continue model loop up to 3 tool iterations
11. stream text deltas as SSE
12. save user and assistant messages
13. async-write agent log

### Interview-ready phrasing
"Lens is a tool-calling conversational orchestrator around property context. It is not full autonomous multi-agent planning; it is a bounded supervisor loop with streaming output and persistent session state."

### 5.5 Report lifecycle

### Simple words
The report module turns a structured score into a human-readable property report.

### Technical depth
Path:
- route `GET /api/crux/report/:property_id`
- `generateReport()` in `src/modules/crux/agents/report.agent.ts`

Flow:
1. check cached report in `crux_reports`
2. fetch property
3. fetch or compute score
4. build strict system and user prompts
5. Gemini generates JSON only
6. backend parses and validates JSON
7. append SEBI disclaimer separately
8. persist to `crux_reports`

### Interview-ready phrasing
"The report agent is an explanation layer over structured scoring. I constrained it to valid JSON output and appended compliance text in code, which reduces free-form hallucination risk."

### 5.6 Card lifecycle

### Simple words
The card is a shareable snapshot of the property score and report summary.

### Technical depth
Flow:
1. fetch property
2. fetch or compute score
3. try to generate or fetch report
4. if report fails, degrade gracefully and still create a card
5. generate share token
6. persist snapshot into `crux_cards`

This is a good example of a partial-failure-tolerant user flow.

### Interview-ready phrasing
"Cards are immutable score snapshots optimized for sharing. The current MVP uses JSON plus a share URL, with PNG/PDF generation deferred."

### 5.7 Watch lifecycle

### Simple words
Watch is meant to let users track a property and spend credits to do so.

### Technical depth
Current flow:
1. auth
2. `watchCreditGuard` decrements credit using Supabase RPC
3. route calls `createWatchRegistration()`
4. response returns remaining credits and watch metadata

This is conceptually good, but the current implementation has data-model inconsistencies and a duplicate-credit-consumption issue described later.

### Interview-ready phrasing
"Watch is currently a registration plus credit-ledger MVP. The monitoring engine and alerting loop are intentionally deferred."

## 6. Agent Orchestration

### Simple words
This repo does use AI agents, but only in a limited and practical way.

There are really two AI behaviors:
- Lens: chat + tool calling
- Report: structured narrative generation

Fetcher and scoring are called "agents" in filenames, but they are mostly normal backend services.

### Technical depth
Actual orchestration style:
- one front-facing supervisor agent: `Lens`
- internal callable tools:
  - `triggerScore`
  - `triggerCast`
  - `triggerYield`
  - `askClarification`
- downstream domain services:
  - scoring pipeline
  - report generation
  - watch/card stubs

This is best described as:
- tool-calling orchestration
- bounded agent loop
- service-backed agent pattern

Not present:
- no task graph engine
- no planner/executor split
- no reflection loop
- no model ensemble
- no autonomous worker swarm

### Interview-ready phrasing
"The current agentic architecture is a supervisor-plus-tools pattern. It is intentionally conservative: deterministic services do the facts, and the LLM handles interaction and explanation."

## 7. LangGraph Workflows

### Simple words
There is no LangGraph in this repository.

### Technical depth
Evidence:
- no LangGraph dependency
- no graph state definitions
- no node/edge orchestration code
- no checkpointing system
- no graph runtime

What exists instead:
- manual orchestration in Express handlers and service functions
- bounded while-loop tool iteration in Lens

How to talk about it:
- do not claim LangGraph usage
- say the repo uses custom orchestration primitives
- explain how it could evolve into LangGraph later

Best evolution path:
1. convert ingestion, fetch, score, report, card, watch into graph nodes
2. store typed graph state per property analysis
3. add checkpointing and resumability
4. add recovery edges for tool failure, partial data, and retries
5. add planner -> executor -> critic subgraph for Lens

### Interview-ready phrasing
"LangGraph is not used today. The repo uses custom orchestration, but the module boundaries map cleanly to future graph nodes if we need checkpointed multi-step workflows."

## 8. CrewAI Usage

### Simple words
There is no CrewAI in this repository.

### Technical depth
Evidence:
- no CrewAI dependency
- no crew/task/agent role DSL
- no delegated worker teams

Current equivalent:
- single orchestrator calling internal tools

Potential future Crew-like evolution:
- Legal agent for case/doc checks
- Developer agent for corporate reputation
- Market agent for comps and demand
- Risk synthesizer
- Compliance critic

### Interview-ready phrasing
"CrewAI is not part of the implementation. The current repo is closer to service orchestration than role-based agent teams."

## 9. Tool Calling System

### Simple words
Lens can call backend functions when the user asks for something that needs live data.

### Technical depth
Defined in `src/modules/crux/agents/lens.agent.ts`:
- Gemini function declarations specify JSON schemas for tools.
- The backend inspects model function calls.
- `executeTool()` dispatches them to application logic.
- Results are fed back into the conversation loop.
- Some tool results are also surfaced to the frontend via `module_result` SSE payloads.

Current tools:
- `triggerScore`
- `triggerCast`
- `triggerYield`
- `askClarification`

Current limitations:
- `triggerCast` and `triggerYield` are placeholders
- `askClarification` is exposed but not integrated into scoring output generation
- no generic tool registry abstraction
- no authorization scoping per tool beyond route auth

### Interview-ready phrasing
"Tool calling is implemented directly through Gemini function declarations. It is simple, explicit, and easy to reason about, though I would eventually move it to a typed internal tool registry."

## 10. Memory Systems

### Simple words
The system remembers a few different things:
- property records,
- score cache,
- reports,
- past user searches,
- Lens conversations,
- watch registrations.

### Technical depth
Memory categories:

1. Operational short-term memory
- Lens session row in `crux_lens_sessions`
- Lens messages in `crux_lens_messages`
- 2-hour session expiry
- up to 10 messages are loaded into context

2. Cached derived memory
- `crux_scores` with 24h TTL
- `crux_reports` with 24h TTL
- `crux_geocode_cache` with 30-day TTL

3. User memory / history
- `crux_searches`
- `crux_watch_registrations`
- `crux_users`

4. Audit / observability memory
- `crux_agent_logs`

Not present:
- vector memory
- semantic retrieval memory
- long-term summarization memory
- learned user profile memory

### Interview-ready phrasing
"State persists in relational tables and JSON snapshots, not in a vector memory store. The memory model is pragmatic: session memory for chat, cache memory for compute, and history memory for user actions."

## 11. State Management

### Simple words
State is mostly database-backed, not in-memory.

### Technical depth
Primary state stores:
- Express request state for current request only
- Supabase tables for durable state
- in-memory rate limit maps in one route and express-rate-limit memory store elsewhere
- module-scope circuit breakers in fetcher

State boundaries:
- route layer is stateless
- domain services read/write state explicitly
- Lens model context is reconstructed per request from DB

Good pattern:
- stateless app tier, durable DB tier

MVP risk:
- some rate-limiting and stateful protections are in-memory, so Cloud Run horizontal scaling weakens enforcement

### Interview-ready phrasing
"Persistent state is DB-first. The server itself remains mostly stateless except for process-local rate limits and circuit breaker counters."

## 12. Prompt Engineering Structure

### Simple words
The prompts are carefully structured so the model behaves like a product feature, not a generic chatbot.

### Technical depth
Lens prompt design:
- role layer
- property context layer
- score context layer
- explicit available tools
- hard guardrails around non-advisory behavior

Report prompt design:
- system prompt establishes role, tone, legal constraints, and source citation behavior
- user prompt injects normalized structured data
- output is constrained to exact JSON schema
- disclaimer is appended by code, not left to the model

Prompt strengths:
- clear role definition
- clear truth boundaries
- compliance language
- structured output
- low-temperature defaults

Prompt limitations:
- no automatic compression or summarization of prior Lens history
- no evidence citation formatting beyond source naming
- no retrieval augmentation
- no prompt version registry

### Interview-ready phrasing
"Prompt engineering here is product-oriented. The prompts are layered, tool-aware, and guardrail-heavy, with deterministic post-processing where compliance matters."

## 13. RAG Pipelines

### Simple words
There is no RAG pipeline in the repo today.

### Technical depth
No signs of:
- embeddings generation
- chunking
- document ingestion
- vector search
- retrieval re-ranking
- answer synthesis over retrieved docs

The closest thing to retrieval is:
- database fetch of property and score context
- external live fetches for factual signals

Future RAG opportunities:
- property documents
- legal/title documents
- municipal rules
- RERA filings
- internal methodology docs
- prior analyses
- market reports

### Interview-ready phrasing
"This is not a RAG system yet. It is a live-data plus relational-context system. If we evolve it, the most valuable retrieval layer would likely be document-grounded legal and market evidence."

## 14. Vector Database Usage

### Simple words
No vector database is being used by the application code.

### Technical depth
The Supabase config mentions vector storage features, but the application does not use them.

No usage of:
- pgvector
- Supabase vector search
- Pinecone
- Weaviate
- Qdrant
- Chroma

### Interview-ready phrasing
"Vector infrastructure is not part of the live application path. The current system does not depend on semantic retrieval."

## 15. API Architecture

### Simple words
The repo is API-first. Most functionality is exposed through HTTP endpoints.

### Technical depth
Patterns:
- feature routers under `src/routes/`
- JSON APIs for most flows
- SSE for Lens streaming
- public health and card share endpoints
- protected CRUX routes via Clerk
- OpenAPI generation plus shared TypeScript types

Contract strengths:
- centralized route mounting
- OpenAPI generator
- shared workspace package for types

Contract weaknesses:
- OpenAPI schema does not fully match current runtime behavior
- generated/openapi types reflect intended schema more than exact implementation
- cache-hit score responses differ from cache-miss score responses

### Interview-ready phrasing
"The architecture is API-first with one notable streaming endpoint. The contract discipline is good for an MVP, but the OpenAPI layer needs tighter alignment with runtime payloads."

## 16. Async Flow

### Simple words
The backend does a good amount of work in parallel where it matters.

### Technical depth
Parallelism used:
- fetcher uses `Promise.allSettled()` to call all 6 sources in parallel
- Lens loads property and latest score in parallel
- Google Maps nearby search and distance matrix are called in parallel
- asynchronous non-blocking logging is used in several places

Missing async sophistication:
- no job queue
- no background worker
- no outbox pattern
- no event bus

### Interview-ready phrasing
"The code uses request-scoped concurrency where latency matters, especially data fetching and model context assembly, but it is still a synchronous API architecture rather than an event-driven one."

## 17. Error Handling

### Simple words
There is a custom `AppError` pattern for controlled errors, plus a global error handler for unexpected failures.

### Technical depth
Mechanisms:
- domain errors thrown as `AppError`
- route handlers often catch `AppError` explicitly
- global `errorHandler()` handles fallback errors
- several user-facing endpoints intentionally degrade to success responses for UX reasons, such as contact and auth email hook

Strengths:
- explicit business error codes
- user-safe messaging
- centralized handler

Weaknesses:
- generic error response shape differs from `AppError` shape
- some routes bypass central patterns and handcraft responses
- logging is mostly `console.*`, not structured or centralized

### Interview-ready phrasing
"The repo uses explicit domain exceptions for predictable API behavior, but I would standardize the response envelope and move logging to structured observability."

## 18. Retry Mechanisms

### Simple words
There are very few true retries.

### Technical depth
What exists:
- circuit breakers via `opossum` in fetcher
- cache-first avoidance of repeated work

What does not exist:
- exponential backoff retries
- idempotent replay
- dead-letter handling
- retriable queue jobs

Circuit breakers help stop repeated slow failures, but they are not the same thing as retries.

### Interview-ready phrasing
"Failure resilience is currently more about containment than retry sophistication. Circuit breakers are present, but I would add backoff-aware retries and idempotency for production hardening."

## 19. Agent Failure Handling

### Simple words
If part of the system fails, CRUX often tries to continue with partial data instead of crashing everything.

### Technical depth
Examples:
- fetcher uses `Promise.allSettled()` so one source failing does not kill the whole scoring pass
- score confidence degrades based on source success count and freshness
- card generation tries report generation but still returns a card if the report fails
- Lens catches internal errors and emits SSE error frames
- contact/email flows swallow some failures to protect UX

Limitations:
- Lens does not explicitly surface "max iterations exceeded"
- report log writes are non-blocking and currently mismatched to schema
- no persistent retry queue for failed AI or provider calls

### Interview-ready phrasing
"The dominant pattern is graceful degradation: partial facts still produce a usable result, but with reduced confidence or missing enrichments."

## 20. Fallback Systems

### Simple words
The backend uses several fallback ideas:
- cache instead of live call
- neutral score when data is missing
- card without report
- success message even if email fails

### Technical depth
Fallback catalogue:
- geocode cache before live geocoding
- search history cache before score recompute
- score cache before fetcher/scorer
- report cache before LLM generation
- neutral defaults in scoring for unavailable sources
- NHB RESIDEX and CPWD mocked in memory
- card generation continues if report generation fails
- webhook and contact flows return safe responses on internal issues

### Interview-ready phrasing
"The system is intentionally fallback-heavy. That makes it user-resilient, though some fallbacks currently trade correctness for continuity."

## 21. Model Routing

### Simple words
The app uses one model family and mostly one model: Gemini 2.5 Flash.

### Technical depth
Configured in `src/lib/gemini.ts`:
- `LENS`
- `FETCHER_AGENT`
- `SCORING_AGENT`
- `REPORT_AGENT`

But actual usage today:
- Lens uses Gemini 2.5 Flash
- Report uses Gemini 2.5 Flash
- Fetcher and Scoring model constants exist but are not used

So model routing is currently nominal rather than functional.

### Interview-ready phrasing
"Model routing is not sophisticated yet. The configuration suggests future specialization, but current runtime usage is effectively single-model."

## 22. Multi-Agent Coordination

### Simple words
This is not a true multi-agent swarm. It is one chat orchestrator plus multiple backend modules.

### Technical depth
If you use precise language:
- yes, there are multiple AI-related modules
- no, they are not autonomous peer agents coordinating with each other

Current coordination mode:
- `Lens` supervises and can call tools
- scoring pipeline runs outside the LLM
- report agent runs after scoring

Better description:
- orchestrated AI workflow
- service-backed agent pattern
- bounded tool-calling loop

### Interview-ready phrasing
"I would describe it as multi-component agentic orchestration, not a full multi-agent framework."

## 23. Context Management

### Simple words
Lens builds context from four things:
- the property,
- the latest score,
- recent chat history,
- tool outputs.

### Technical depth
Context sources:
- property row
- latest `crux_scores` row
- last 10 messages from `crux_lens_messages`
- current user message
- any tool responses from the current loop

Context controls:
- message input max 2000 chars
- max 10 retrieved messages
- max 30 messages per session
- max 3 tool-iteration loops

What is missing:
- no summarization of old chats
- no semantic context pruning
- no per-tool context shaping

### Interview-ready phrasing
"Context is explicit, small, and relational. That keeps token cost under control, but I would add rolling summaries once Lens becomes more heavily used."

## 24. Token Optimization

### Simple words
The repo uses a few simple token-saving tactics, not advanced ones.

### Technical depth
Token controls:
- low temperatures for report generation
- limited message history
- structured prompts rather than verbose chains
- structured JSON output for report
- deterministic scoring done outside the LLM

Big token-saving architectural choice:
- numeric scoring stays in code, not in the model

Missing optimizations:
- prompt compression
- response truncation strategies
- token accounting persistence
- adaptive context length

### Interview-ready phrasing
"The biggest token optimization is architectural: the model explains the score, but it does not compute the score."

## 25. Streaming Architecture

### Simple words
Lens streams responses back to the frontend in small chunks using server-sent events.

### Technical depth
SSE behavior in Lens:
- content type `text/event-stream`
- no-cache headers
- chunk shape:
  - `delta`
  - `done`
  - optional `module_result`
  - optional `error`

The backend can interleave:
- streamed natural language
- structured tool/module results

This is good product design for AI UX because the UI can show both text and structured state updates.

### Interview-ready phrasing
"Lens uses SSE with both token deltas and typed side-channel module payloads, which is a strong pattern for AI product interfaces."

## 26. Environment Configuration

### Simple words
The app requires a lot of external configuration and fails fast if important secrets are missing.

### Technical depth
`src/config/env.ts` validates:
- Supabase URL/service-role/anon keys
- database URL
- Resend
- frontend URL
- internal API secret
- Gemini
- Google Maps
- Clerk secrets
- app env and port

Also supports optional CRUX data source URLs and keys.

Strength:
- startup validation

Weakness:
- env typing is centralized, but feature-level configuration ownership is still implicit

### Interview-ready phrasing
"Environment management is solid for an MVP because the app refuses to boot on missing critical config. I would next layer secret scoping and environment-specific validation."

## 27. Deployment Readiness

### Simple words
The repo is deployable, but not fully production-hardened.

### Technical depth
Production-positive signals:
- Dockerfile
- health endpoint
- non-root container user
- TypeScript build pipeline
- trust-proxy config for Cloud Run
- global middleware chain
- env validation

Remaining gaps:
- no tests integrated into CI
- no structured logging
- no Redis/distributed rate limiting
- no background workers
- contract mismatches
- some endpoint correctness issues

### Interview-ready phrasing
"It is deployable MVP-ready, not enterprise-ready. The platform basics are present, but distributed controls and observability need to be upgraded before scale."

## 28. Security Concerns

### Simple words
The repo takes security somewhat seriously, but there are still important risks.

### Technical depth
Good security controls:
- Helmet
- CORS allowlist
- Clerk auth on CRUX routes
- internal-secret guard for registration route
- raw-body webhook signature verification for Clerk and Supabase hooks
- validation middleware
- service-role Supabase access on backend only
- non-root Docker user

Risks and inconsistencies:
1. mixed auth stack
- both Clerk and Supabase auth patterns exist
- increases confusion and surface area

2. route identity extraction inconsistency
- some routes use `getAuth(req)`
- others use `req.user?.id`
- likely causes authorization and personalization bugs

3. overly open RLS in some Lens/card policies
- `crux_lens_messages` allows broad anon/authenticated access
- `crux_cards` public read/update policies are permissive

4. public read access on agent logs and property tables
- maybe okay for MVP, but risky if logs ever contain sensitive data

5. generic error handling shape is inconsistent
- can complicate secure client behavior

6. OAuth callback redirects tokens in query params
- query-param token delivery is weaker than HttpOnly cookie-based handling

### Interview-ready phrasing
"The repo has real security controls, but I would call it a mixed-maturity security model. The biggest cleanup would be auth unification, stricter RLS, and safer token transport."

## 29. Scalability Bottlenecks

### Simple words
The main scaling limits are external API latency, in-memory controls, and synchronous request handling.

### Technical depth
Likely bottlenecks:
1. synchronous score computation inside request/response
2. live third-party dependency fan-out
3. in-memory rate limits on horizontally scaled Cloud Run instances
4. no queue for expensive or bursty workflows
5. report generation is synchronous LLM blocking work
6. search-history cache is per-user but not parameter-correct
7. Lens context grows through repeated DB reads
8. no batching or pooled external call strategy

### Interview-ready phrasing
"Today the bottleneck is not CPU; it is orchestration latency and external dependency cost. I would move expensive analyses toward async jobs and stronger caching."

## 30. Observability and Logging

### Simple words
The repo logs useful things, but mostly with plain `console.log`.

### Technical depth
What exists:
- request IDs
- route hit logging
- agent logs table
- non-blocking logging of fetch/scorer/lens flows
- some provider failure logs

What is missing:
- structured logger
- log levels and fields standardized
- traces/spans
- metrics
- dashboarding/alerts
- token usage tracking

Important nuance:
- report agent log writes are currently schema-mismatched, so observability for report generation is unreliable.

### Interview-ready phrasing
"There is an observability intention in the schema design, especially `crux_agent_logs`, but the runtime logging stack is still MVP-grade."

## 31. Dependency Graph

### Simple words
The most important dependency chain is:
route -> service -> AI/domain module -> Supabase/external API

### Technical depth
Key dependency graph:

App/runtime:
- `src/index.ts` -> `src/app.ts` -> `src/routes/index.ts`

CRUX routes:
- `src/routes/crux.ts`
  - ingestion -> `src/modules/crux/ingestion/index.ts`
  - score -> `src/modules/crux/scoring/index.ts`
  - lens -> `src/modules/crux/agents/lens.agent.ts` + `src/modules/crux/lens/lens.service.ts`
  - report -> `src/modules/crux/agents/report.agent.ts`
  - card -> `src/modules/crux/card/card.generator.ts` -> `card.service.ts`
  - watch -> `watchCreditGuard.ts` + `watch.service.ts`

AI:
- `src/lib/gemini.ts`
- Lens + Report agents import it

Persistence:
- almost everything goes through `src/lib/db.ts`

Contracts:
- `src/openapi/*`
- `packages/types/*`

Platform:
- Clerk in `src/app.ts`, `requireAuth.ts`, `auth.routes.ts`, `webhooks.routes.ts`
- Resend via `src/lib/email.ts`

### Interview-ready phrasing
"The repo keeps dependencies relatively shallow. CRUX route handlers fan into modular services, and nearly all durable state flows through Supabase."

## 32. Deterministic vs Probabilistic Parts

### Simple words
Some parts always behave the same for the same input. Some parts depend on model generation.

### Technical depth
Deterministic:
- validation
- auth guards
- geocode cache lookup
- DB lookups/inserts
- score computation formulas
- confidence calculation
- route parameter checks
- watch credit RPC
- share token generation format

Probabilistic:
- Lens natural-language responses
- Lens tool-calling decisions
- Report narrative generation

Hybrid:
- fetcher gathers factual data deterministically, but provider availability is uncertain
- card generation depends on deterministic score plus optional probabilistic report content

### Interview-ready phrasing
"The factual core is deterministic. The probabilistic layer is deliberately limited to interaction and narrative synthesis."

## 33. Concurrency and Parallelism

### Simple words
Yes, there is parallelism, mostly for latency reduction.

### Technical depth
Examples:
- `Promise.allSettled()` over external data fetches
- `Promise.all()` inside tool response assembly
- parallel property + score lookup in Lens
- parallel Google Maps requests in fetcher

Why it matters:
- lowers tail latency
- supports partial success
- preserves responsiveness for multi-source scoring

### Interview-ready phrasing
"The parallelism is request-local and latency-oriented rather than distributed-job oriented."

## 34. What Is Actually Agentic Here

### Simple words
The truly agentic parts are small but real:
- a model decides when to call tools,
- a model produces structured analysis,
- the system loops once or twice based on tool outcomes.

### Technical depth
Agentic elements:
- tool selection
- tool invocation
- observation injection
- continued reasoning after tool response
- structured prompting with role constraints

Non-agentic but important:
- scoring formulas
- caching
- persistence
- auth
- monitoring stubs

### Interview-ready phrasing
"This is a productized agentic workflow, not an agent research demo."

## 35. Major Strengths

### Simple words
What is already good:
- clear module boundaries
- score logic outside the model
- real persistence
- multiple caches
- streaming chat
- contract generation

### Technical depth
Strengths:
1. deterministic scoring core
2. bounded AI responsibilities
3. meaningful relational state model
4. multiple TTL-based caches
5. SSE streaming pattern
6. circuit breakers around external dependencies
7. explicit compliance guardrails in prompts
8. OpenAPI + shared types direction

### Interview-ready phrasing
"The architecture is strongest where it separates fact generation from language generation."

## 36. Weaknesses and Risky Decisions

### Simple words
The main risks are not flashy AI issues. They are correctness, identity consistency, and cache semantics.

### Technical depth
High-value weaknesses:

1. Score cache key is incomplete
- `crux_scores` upsert/cache key uses `(property_id, intent_profile)` only
- lifecycle and macro cycle also affect scoring
- this can return wrong cached scores or overwrite variants

2. Search history cache key is incomplete
- `findRecentSearch()` ignores intent, lifecycle, macro
- endpoint can return wrong response variant

3. Cache-hit score response shape differs from live score response
- contract inconsistency

4. Watch credit consumption order is wrong
- credit is decremented before duplicate-watch check
- repeated registration attempts can waste credits

5. Watch data model inconsistency
- routes/services use Clerk string IDs
- migrations define some watch tables with UUID-style user IDs

6. User sync likely does not update changed fields
- `ignoreDuplicates: true` on upsert means conflict rows are ignored

7. Mixed auth architecture
- both Supabase auth and Clerk auth coexist
- increases confusion and maintenance cost

8. Report logging schema mismatch
- `report.agent.ts` writes `agent_type: 'reporter'` and wrong column names

9. Lens user association likely broken in some routes
- routes read `req.user?.id` instead of `getAuth(req).userId`

10. Lens memory is not truly rolling
- fetch limit is 10, but old messages are never summarized or pruned in DB

11. Property ingestion has race potential
- no uniqueness on raw or canonical address

12. Legal/developer fetches are effectively non-functional today
- `developer_name` is missing from `PropertyProfile`
- MCA21 and eCourts often fail immediately

13. Mock-vs-real data gap
- NHB RESIDEX and CPWD tables exist, but runtime uses in-memory mocks

14. Overly permissive anon policies
- Lens messages and cards are more open than ideal

15. Query-parameter token redirect in OAuth callback
- not ideal for browser security

### Interview-ready phrasing
"The biggest risks are cache correctness, identity consistency, and schema drift between code and database intent."

## 37. Production-Grade Improvements

### Simple words
If you wanted to mature this into a serious platform, you would tighten the data model first, then the orchestration, then the AI depth.

### Technical depth
Immediate fixes:
1. fix cache keys for score/search history
2. unify on Clerk identity handling everywhere
3. repair Watch credit/accounting logic
4. fix report agent logging schema mismatch
5. align OpenAPI with runtime
6. add uniqueness/canonicalization for properties
7. replace mock market data with cache-table reads

Near-term platform upgrades:
1. structured logging with request and session correlation
2. Redis-backed rate limiting
3. background jobs for report/card/watch processing
4. idempotency keys for expensive routes
5. better RLS hardening
6. tests in CI
7. per-provider retry/backoff policy

AI-specific upgrades:
1. clarification planner that actually populates `clarifications_requested`
2. evidence-aware citations in Lens and report
3. retrieval over property docs and legal records
4. memory summarization for longer Lens sessions
5. model specialization by task
6. post-generation validation and critic pass

### Interview-ready phrasing
"I would mature this in three passes: correctness first, platform resilience second, and deeper agent capability third."

## 38. Creative Evolution Toward an "Ultimate Product"

### Simple words
Do not pitch this as unfinished. Pitch it as a strong foundation with clear next expansions.

### Technical depth
Creative evolution ideas:

1. Property Evidence Graph
- every property becomes a graph of evidence nodes:
  - legal
  - environmental
  - developer
  - pricing
  - user behavior
- scores cite graph nodes, not just raw sources

2. Multi-pass Analysis
- pass 1: deterministic feature extraction
- pass 2: anomaly detector
- pass 3: LLM explanation
- pass 4: compliance critic

3. Agent Roles
- Market agent
- Legal agent
- Builder reputation agent
- Rental yield agent
- Investor persona planner

4. Document RAG
- ingest title docs, sale deeds, RERA filings, court PDFs, brochures
- retrieve evidence during Lens and Report

5. Temporal Monitoring
- scheduled re-score
- change detection
- alert only on meaningful deltas
- explain why the delta changed

6. Human-in-the-loop review
- analysts can inspect failed or low-confidence runs
- approve or annotate model outputs

7. Trust calibration
- show confidence not just overall, but per category and per source

8. Portfolio Intelligence
- move from single-property analysis to portfolio-level exposure and diversification insights

### Interview-ready phrasing
"The MVP already separates facts from language. That makes it a strong base for evolving into an evidence graph plus multi-agent property intelligence platform."

## 39. Folder-by-Folder Explanation

### `src/`
Main application source.

### `src/app.ts`
Express app assembly and middleware chain.

### `src/index.ts`
Runtime entrypoint.

### `src/config/`
Environment configuration.

### `src/lib/`
Shared low-level utilities:
- `db.ts` for Supabase clients
- `gemini.ts` for model config/client
- `email.ts` for Resend
- `mock-data.ts` for non-CRUX property listing mocks

### `src/middleware/`
Security, validation, auth, rate limits, and error handling.

### `src/routes/`
Transport layer.
- `crux.ts` is the most important router.
- other routes handle auth, contact, searches, billing, onboarding, health.

### `src/modules/crux/`
Primary product module.

Subfolders:
- `agents/` AI and AI-adjacent orchestration
- `ingestion/` property normalization
- `scoring/` score orchestration
- `lens/` session/message persistence
- `report/` report persistence
- `card/` shareable score snapshots
- `watch/` credits and registration
- `shared/` types and errors

### `src/openapi/`
OpenAPI generation.

### `src/services/`
General application services outside CRUX:
- auth
- user sync
- search history
- contact/leads
- waitlist
- onboarding

### `packages/types/`
Workspace-shared TypeScript types and generated OpenAPI types.

### `supabase/`
Database schema, auth config, migrations.

### `scripts/`
Manual testing and data seeding utilities.

### `fixtures/`
Mock API payloads and examples for frontend/testing.

## 40. File Importance Ranking

### Tier 1: Understand these first
1. `src/routes/crux.ts`
2. `src/modules/crux/agents/lens.agent.ts`
3. `src/modules/crux/scoring/index.ts`
4. `src/modules/crux/agents/scoring.agent.ts`
5. `src/modules/crux/agents/fetcher.agent.ts`
6. `src/modules/crux/agents/report.agent.ts`
7. `src/modules/crux/ingestion/index.ts`
8. `src/modules/crux/lens/lens.service.ts`
9. `src/config/env.ts`
10. `src/lib/db.ts`

### Tier 2: Important platform files
11. `src/app.ts`
12. `src/routes/index.ts`
13. `src/middleware/security.ts`
14. `src/middleware/errorHandler.ts`
15. `src/middleware/rateLimit.middleware.ts`
16. `src/services/searchHistory.service.ts`
17. `src/routes/auth.routes.ts`
18. `src/services/userSync.service.ts`
19. `src/modules/crux/card/card.generator.ts`
20. `src/modules/crux/card/card.service.ts`

### Tier 3: DB and contract truth
21. `supabase/migrations/20260414000000_crux_init.sql`
22. `supabase/migrations/20260421000000_crux_lens_messages.sql`
23. `supabase/migrations/20260422000003_crux_searches.sql`
24. `src/openapi/schemas.ts`
25. `packages/types/src/crux.types.ts`

### Tier 4: Supporting product files
26. `src/routes/searches.routes.ts`
27. `src/routes/billing.routes.ts`
28. `src/routes/webhooks.routes.ts`
29. `src/routes/auth.ts`
30. `Dockerfile`

## 41. Every Agent Explained

### Fetcher agent

Simple:
- gathers raw signals from external or mocked data sources.

Technical:
- parallel external fetch fan-out
- circuit breakers
- partial-failure tolerant aggregation
- no LLM usage today

Interview-ready:
- "Fetcher is named like an agent, but architecturally it is a resilient data aggregation service."

### Scoring agent

Simple:
- turns raw facts into category scores and one composite score.

Technical:
- pure deterministic function
- weighted logic
- confidence derived from source coverage and freshness
- no LLM usage

Interview-ready:
- "Scoring is deterministic by design, which gives explainability and cost control."

### Lens agent

Simple:
- chatbot that can fetch or trigger CRUX capabilities.

Technical:
- Gemini streaming chat
- tool calling
- bounded loop
- SSE
- session history and property context

Interview-ready:
- "Lens is the front-door orchestrator agent."

### Report agent

Simple:
- writes the plain-English explanation.

Technical:
- Gemini prompt-to-JSON generation
- schema parsing
- DB-backed caching
- compliance disclaimer in code

Interview-ready:
- "Report is a constrained narrative generation layer, not an unconstrained chatbot."

## 42. Every Tool Explained

### `triggerScore`
- Simple: calculate or fetch the score.
- Technical: calls `getOrComputeScore()` with fixed lifecycle/macro defaults inside Lens.
- Interview-ready: "This is the main factual tool Lens can use."

### `triggerCast`
- Simple: future valuation tool.
- Technical: currently returns `coming_soon`.
- Interview-ready: "The interface exists to stabilize future orchestration."

### `triggerYield`
- Simple: future rental return tool.
- Technical: currently returns `coming_soon`.
- Interview-ready: "It is stubbed into the Lens tool surface already."

### `askClarification`
- Simple: ask the user for missing info.
- Technical: exposed in the function schema but not yet driven by scoring output.
- Interview-ready: "The hook exists, but the closed-loop clarification planner is still to be implemented."

## 43. Persistence of Memory and State

### Simple words
The system remembers things in normal database tables.

### Technical depth
Persistence map:
- property memory -> `crux_properties`
- geocode cache -> `crux_geocode_cache`
- score cache -> `crux_scores`
- report cache -> `crux_reports`
- card snapshots -> `crux_cards`
- Lens session metadata -> `crux_lens_sessions`
- Lens messages -> `crux_lens_messages`
- watch credits -> `crux_users.watch_credits` and also `crux_watch_credits` table conceptually
- watch registrations -> `crux_watch_registrations`
- search memory -> `crux_searches`
- agent telemetry -> `crux_agent_logs`

### Interview-ready phrasing
"Nothing important is held only in RAM except transient control state and rate limit counters."

## 44. Failure Handling Mechanisms

### Simple words
The app usually tries to degrade gracefully instead of failing loudly.

### Technical depth
Mechanisms:
- AppError + global handler
- cache-first execution
- partial success in fetcher
- confidence degradation
- circuit breakers
- non-blocking log writes
- optional report dependency in card flow
- user-friendly fallback success in lead/email flows

### Interview-ready phrasing
"The repo prefers graceful degradation over hard failure, especially in user-facing intelligence flows."

## 45. Recovery from Tool, Model, or Agent Failure

### Simple words
If a model or tool step breaks, the system often keeps the workflow alive with less detail.

### Technical depth
Recoveries:
- tool/provider failure -> fetcher returns `success: false`, scoring continues
- low source coverage -> lower `confidence_score`
- report failure -> card still generated
- Lens internal error -> SSE error payload returned cleanly
- search-history cache failure -> falls back to normal compute path
- geocode cache failure -> falls back to live geocoding

Missing recoveries:
- no model retry strategy
- no checkpoint resume
- no dead-letter queue

### Interview-ready phrasing
"Recovery is mostly synchronous degradation, not asynchronous remediation."

## 46. Orchestration Logic Step by Step

### Simple words
The orchestration is:
- prepare context,
- call tool if needed,
- continue with updated context,
- return answer.

### Technical depth
Lens orchestration steps:
1. load session
2. load context
3. build prompt
4. call Gemini
5. inspect function calls
6. execute application tool
7. append tool result to context
8. re-enter model loop
9. stream final answer
10. persist messages

Score orchestration steps:
1. read property
2. fetch sources in parallel
3. compute deterministic score
4. upsert cache row
5. persist search snapshot

Report orchestration steps:
1. get cached report if possible
2. get score
3. prompt Gemini for JSON
4. validate and store

### Interview-ready phrasing
"Orchestration is explicit in code rather than hidden in a framework runtime."

## 47. Prompts and Why They Look That Way

### Lens prompt

Simple:
- tells the model what it is, what property it is looking at, what score exists, what tools it can use, and what legal boundaries it must respect.

Technical:
- layered prompt design reduces ambiguity
- property and score are injected as structured JSON
- hard guardrails target investment-advice risk
- tool list encourages action rather than vague replies

Interview-ready:
- "The prompt is built like a product contract, not just prose."

### Report prompt

Simple:
- tells the model to write a factual report and return strict JSON only.

Technical:
- explicit output schema
- source citation requirement by name
- no methodology leak
- no recommendation language
- system-appended disclaimer

Interview-ready:
- "The report prompt is optimized for compliance, structure, and low hallucination freedom."

## 48. Mock Technical Interview

### Q1. What is CRUX?
- Simple: It is a property research engine.
- Technical: It combines deterministic multi-source scoring with LLM-based explanation and chat.
- Interview-ready: "CRUX is a property intelligence backend that separates factual scoring from narrative synthesis."

### Q2. Is this a real multi-agent system?
- Simple: Not in the swarm sense.
- Technical: It is a supervisor tool-calling architecture with multiple AI-related modules but not autonomous peer agents.
- Interview-ready: "I would call it agentic orchestration, not a true multi-agent framework."

### Q3. Why not let the LLM compute the score?
- Simple: Because numbers should be stable and auditable.
- Technical: deterministic scoring improves reproducibility, cost, explainability, and compliance.
- Interview-ready: "The model explains; the code computes."

### Q4. How does Lens use tools?
- Simple: It decides when it needs a backend capability and calls it.
- Technical: Gemini function declarations are bound to internal dispatch logic and looped through a bounded orchestration cycle.
- Interview-ready: "Lens uses structured function calling backed by internal services."

### Q5. Where is memory stored?
- Simple: In Supabase tables.
- Technical: sessions, messages, caches, search history, cards, and watch state all persist in relational tables and JSON payloads.
- Interview-ready: "Memory is relational and TTL-driven, not vector-based."

### Q6. Do you use LangGraph?
- Simple: No.
- Technical: no graph runtime or checkpointing exists; orchestration is handwritten.
- Interview-ready: "No, but the module boundaries map well to a future graph migration."

### Q7. Do you use CrewAI?
- Simple: No.
- Technical: no role-based multi-agent framework is present.
- Interview-ready: "No, current orchestration is framework-free."

### Q8. Do you have RAG?
- Simple: Not yet.
- Technical: no embeddings or retrieval stack; only live data fetches and relational context assembly.
- Interview-ready: "Not yet. It is data-grounded, but not retrieval-grounded."

### Q9. How do you handle partial failure?
- Simple: keep going with reduced confidence.
- Technical: `Promise.allSettled`, fallback defaults, cached responses, and degraded confidence are the main strategy.
- Interview-ready: "The system prefers graceful degradation with confidence reduction."

### Q10. What would you improve first?
- Simple: correctness before complexity.
- Technical: fix cache keys, unify identity handling, repair Watch accounting, align logging and contracts, then add async orchestration and retrieval.
- Interview-ready: "My first move is correctness hardening, not more AI complexity."

## 49. Cross-Questioning Follow-Ups

### If they ask: "Why is LangGraph not necessary yet?"
- Simple: Because the workflows are still short.
- Technical: the current paths are linear enough that a custom orchestrator is cheaper operationally and cognitively.
- Interview-ready: "Framework overhead is not justified until we need checkpointing, branching recovery, or longer-lived tasks."

### If they ask: "Why keep some features as stubs?"
- Simple: To stabilize interfaces early.
- Technical: the tool surface and route contracts can be front-end integrated before the heavy capability is built.
- Interview-ready: "The stubs reduce future integration churn by freezing API and orchestration boundaries early."

### If they ask: "What is the biggest risk if this goes to production tomorrow?"
- Simple: wrong results from cache and identity mismatches.
- Technical: incorrect cache keys, mixed auth semantics, and watch-credit/accounting inconsistencies could create correctness and trust issues.
- Interview-ready: "The largest risk is correctness drift, not model hallucination."

## 50. Architecture Defense Questions

### Why use Supabase and Clerk together?
- Simple: one for app auth, one for database/platform services.
- Technical: Clerk handles user identity and session verification while Supabase provides Postgres, RPCs, and ancillary auth/email flows. But the dual-stack also creates complexity.
- Interview-ready: "It is pragmatic for MVP velocity, but I would probably consolidate auth responsibilities over time."

### Why use Express instead of a workflow engine?
- Simple: because the flows are still manageable.
- Technical: request/response service orchestration is adequate at current complexity and cheaper than introducing workflow runtime overhead too early.
- Interview-ready: "I optimized for simplicity and debuggability first."

### Why store score breakdowns in JSONB?
- Simple: flexible structure.
- Technical: JSONB allows schema evolution without immediate migration churn, while still keeping top-level queryable columns separate.
- Interview-ready: "It balances iteration speed with relational storage."

## 51. Scalability Questions

### How would you scale score computation?
- Simple: cache more and move heavy work off the request path.
- Technical: async job queue, provider-level caching, batched recomputation, prewarming, and stronger cache keys.
- Interview-ready: "I would move compute-heavy score/report generation toward queued, idempotent workflows."

### How would you scale Lens?
- Simple: smaller context and better infra.
- Technical: summarized session memory, Redis-backed rate limiting, streaming gateway patterns, and tool execution isolation.
- Interview-ready: "Lens scales better if context is compressed and orchestration is decoupled from the request thread."

## 52. Agentic AI Workflow Questions

### What makes this agentic?
- Simple: the model can choose actions, not just reply.
- Technical: tool selection plus iterative reasoning over tool outputs are the core agentic characteristics present.
- Interview-ready: "Agentic means the model is embedded in an action loop, not just a text generator."

### Why not more autonomous agents?
- Simple: because trust matters more than novelty here.
- Technical: property research is high-trust and fact-sensitive, so bounded orchestration is a safer MVP than open-ended autonomous delegation.
- Interview-ready: "I deliberately constrained autonomy to preserve reliability."

## 53. LangGraph Deep-Dive Questions

### How would you map this to LangGraph?
- Simple: each module becomes a node.
- Technical: nodes for ingest, fetch, score, clarify, report, card, watch, with typed graph state and checkpoint persistence.
- Interview-ready: "The current code already has clean node boundaries."

### What would graph state contain?
- Simple: property, fetch results, score, clarifications, report, status.
- Technical: typed state object with property identity, fetch payloads, score cache keys, confidence, clarification queue, message history summary, and execution metadata.
- Interview-ready: "I would make the graph state explicit and durable."

## 54. Failure Scenario Questions

### What happens if two external sources fail?
- Simple: CRUX still scores, but with less confidence.
- Technical: fetcher aggregates failures into unsuccessful source entries; scorer still computes using defaults and lowers confidence by coverage ratio.
- Interview-ready: "The score still returns, but we expose degraded confidence."

### What happens if Gemini returns invalid JSON for the report?
- Simple: report generation fails cleanly.
- Technical: the backend strips fences, parses JSON, validates required fields, and throws `REPORT_PARSE_FAILED` on failure.
- Interview-ready: "We validate model output before persistence."

### What happens if Lens crashes mid-stream?
- Simple: the client receives an SSE error event.
- Technical: the catch block emits an error chunk with `done: true`, then closes the stream.
- Interview-ready: "Lens fails in-band through SSE rather than hanging the socket."

## 55. Tradeoff Questions

### Why use mocks for NHB and CPWD?
- Simple: to get the product working early.
- Technical: it decouples product flow development from full external data-pipeline completion, but it creates realism gaps that must be closed later.
- Interview-ready: "I used mocks to stabilize the domain model and orchestration before investing in full ingestion pipelines."

### Why use public read access for some CRUX tables?
- Simple: faster MVP development.
- Technical: it lowers friction for prototype access patterns but is too open for a hardened multi-tenant production environment.
- Interview-ready: "It is acceptable for rapid MVP iteration, but I would tighten it before scale."

## 56. Security Questions

### Why is sending tokens in query params risky?
- Simple: URLs leak more easily.
- Technical: tokens in query params can appear in browser history, logs, redirects, and analytics surfaces.
- Interview-ready: "I would prefer short-lived server exchange plus HttpOnly cookies."

### How would you harden Lens data access?
- Simple: tie sessions more tightly to users.
- Technical: stricter RLS, signed session tokens, per-session ownership checks, and removal of permissive anon policies.
- Interview-ready: "I would make session ownership explicit in both app auth and database policy."

## 57. "What Would You Improve?" Questions

### Best answer structure
- Simple: start with correctness.
- Technical: fix cache-key correctness, auth consistency, watch accounting, logging schema drift, then move expensive workflows async.
- Interview-ready: "First correctness, then resilience, then capability expansion."

## 58. How to Present This Project Confidently

### Simple words
Do not oversell it as a finished autonomous AI system.
Sell it as a disciplined MVP with strong architectural instincts.

### Technical depth
Best framing:
1. "I separated deterministic scoring from LLM explanation."
2. "I used persistent state and multiple caches to control latency and cost."
3. "I implemented tool-calling chat instead of a generic Q&A bot."
4. "I intentionally bounded the orchestration loop."
5. "I can clearly describe the next production-hardening steps."

Avoid saying:
- "This is a full multi-agent platform."
- "We use LangGraph/CrewAI."
- "It is production-ready in every sense."

Say instead:
- "It is an MVP with a sound modular architecture."
- "The agentic layer is intentionally constrained."
- "The next step is correctness hardening and richer evidence retrieval."

### Interview-ready phrasing
"My strongest architectural decision here was drawing a hard line between deterministic evidence processing and probabilistic explanation."

## 59. Final Positioning Summary

### Simple words
This repo is a strong systems-thinking MVP.

### Technical depth
It already demonstrates:
- AI product thinking
- service decomposition
- API design
- persistence strategy
- session memory
- streaming
- compliance-aware prompting
- cache layering

Its main weaknesses are fixable and mostly infrastructural:
- auth consistency
- cache correctness
- schema drift
- observability maturity
- tighter data realism

### Interview-ready phrasing
"I would defend this as an intentionally scoped, modular, and extensible AI backend MVP whose core architecture is stronger than its current feature completeness."
