-- Add 'firecrawl' as a valid provider for crux_research_runs
-- The pipeline was migrated from Tavily to Firecrawl
ALTER TABLE public.crux_research_runs 
  DROP CONSTRAINT IF EXISTS crux_research_runs_provider_check;

ALTER TABLE public.crux_research_runs 
  ADD CONSTRAINT crux_research_runs_provider_check 
  CHECK (provider IN ('tavily', 'firecrawl'));

-- Update the default as well
ALTER TABLE public.crux_research_runs 
  ALTER COLUMN provider SET DEFAULT 'firecrawl';
