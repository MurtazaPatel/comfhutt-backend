import { supabase } from '../../../lib/db'
import { AppError } from '../shared/errors'
import { getOrComputeScore } from '../scoring'
import { generateReport } from '../agents/report.agent'
import { createCard, CruxCardRow } from './card.service'
import type { IntentProfile } from '../shared/types'

export async function generateCard(
  propertyId: string,
  intent: string = 'balanced',
  userId: string | null = null
): Promise<CruxCardRow> {
  const { data: property, error: propError } = await supabase
    .from('crux_properties')
    .select('*')
    .eq('id', propertyId)
    .maybeSingle()

  if (propError || !property) {
    throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found.')
  }

  const score = await getOrComputeScore(
    propertyId,
    intent as IntentProfile,
    'delivered',
    'growth'
  )

  let report = null
  try {
    report = await generateReport(propertyId, intent)
  } catch (err) {
    console.error('[card.generator] report fetch failed, generating card without report:', err)
  }

  const cardData = {
    address: property.address_normalized ?? property.address_raw,
    city: property.city,
    state: property.state,
    property_type: property.property_type,
    score_composite: score.score_composite,
    score_breakdown: score.score_breakdown as unknown as Record<string, unknown>,
    confidence_score: score.confidence_score,
    intent_profile: intent,
    data_sources_used: score.data_sources_used,
    crux_version: score.crux_version,
    scored_at: score.created_at,
    summary: report?.summary ?? null,
    risk_flags: report?.risk_flags ?? [],
    positive_signals: report?.positive_signals ?? [],
  }

  return createCard(propertyId, userId, cardData)
}
