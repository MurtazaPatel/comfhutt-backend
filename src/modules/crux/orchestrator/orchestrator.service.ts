import { supabase } from '../../../lib/db';
import type {
  AggregatedFetcherOutput,
  EvidenceItem,
  PropertyProfile,
  VerificationDigest,
} from '../shared/types';
import { fetchAllSources } from '../agents/fetcher.agent';
import { runResearch } from '../agents/research.agent';
import { runVerification } from '../agents/verification.agent';
import type { ResearchRunResult } from '../research/research.service';
import type { VerificationRunResult } from '../verification/verification.service';
import { fetcherOutputToEvidenceItems } from '../shared/fetcher-to-evidence';

export interface UnifiedPipelineResult {
  fetcherOutput: AggregatedFetcherOutput;
  researchResult: ResearchRunResult | null;
  verificationResult: VerificationRunResult | null;
  verificationDigest: VerificationDigest | null;
}

async function insertFetcherEvidence(
  evidenceDrafts: ReturnType<typeof fetcherOutputToEvidenceItems>,
): Promise<EvidenceItem[]> {
  if (evidenceDrafts.length === 0) return [];

  const { data, error } = await supabase
    .from('crux_evidence_items')
    .upsert(
      evidenceDrafts.map((draft) => ({
        ...draft,
        created_at: new Date().toISOString(),
      })),
      {
        onConflict: 'run_id,claim_hash',
        ignoreDuplicates: true,
      },
    )
    .select('*');

  if (error) {
    console.error('[orchestrator] fetcher evidence insert failed:', error.message);
    return [];
  }

  return (data ?? []) as EvidenceItem[];
}

export async function runUnifiedPipeline(
  property: PropertyProfile,
): Promise<UnifiedPipelineResult> {
  const fetcherOutput = await fetchAllSources(property)

  let researchOutput: ResearchRunResult | null = null
  try {
    researchOutput = await runResearch({
      property_id: property.id,
      force_refresh: true,
      surface: 'api',
    })
  } catch (researchError) {
    console.warn('[orchestrator] research failed:', (researchError as Error)?.message ?? 'unknown')
  }

  let verificationOutput: VerificationRunResult | null = null;
  let verificationDigest: VerificationDigest | null = null;

  if (researchOutput) {
    const fetcherEvidence = fetcherOutputToEvidenceItems(
      fetcherOutput,
      researchOutput.run.id,
    );
    await insertFetcherEvidence(fetcherEvidence);

    try {
      verificationOutput = await runVerification({
        property_id: property.id,
        force_refresh: true,
      });
      verificationDigest = verificationOutput.digest;
    } catch (error) {
      console.error(
        '[orchestrator] verification failed:',
        (error as Error)?.message ?? 'unknown error',
      );
    }
  } else {
    console.warn(
      '[orchestrator] research failed, proceeding without verified evidence',
    );
  }

  return {
    fetcherOutput,
    researchResult: researchOutput,
    verificationResult: verificationOutput,
    verificationDigest,
  };
}