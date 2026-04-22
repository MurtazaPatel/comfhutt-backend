-- Migration: 20260422000003_crux_searches
-- Persists every CRUX Score run per user for history and caching.

CREATE TABLE IF NOT EXISTS crux_searches (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id     TEXT        NOT NULL
                               REFERENCES crux_users(clerk_user_id)
                               ON DELETE CASCADE,
  property_id       TEXT        NOT NULL,
  address_raw       TEXT,
  crux_score        INTEGER,
  score_grade       TEXT,
  score_snapshot    JSONB,
  share_token       TEXT        UNIQUE,
  searched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup: all searches by a user, newest first
CREATE INDEX IF NOT EXISTS crux_searches_user_idx
  ON crux_searches(clerk_user_id, searched_at DESC);

-- Fast lookup: check if property was recently searched by this user
CREATE INDEX IF NOT EXISTS crux_searches_property_user_idx
  ON crux_searches(clerk_user_id, property_id, searched_at DESC);

-- Fast lookup: share token → search result (for card sharing)
CREATE INDEX IF NOT EXISTS crux_searches_share_token_idx
  ON crux_searches(share_token)
  WHERE share_token IS NOT NULL;

COMMENT ON TABLE crux_searches IS
  'Log of every CRUX Score run per user.
   score_snapshot stores key result fields for fast history display
   without re-running the scoring engine.';

COMMENT ON COLUMN crux_searches.score_snapshot IS
  'JSONB snapshot of top-level score result:
   { totalScore, grade, categoryScores, verdict, timestamp }.
   Not the full report — just enough to render history cards.';

COMMENT ON COLUMN crux_searches.share_token IS
  'Share token for the card URL: crux.comfhutt.com/card/<share_token>.
   NULL if user has not shared this result.';
