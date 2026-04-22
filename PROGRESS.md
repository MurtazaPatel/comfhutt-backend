# CRUX Backend Development Progress

## Prompt 17 — Clerk Integration

- [x] TASK-17-A — feat(auth): mount Clerk middleware globally
- [x] TASK-17-B — feat(auth): add requireAuth middleware (Clerk)
- [x] TASK-17-C — feat(db): add crux_users migration
- [x] TASK-17-D — feat(auth): UserSyncService for Clerk→Supabase sync
- [x] TASK-17-E — feat(auth): add /api/crux/auth/me endpoint
- [x] TASK-17-F — feat(auth): protect score, lens, watch, report routes
- [x] TASK-17-G — docs: env vars + progress update

## Prompt 17-B — Webhook + User Provisioning + Flow Completion

- [x] TASK-17B-A — feat(db): onboarding_completed + provisioned_via columns
- [x] TASK-17B-B — feat(auth): provisionedVia in UserSyncService
- [x] TASK-17B-C — feat(auth): Clerk webhook handler with Svix verification
- [x] TASK-17B-D — feat(auth): isNewUser flag + /auth/onboarding-complete
- [x] TASK-17B-E — feat(auth): requireAuth audit on all tool routes
- [x] TASK-17B-F — docs: progress update

## Prompt 18 — Watch Credit Guard

- [x] TASK-18-A — feat(db): atomic watch credit decrement RPC
- [x] TASK-18-B — feat(auth): watchCreditGuard middleware
- [x] TASK-18-C — feat(watch): wire guard + creditsRemaining in response
- [x] TASK-18-D — docs: progress update

## Auth Layer + Watch Credits — Complete

Full auth backend is now live:
  - Clerk session verification on every tool route
  - Webhook-driven provisioning (primary path)
  - /auth/me fallback sync
  - isNewUser flag for frontend onboarding flow
  - Soft delete on user.deleted
  - All tool routes protected — /card/:token and /health intentionally open
  - Watch credit guard with atomic RPC decrement
  - creditsRemaining in watch response

## Prompt 19 — Search History Persistence

- [x] TASK-19-A — feat(db): add crux_searches table for search history
- [x] TASK-19-B — feat(search): add SearchHistoryService with persist, fetch, cache-check
- [x] TASK-19-C — feat(score): wire search history persist and 24h cache check
- [x] TASK-19-D — feat(search): add GET /searches/recent endpoint
- [x] TASK-19-E — docs: mark Prompt 19 complete in PROGRESS.md

## Search History + 24h Cache — Complete

Search history backend is now live:
  - crux_searches table with indexed lookups (user, property, share_token)
  - Atomic persistence on every score run
  - 24-hour cache check to avoid recomputing same property
  - GET /api/crux/searches/recent returns last 10 user searches
  - JSONB snapshot storage for fast history rendering (no re-scoring needed)
