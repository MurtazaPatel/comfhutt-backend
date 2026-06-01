import { supabase } from '../../../lib/db';
import { AppError } from '../shared/errors';
import type {
  CruxScore,
  IntentProfile,
  LifecycleStage,
  MacroCycle,
  PropertyProfile,
} from '../shared/types';
import { computeScore } from '../agents/scoring.agent';
import { runUnifiedPipeline } from '../orchestrator/orchestrator.service';

async function computeAndPersist(
  propertyId: string,
  intent: IntentProfile,
  lifecycle: LifecycleStage,
  macroCycle: MacroCycle,
  onProgress?: (msg: string) => void,
): Promise<CruxScore> {
  const { data: row, error: fetchErr } = await supabase
    .from('crux_properties')
    .select('*')
    .eq('id', propertyId)
    .maybeSingle();

  if (fetchErr) throw new AppError(500, 'DB_READ_FAILED', fetchErr.message);
  if (!row) throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found');

  const profile = row as unknown as PropertyProfile;

  if (onProgress) onProgress('Initiating automated analysis pipeline...');
  const pipelineResult = await runUnifiedPipeline(profile, onProgress);

  const verifiedEvidence = pipelineResult.verificationDigest?.verified_items ?? [];

  if (onProgress) onProgress('Compiling composite CRUX score...');
  const score = await computeScore(
    pipelineResult.fetcherOutput,
    intent,
    lifecycle,
    macroCycle,
    verifiedEvidence.length > 0 ? verifiedEvidence : undefined,
  );

  if (onProgress) onProgress('Finalizing and saving results...');

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
        sources_succeeded: pipelineResult.fetcherOutput.sources_succeeded,
        intent,
        lifecycle,
        macro: macroCycle,
        verified_evidence_used: verifiedEvidence.length,
      },
      output_payload: {
        score_composite: score.score_composite,
        confidence_score: score.confidence_score,
        degraded: score.degraded,
        weight_adjustments_applied:
          (score.weight_adjustments?.length ?? 0) > 0,
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
  onProgress?: (msg: string) => void,
): Promise<CruxScore> {
  const { data: cached } = await supabase
    .from('crux_scores')
    .select('*')
    .eq('property_id', propertyId)
    .eq('intent_profile', intent)
    .gt('ttl_expires_at', new Date().toISOString())
    .maybeSingle();

  if (cached) return cached as unknown as CruxScore;

  return computeAndPersist(propertyId, intent, lifecycle, macroCycle, onProgress);
}

export async function forceRecomputeScore(
  propertyId: string,
  intent: IntentProfile,
  lifecycle: LifecycleStage,
  macroCycle: MacroCycle,
  onProgress?: (msg: string) => void,
): Promise<CruxScore> {
  return computeAndPersist(propertyId, intent, lifecycle, macroCycle, onProgress);
}