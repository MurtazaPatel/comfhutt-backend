import { createHash } from 'crypto';
import type {
  AggregatedFetcherOutput,
  EvidenceDomain,
  EvidenceAuthorityTier,
  FetcherResult,
} from './types';

interface DraftEvidenceItem {
  run_id: string;
  property_id: string;
  domain: EvidenceDomain;
  source_kind: 'web';
  authority_tier: EvidenceAuthorityTier;
  status: 'accepted' | 'weak' | 'rejected';
  claim_text: string;
  normalized_claim: Record<string, unknown>;
  source_title: string;
  source_url: string | null;
  source_path: null;
  excerpt: string;
  observed_at: string | null;
  freshness_expires_at: string | null;
  confidence: number;
  rejection_reason: string | null;
  claim_hash: string;
}

function sourceConfidence<T>(result: FetcherResult<T>): number {
  if (result.success) return 0.85;
  if (result.data) return 0.30;
  return 0;
}

function computeClaimHash(
  domain: EvidenceDomain,
  claimText: string,
  sourceIdentity: string,
): string {
  const canonical = JSON.stringify({
    domain,
    claim_text: claimText.trim().toLowerCase(),
    source: sourceIdentity,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function createDraft(
  result: FetcherResult<unknown>,
  domain: EvidenceDomain,
  authorityTier: EvidenceAuthorityTier,
  claimText: string,
  normalizedClaim: Record<string, unknown>,
  sourceTitle: string,
  sourceUrl: string | null,
  runId: string,
  propertyId: string,
): DraftEvidenceItem | null {
  const conf = sourceConfidence(result);
  if (conf === 0) return null;

  const claimHash = computeClaimHash(domain, claimText, sourceUrl ?? sourceTitle);

  const status = result.success ? 'accepted' : 'weak';
  const rejectionReason = result.success ? null : `STALE_${result.source.toUpperCase()}_DATA`;

  return {
    run_id: runId,
    property_id: propertyId,
    domain,
    source_kind: 'web',
    authority_tier: authorityTier,
    status,
    claim_text: claimText,
    normalized_claim: normalizedClaim,
    source_title: sourceTitle,
    source_url: sourceUrl,
    source_path: null,
    excerpt: claimText,
    observed_at: result.fetched_at,
    freshness_expires_at: null,
    confidence: conf,
    rejection_reason: rejectionReason,
    claim_hash: claimHash,
  };
}

function pushDraft(
  items: DraftEvidenceItem[],
  draft: DraftEvidenceItem | null,
): void {
  if (draft) items.push(draft);
}

export function fetcherOutputToEvidenceItems(
  output: AggregatedFetcherOutput,
  runId: string,
): DraftEvidenceItem[] {
  const items: DraftEvidenceItem[] = [];

  if (output.cpcb_aqi.data) {
    const d = output.cpcb_aqi.data;
    pushDraft(items, createDraft(
      output.cpcb_aqi,
      'environment',
      'official',
      `CPCB AQI reading for ${d.station}: ${d.aqi} (${d.category} category) recorded at ${d.recorded_at}`,
      { aqi: d.aqi, category: d.category, station: d.station, recorded_at: d.recorded_at },
      'CPCB AQI',
      'https://app.cpcbccr.com/',
      runId,
      output.property_id,
    ));
  }

  if (output.google_maps.data) {
    const d = output.google_maps.data;
    pushDraft(items, createDraft(
      output.google_maps,
      'locality',
      'secondary',
      `Google Maps locality analysis: ${d.poi_count_500m} points of interest within 500m, commute to CBD approx ${d.commute_minutes_to_cbd ?? 'unknown'} minutes`,
      {
        poi_count_500m: d.poi_count_500m,
        commute_minutes_to_cbd: d.commute_minutes_to_cbd,
        walkability_score: d.walkability_score,
        transit_score: d.transit_score,
      },
      'Google Maps',
      'https://maps.googleapis.com/',
      runId,
      output.property_id,
    ));
  }

  if (output.nhb_residex.data) {
    const d = output.nhb_residex.data;
    pushDraft(items, createDraft(
      output.nhb_residex,
      'market',
      'official',
      `NHB RESIDEX for ${d.city}: HPI current ${d.hpi_current}, quarter-on-quarter change ${d.hpi_qoq_change}% (${d.period})`,
      {
        city: d.city,
        hpi_current: d.hpi_current,
        hpi_qoq_change: d.hpi_qoq_change,
        period: d.period,
      },
      'NHB RESIDEX',
      'https://residex.nhbonline.org.in/',
      runId,
      output.property_id,
    ));
  }

  if (output.mca21.data) {
    const d = output.mca21.data;
    const npaText = d.npa_flag ? 'has NPA flag' : 'no NPA flag';
    const sourceUrl = d.company_name
      ? `https://www.zaubacorp.com/company/${d.company_name.toLowerCase().replace(/\s+/g, '-')}`
      : null;
    pushDraft(items, createDraft(
      output.mca21,
      'developer',
      'official',
      `MCA21 company record for ${d.company_name} (CIN: ${d.cin}): status ${d.company_status}, ${npaText}, incorporated ${d.incorporation_date}`,
      {
        company_name: d.company_name,
        cin: d.cin,
        company_status: d.company_status,
        npa_flag: d.npa_flag,
        incorporation_date: d.incorporation_date,
      },
      'MCA21',
      sourceUrl,
      runId,
      output.property_id,
    ));
  }

  if (output.ecourts.data) {
    const d = output.ecourts.data;
    const caseTypes = Array.isArray(d.case_types) ? d.case_types : []
    pushDraft(items, createDraft(
      output.ecourts,
      'legal',
      'official',
      `eCourts search: ${d.cases_found ?? 0} cases found, ${d.open_cases ?? 0} open, ${d.closed_cases ?? 0} closed. Case types: ${caseTypes.join(', ') || 'none'}`,
      {
        cases_found: d.cases_found ?? 0,
        open_cases: d.open_cases ?? 0,
        closed_cases: d.closed_cases ?? 0,
        case_types: caseTypes,
      },
      'eCourts India',
      'https://ecourts.gov.in/',
      runId,
      output.property_id,
    ));
  }

  if (output.cpwd.data) {
    const d = output.cpwd.data;
    pushDraft(items, createDraft(
      output.cpwd,
      'market',
      'official',
      `CPWD construction cost for ${d.state} (${d.city_tier}): ${d.construction_cost_per_sqft} paise/sqft, last updated ${d.last_updated}`,
      {
        state: d.state,
        city_tier: d.city_tier,
        construction_cost_per_sqft: d.construction_cost_per_sqft,
        last_updated: d.last_updated,
      },
      'CPWD',
      'https://cpwd.gov.in/',
      runId,
      output.property_id,
    ));
  }

  return items;
}