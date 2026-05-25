import assert from 'node:assert/strict'
import test from 'node:test'
import type { EvidenceItem, PropertyProfile } from '../../src/modules/crux/shared/types'
import { computeDeterministicSignals, computeDirectMatch } from '../../src/modules/crux/verification/verification.policy'

const property: PropertyProfile = {
  id: 'property-1',
  address_raw: '123 Test Street, Mumbai',
  address_normalized: '123 Test Street, Mumbai',
  geocode_lat: 19.076,
  geocode_lng: 72.8777,
  pin_code: '400001',
  city: 'Mumbai',
  state: 'Maharashtra',
  property_type: 'residential_apartment',
  approx_size_sqft: 1200,
  developer_name: 'Example Developer',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

function createEvidence(overrides: Partial<EvidenceItem>): EvidenceItem {
  return {
    id: 'evidence-1',
    run_id: 'run-1',
    property_id: property.id,
    domain: 'legal',
    source_kind: 'web',
    authority_tier: 'official',
    status: 'accepted',
    claim_text: 'Example Developer project at 123 Test Street, Mumbai has no open litigation.',
    normalized_claim: { open_cases: 0, registration_status: 'active' },
    source_title: 'Official filing',
    source_url: 'https://maharera.maharashtra.gov.in/project/123',
    source_path: null,
    excerpt: 'Example Developer project at 123 Test Street, Mumbai has no open litigation.',
    observed_at: '2026-05-01T00:00:00.000Z',
    freshness_expires_at: '2027-05-01T00:00:00.000Z',
    confidence: 0.9,
    rejection_reason: null,
    claim_hash: 'hash-1',
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

test('computeDirectMatch recognizes property-specific claims', () => {
  const directMatch = computeDirectMatch(createEvidence({}), property)
  assert.equal(directMatch, true)
})

test('computeDirectMatch rejects unrelated city claims for developer evidence', () => {
  const directMatch = computeDirectMatch(createEvidence({
    domain: 'developer',
    claim_text: 'Another Builder reported a regulatory update in Pune.',
    source_title: 'Other developer filing',
  }), property)
  assert.equal(directMatch, false)
})

test('computeDeterministicSignals finds supporting peers', () => {
  const primary = createEvidence({ id: 'primary' })
  const peer = createEvidence({
    id: 'peer',
    claim_text: 'Official filing states the project has no open litigation.',
    normalized_claim: { open_cases: 0, registration_status: 'active' },
  })

  const signals = computeDeterministicSignals(primary, [peer], property, new Date('2026-05-25T00:00:00.000Z'))
  assert.deepEqual(signals.supporting_evidence_ids, ['peer'])
  assert.equal(signals.contradicting_evidence_ids.length, 0)
  assert.equal(signals.support_score > 0.7, true)
})

test('computeDeterministicSignals finds contradicting peers', () => {
  const primary = createEvidence({ id: 'primary', normalized_claim: { open_cases: 0 } })
  const peer = createEvidence({
    id: 'peer',
    claim_text: 'Court record lists 3 open cases for the project.',
    normalized_claim: { open_cases: 3 },
  })

  const signals = computeDeterministicSignals(primary, [peer], property, new Date('2026-05-25T00:00:00.000Z'))
  assert.deepEqual(signals.contradicting_evidence_ids, ['peer'])
  assert.equal(signals.contradiction_score > 0.2, true)
})
