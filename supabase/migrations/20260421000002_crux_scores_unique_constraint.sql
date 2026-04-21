-- ─────────────────────────────────────────────────────────────
-- Migration: crux_scores unique constraint
-- Created:   2026-04-21
-- Reason:    Scoring upsert uses onConflict: 'property_id,intent_profile'
--            which requires a UNIQUE constraint (not just an index).
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.crux_scores
  ADD CONSTRAINT crux_scores_property_intent_unique
  UNIQUE (property_id, intent_profile);
