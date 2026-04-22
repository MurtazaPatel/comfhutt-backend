import crypto from 'crypto'
import { supabase } from '../../../lib/db'
import { AppError } from '../shared/errors'

const SEBI_CARD_DISCLAIMER =
  'Research tool only. Not investment advice. ' +
  'CRUX Score is a property credibility indicator, not a buy/sell recommendation. ' +
  'Consult a registered financial advisor before making any investment decision.'

export interface CruxCardSnapshot {
  address: string
  city: string
  state: string
  property_type: string
  score_composite: number
  score_breakdown: Record<string, unknown>
  confidence_score: number
  intent_profile: string
  data_sources_used: string[]
  crux_version: string
  scored_at: string
  summary: string | null
  risk_flags: string[]
  positive_signals: string[]
  sebi_disclaimer: string
  generated_at: string
  deep_link: string
}

export interface CruxCardRow {
  id: string
  property_id: string
  user_id: string | null
  share_token: string
  card_data: CruxCardSnapshot
  card_png_url: string | null
  card_pdf_url: string | null
  view_count: number
  created_at: string
  expires_at: string
}

function generateShareToken(): string {
  return crypto.randomBytes(9).toString('base64url').slice(0, 12)
}

export async function createCard(
  propertyId: string,
  userId: string | null,
  cardData: Omit<CruxCardSnapshot, 'deep_link' | 'sebi_disclaimer' | 'generated_at'>
): Promise<CruxCardRow> {
  const shareToken = generateShareToken()
  const generatedAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

  const fullCardData: CruxCardSnapshot = {
    ...cardData,
    sebi_disclaimer: SEBI_CARD_DISCLAIMER,
    generated_at: generatedAt,
    deep_link: `https://crux.comfhutt.com/card/${shareToken}`,
  }

  const { data, error } = await supabase
    .from('crux_cards')
    .insert({
      property_id: propertyId,
      user_id: userId,
      share_token: shareToken,
      card_data: fullCardData,
      expires_at: expiresAt,
    })
    .select()
    .single()

  if (error || !data) {
    throw new AppError(500, 'CARD_GENERATION_FAILED', 'Failed to save card to database.')
  }

  return data as CruxCardRow
}

export async function getCardByToken(shareToken: string): Promise<CruxCardRow> {
  const { data, error } = await supabase
    .from('crux_cards')
    .select('*')
    .eq('share_token', shareToken)
    .maybeSingle()

  if (error || !data) {
    throw new AppError(404, 'CARD_NOT_FOUND', 'Card not found or has expired.')
  }

  const newViewCount = (data.view_count ?? 0) + 1

  supabase
    .from('crux_cards')
    .update({ view_count: newViewCount })
    .eq('share_token', shareToken)
    .then(({ error: updateError }) => {
      if (updateError) console.error('[card.service] view_count update failed:', updateError)
    })

  return { ...data, view_count: newViewCount } as CruxCardRow
}
