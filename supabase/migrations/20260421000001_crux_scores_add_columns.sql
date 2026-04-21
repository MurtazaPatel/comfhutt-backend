-- ─────────────────────────────────────────────────────────────
-- Migration: crux_scores add missing columns
-- Created:   2026-04-21
-- Reason:    CruxScore type and scoring agent reference `degraded`
--            and `clarifications_requested` but these columns were
--            omitted from the initial crux_scores table definition.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.crux_scores
  ADD COLUMN IF NOT EXISTS degraded                  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS clarifications_requested  JSONB   NOT NULL DEFAULT '[]';

COMMENT ON COLUMN public.crux_scores.degraded IS
  'True when confidence_score < 0.4 — signals low-quality data inputs.';

COMMENT ON COLUMN public.crux_scores.clarifications_requested IS
  'Array of ClarificationRequest objects surfaced to the user via Lens chat.';
