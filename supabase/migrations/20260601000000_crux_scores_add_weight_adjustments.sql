-- Add weight_adjustments column to crux_scores table
ALTER TABLE crux_scores
ADD COLUMN IF NOT EXISTS weight_adjustments JSONB DEFAULT '[]'::jsonb;
