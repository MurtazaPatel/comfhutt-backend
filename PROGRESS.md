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

## Auth Layer — Complete

Full auth backend is now live:
  - Clerk session verification on every tool route
  - Webhook-driven provisioning (primary path)
  - /auth/me fallback sync
  - isNewUser flag for frontend onboarding flow
  - Soft delete on user.deleted
  - All tool routes protected — /card/:token and /health intentionally open
