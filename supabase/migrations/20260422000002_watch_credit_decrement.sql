-- Migration: 20260422000002_watch_credit_decrement
-- Atomic Watch credit check + decrement via RPC.
-- Returns the remaining credits after decrement, or -1 if insufficient.

CREATE OR REPLACE FUNCTION crux_decrement_watch_credit(p_clerk_user_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_credits INTEGER;
BEGIN
  UPDATE crux_users
  SET watch_credits = watch_credits - 1
  WHERE clerk_user_id = p_clerk_user_id
    AND watch_credits > 0
  RETURNING watch_credits INTO v_credits;

  -- If no row was updated, credits were already 0
  IF v_credits IS NULL THEN
    RETURN -1;
  END IF;

  RETURN v_credits;
END;
$$;

COMMENT ON FUNCTION crux_decrement_watch_credit IS
  'Atomically decrements watch_credits by 1 if > 0.
   Returns remaining credits, or -1 if credits were already 0.
   Safe under concurrent requests — no race condition possible.';
