import { supabase } from '../../../lib/db'
import { AppError } from '../shared/errors'
import type { ResearchCitation } from '../shared/types'

export interface CruxReportRow {
  id: string
  property_id: string
  score_id: string
  intent_profile: string
  summary: string
  category_narratives: {
    legal_title: string
    location_quality: string
    developer_reliability: string
    market_valuation: string
    demand_signals: string
  }
  risk_flags: string[]
  positive_signals: string[]
  research_highlights: string[]
  citations: ResearchCitation[]
  sebi_disclaimer: string
  crux_version: string
  generated_at: string
  ttl_expires_at: string
}

export async function getCachedReport(
  propertyId: string,
  intentProfile: string
): Promise<CruxReportRow | null> {
  const { data, error } = await supabase
    .from('crux_reports')
    .select('*')
    .eq('property_id', propertyId)
    .eq('intent_profile', intentProfile)
    .gt('ttl_expires_at', new Date().toISOString())
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return null
  return data
}

export async function saveReport(report: Omit<CruxReportRow, 'id'>): Promise<CruxReportRow> {
  const { data, error } = await supabase
    .from('crux_reports')
    .insert(report)
    .select()
    .single()

  if (error || !data) {
    throw new AppError(500, 'REPORT_SAVE_FAILED', 'Failed to save report to database.')
  }
  return data
}
