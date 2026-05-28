import assert from 'node:assert/strict';
import test from 'node:test';
import type { ScoringCategory, WeightAdjustment, VerifiedEvidenceItem } from '../../src/modules/crux/shared/types';

const BASE_WEIGHTS: Record<ScoringCategory, number> = {
  location_intelligence: 0.30,
  developer_reliability: 0.20,
  legal_compliance: 0.20,
  market_valuation: 0.15,
  structural_physical: 0.10,
  risk_composite: 0.05,
};

interface LLMAdjustmentResponse {
  adjustments: Array<{
    category: ScoringCategory;
    delta: number;
    reason: string;
    evidence_ids: string[];
  }>;
}

function validateAndClampAdjustments(
  raw: LLMAdjustmentResponse,
  baseWeights: Record<ScoringCategory, number>,
  verifiedEvidence: VerifiedEvidenceItem[],
): {
  adjustments: WeightAdjustment[];
  adjustedWeights: Record<ScoringCategory, number>;
} | null {
  const validEvidenceIds = new Set(
    verifiedEvidence.flatMap((ve) => [
      ve.evidence.id,
      ve.verification.evidence_item_id,
    ]),
  );

  const validCategories = Object.keys(baseWeights);
  const clamped: WeightAdjustment[] = [];

  for (const adj of raw.adjustments ?? []) {
    if (!validCategories.includes(adj.category)) continue;
    if (typeof adj.delta !== 'number' || Number.isNaN(adj.delta)) continue;

    const delta = Math.max(-0.03, Math.min(0.03, adj.delta));

    for (const eid of adj.evidence_ids ?? []) {
      if (!validEvidenceIds.has(eid)) {
        return null;
      }
    }

    clamped.push({
      category: adj.category,
      base_weight: baseWeights[adj.category],
      adjusted_weight: 0,
      delta,
      reason: adj.reason,
      evidence_ids: adj.evidence_ids,
    });
  }

  const totalShift = clamped.reduce((sum, a) => sum + Math.abs(a.delta), 0);
  if (totalShift > 0.05 + 0.001) return null;

  const adjusted = { ...baseWeights };
  for (const adj of clamped) {
    adjusted[adj.category] += adj.delta;
  }

  for (const key of validCategories as ScoringCategory[]) {
    if (adjusted[key] < 0) return null;
  }

  const sum = (Object.values(adjusted) as number[]).reduce((a, b) => a + b, 0);
  for (const key of validCategories as ScoringCategory[]) {
    adjusted[key] /= sum;
  }

  for (const adj of clamped) {
    adj.adjusted_weight = adjusted[adj.category];
  }

  return { adjustments: clamped, adjustedWeights: adjusted };
}

function makeFakeVerifiedEvidence(id: string): VerifiedEvidenceItem {
  return {
    evidence: {
      id,
      run_id: 'run-1',
      property_id: 'prop-1',
      domain: 'environment',
      source_kind: 'web',
      authority_tier: 'official',
      status: 'accepted',
      claim_text: `Test claim ${id}`,
      normalized_claim: {},
      source_title: 'Test Source',
      source_url: null,
      source_path: null,
      excerpt: 'test',
      observed_at: null,
      freshness_expires_at: null,
      confidence: 0.85,
      rejection_reason: null,
      claim_hash: `hash-${id}`,
      created_at: new Date().toISOString(),
    },
    verification: {
      id: `ver-${id}`,
      run_id: 'vr-1',
      property_id: 'prop-1',
      research_run_id: 'run-1',
      evidence_item_id: id,
      verification_status: 'verified',
      verifier_confidence: 0.85,
      direct_match: true,
      freshness_ok: true,
      support_score: 0.8,
      contradiction_score: 0.1,
      supporting_evidence_ids: [],
      contradicting_evidence_ids: [],
      verification_notes: null,
      created_at: new Date().toISOString(),
    },
  };
}

test('validateAndClampAdjustments: accepts valid adjustment within bounds', () => {
  const evidence = [makeFakeVerifiedEvidence('ev-1')];
  const result = validateAndClampAdjustments(
    {
      adjustments: [
        { category: 'location_intelligence', delta: 0.02, reason: 'Good AQI', evidence_ids: ['ev-1'] },
        { category: 'market_valuation', delta: 0.01, reason: 'Strong HPI', evidence_ids: ['ev-1'] },
      ],
    },
    BASE_WEIGHTS,
    evidence,
  );
  assert.ok(result, 'should accept valid adjustments');
  assert.equal(result!.adjustments.length, 2);
  assert.equal(result!.adjustments[0]!.delta, 0.02);
  assert.equal(result!.adjustments[1]!.delta, 0.01);
});

test('validateAndClampAdjustments: clamps delta exceeding ±0.03', () => {
  const evidence = [makeFakeVerifiedEvidence('ev-1')];
  const result = validateAndClampAdjustments(
    {
      adjustments: [
        { category: 'location_intelligence', delta: 0.05, reason: 'Too high', evidence_ids: ['ev-1'] },
      ],
    },
    BASE_WEIGHTS,
    evidence,
  );
  assert.ok(result, 'should clamp rather than reject');
  assert.equal(result!.adjustments[0]!.delta, 0.03, 'delta should be clamped to 0.03');
});

test('validateAndClampAdjustments: clamps negative delta exceeding -0.03', () => {
  const evidence = [makeFakeVerifiedEvidence('ev-1')];
  const result = validateAndClampAdjustments(
    {
      adjustments: [
        { category: 'developer_reliability', delta: -0.05, reason: 'Too low', evidence_ids: ['ev-1'] },
      ],
    },
    BASE_WEIGHTS,
    evidence,
  );
  assert.ok(result);
  assert.equal(result!.adjustments[0]!.delta, -0.03, 'delta should be clamped to -0.03');
});

test('validateAndClampAdjustments: rejects total shift > 0.05', () => {
  const evidence = [makeFakeVerifiedEvidence('ev-1'), makeFakeVerifiedEvidence('ev-2')];
  const result = validateAndClampAdjustments(
    {
      adjustments: [
        { category: 'location_intelligence', delta: 0.02, reason: 'a', evidence_ids: ['ev-1'] },
        { category: 'developer_reliability', delta: 0.02, reason: 'b', evidence_ids: ['ev-1'] },
        { category: 'market_valuation', delta: 0.02, reason: 'c', evidence_ids: ['ev-2'] },
      ],
    },
    BASE_WEIGHTS,
    evidence,
  );
  assert.equal(result, null, 'total shift of 0.06 should be rejected');
});

test('validateAndClampAdjustments: rejects non-existent evidence IDs', () => {
  const evidence = [makeFakeVerifiedEvidence('ev-1')];
  const result = validateAndClampAdjustments(
    {
      adjustments: [
        { category: 'location_intelligence', delta: 0.01, reason: 'a', evidence_ids: ['nonexistent-id'] },
      ],
    },
    BASE_WEIGHTS,
    evidence,
  );
  assert.equal(result, null, 'non-existent evidence ID should cause rejection');
});

test('validateAndClampAdjustments: skips unknown category', () => {
  const evidence = [makeFakeVerifiedEvidence('ev-1')];
  const result = validateAndClampAdjustments(
    {
      adjustments: [
        { category: 'unknown_category' as ScoringCategory, delta: 0.01, reason: 'a', evidence_ids: ['ev-1'] },
        { category: 'location_intelligence', delta: 0.01, reason: 'b', evidence_ids: ['ev-1'] },
      ],
    },
    BASE_WEIGHTS,
    evidence,
  );
  assert.ok(result);
  assert.equal(result!.adjustments.length, 1, 'unknown category should be skipped');
});

test('validateAndClampAdjustments: handles empty adjustments', () => {
  const evidence = [makeFakeVerifiedEvidence('ev-1')];
  const result = validateAndClampAdjustments(
    { adjustments: [] },
    BASE_WEIGHTS,
    evidence,
  );
  assert.ok(result);
  assert.equal(result!.adjustments.length, 0);
});

test('validateAndClampAdjustments: re-normalizes weights to 1.0', () => {
  const evidence = [makeFakeVerifiedEvidence('ev-1')];
  const result = validateAndClampAdjustments(
    {
      adjustments: [
        { category: 'location_intelligence', delta: 0.02, reason: 'a', evidence_ids: ['ev-1'] },
      ],
    },
    BASE_WEIGHTS,
    evidence,
  );
  assert.ok(result);
  const sum = (Object.values(result!.adjustedWeights) as number[]).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1.0) < 0.0001, `weights should sum to 1.0, got ${sum}`);
});

test('validateAndClampAdjustments: rejects NaN delta', () => {
  const evidence = [makeFakeVerifiedEvidence('ev-1')];
  const result = validateAndClampAdjustments(
    {
      adjustments: [
        { category: 'location_intelligence', delta: NaN, reason: 'bad', evidence_ids: ['ev-1'] },
      ],
    },
    BASE_WEIGHTS,
    evidence,
  );
  assert.ok(result, 'NaN should be skipped, adjustments empty');
  assert.equal(result!.adjustments.length, 0);
});

test('validateAndClampAdjustments: rejects weights going negative', () => {
  const evidence = [makeFakeVerifiedEvidence('ev-1')];
  const extremeWeights = { ...BASE_WEIGHTS, risk_composite: 0.005 };
  const result = validateAndClampAdjustments(
    {
      adjustments: [
        { category: 'risk_composite', delta: -0.03, reason: 'a', evidence_ids: ['ev-1'] },
      ],
    },
    extremeWeights,
    evidence,
  );
  assert.equal(result, null, 'weight going negative should be rejected');
});

test('validateAndClampAdjustments: adjusts all 6 categories within 0.05 total', () => {
  const evidence = [makeFakeVerifiedEvidence('ev-1')];
  const result = validateAndClampAdjustments(
    {
      adjustments: [
        { category: 'location_intelligence', delta: 0.008, reason: 'a', evidence_ids: ['ev-1'] },
        { category: 'developer_reliability', delta: 0.008, reason: 'b', evidence_ids: ['ev-1'] },
        { category: 'legal_compliance', delta: 0.008, reason: 'c', evidence_ids: ['ev-1'] },
        { category: 'market_valuation', delta: 0.008, reason: 'd', evidence_ids: ['ev-1'] },
        { category: 'structural_physical', delta: 0.008, reason: 'e', evidence_ids: ['ev-1'] },
        { category: 'risk_composite', delta: 0.008, reason: 'f', evidence_ids: ['ev-1'] },
      ],
    },
    BASE_WEIGHTS,
    evidence,
  );
  assert.ok(result, '6 small adjustments totalling 0.048 should be accepted');
  assert.equal(result!.adjustments.length, 6);
});

test('validateAndClampAdjustments: adjusted_weight is populated in output', () => {
  const evidence = [makeFakeVerifiedEvidence('ev-1')];
  const result = validateAndClampAdjustments(
    {
      adjustments: [
        { category: 'location_intelligence', delta: 0.02, reason: 'a', evidence_ids: ['ev-1'] },
      ],
    },
    BASE_WEIGHTS,
    evidence,
  );
  assert.ok(result);
  assert.ok(result!.adjustments[0]!.adjusted_weight > 0, 'adjusted_weight should be set');
  assert.ok(
    Math.abs(result!.adjustments[0]!.adjusted_weight - result!.adjustments[0]!.base_weight - 0.02) < 0.03,
    'adjusted_weight should approximately equal base + delta',
  );
});
