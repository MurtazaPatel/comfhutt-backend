import { supabase } from '../../../lib/db';
import { AppError } from '../shared/errors';
import type {
  CruxScore,
  IntentProfile,
  LifecycleStage,
  MacroCycle,
  PropertyProfile,
} from '../shared/types';
import { fetchAllSources } from '../agents/fetcher.agent';
import { computeScore } from '../agents/scoring.agent';

async function computeAndPersist(
  propertyId: string,
  intent: IntentProfile,
  lifecycle: LifecycleStage,
  macroCycle: MacroCycle,
): Promise<CruxScore> {
  const { data: row, error: fetchErr } = await supabase
    .from('crux_properties')
    .select('*')
    .eq('id', propertyId)
    .maybeSingle();

  if (fetchErr) throw new AppError(500, 'DB_READ_FAILED', fetchErr.message);
  if (!row) throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found');

  const profile = row as unknown as PropertyProfile;
  const fetcherOutput = await fetchAllSources(profile);
  const score = computeScore(fetcherOutput, intent, lifecycle, macroCycle);

  const { error: upsertErr } = await supabase
    .from('crux_scores')
    .upsert(score, { onConflict: 'property_id,intent_profile' });

  if (upsertErr) throw new AppError(500, 'SCORE_COMPUTATION_FAILED', upsertErr.message);

  const scorerStart = Date.now();
  supabase
    .from('crux_agent_logs')
    .insert({
      agent_type: 'scorer',
      property_id: propertyId,
      input_payload: {
        sources_succeeded: fetcherOutput.sources_succeeded,
        intent,
        lifecycle,
        macro: macroCycle,
      },
      output_payload: {
        score_composite: score.score_composite,
        confidence_score: score.confidence_score,
        degraded: score.degraded,
      },
      tokens_used: 0,
      latency_ms: Date.now() - scorerStart,
      status: 'success',
    })
    .then(({ error }) => {
      if (error) console.error('[scorer] log error:', error.message);
    });

  return score;
}

export async function getOrComputeScore(
  propertyId: string,
  intent: IntentProfile,
  lifecycle: LifecycleStage,
  macroCycle: MacroCycle,
): Promise<CruxScore> {
  const { data: cached } = await supabase
    .from('crux_scores')
    .select('*')
    .eq('property_id', propertyId)
    .eq('intent_profile', intent)
    .gt('ttl_expires_at', new Date().toISOString())
    .maybeSingle();

  if (cached) return cached as unknown as CruxScore;

  return computeAndPersist(propertyId, intent, lifecycle, macroCycle);
}

export async function forceRecomputeScore(
  propertyId: string,
  intent: IntentProfile,
  lifecycle: LifecycleStage,
  macroCycle: MacroCycle,
): Promise<CruxScore> {
  return computeAndPersist(propertyId, intent, lifecycle, macroCycle);
}
