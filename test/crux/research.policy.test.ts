import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyAuthorityTier,
  computeClaimHash,
  computeEvidenceStatus,
  computeFreshnessExpiry,
  isAllowedDomain,
  isExpired,
} from '../../src/modules/crux/research/research.policy'

test('classifyAuthorityTier marks government domains as official', () => {
  const tier = classifyAuthorityTier('https://maharera.maharashtra.gov.in/project/123', null, [])
  assert.equal(tier, 'official')
})

test('classifyAuthorityTier marks allowlisted domains as primary', () => {
  const tier = classifyAuthorityTier('https://developer.example.com/project', null, ['developer.example.com'])
  assert.equal(tier, 'primary')
})

test('isAllowedDomain respects host and subdomain matches', () => {
  assert.equal(isAllowedDomain('https://sub.example.com/path', ['example.com']), true)
  assert.equal(isAllowedDomain('https://other.com/path', ['example.com']), false)
})

test('computeEvidenceStatus downgrades non-authoritative sources to weak', () => {
  const result = computeEvidenceStatus(
    'The locality added a new metro stop within 1 km of the property.',
    'The locality added a new metro stop within 1 km of the property according to the source excerpt.',
    'secondary',
    'https://news.example.com/story',
    null,
    0.40,
  )

  assert.equal(result.status, 'weak')
  assert.equal(result.rejection_reason, null)
})

test('computeClaimHash is stable for the same claim and source identity', () => {
  const first = computeClaimHash({
    domain: 'legal',
    claim_text: 'No active litigation was listed for the project.',
    normalized_claim: { litigation_open_cases: 0 },
    confidence: 0.7,
  }, 'https://maharera.maharashtra.gov.in/project/123')

  const second = computeClaimHash({
    domain: 'legal',
    claim_text: 'No active litigation was listed for the project.',
    normalized_claim: { litigation_open_cases: 0 },
    confidence: 0.4,
  }, 'https://maharera.maharashtra.gov.in/project/123')

  assert.equal(first, second)
})

test('stale evidence is detected from freshness expiry', () => {
  const freshness = computeFreshnessExpiry('environment', '2024-01-01T00:00:00.000Z')
  assert.ok(freshness)
  assert.equal(isExpired(freshness, new Date('2026-01-01T00:00:00.000Z')), true)
})
