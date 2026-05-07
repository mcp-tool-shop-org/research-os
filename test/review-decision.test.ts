import { describe, it, expect } from 'vitest';
import { deriveClaimReviews } from '../src/review/decision.js';
import type { Claim } from '../src/claims/schema.js';
import { ReviewFindingSchema, type ReviewFinding } from '../src/review/schema.js';

function makeClaim(id: string): Claim {
  return {
    claim_id: id,
    section_id: '01-test',
    source_ids: ['src_aaaaaaaaaaaa'],
    source_hashes: ['a'.repeat(64)],
    asserts: 'X',
    scope: 'narrow',
    not: 'broad',
    evidence_excerpt: 'literal',
    evidence_location: null,
    confidence: 'low',
    extractor: 'heuristic',
    extraction_method: 'heuristic_key_point',
    created_at: '2026-05-06T22:00:00.000Z',
    review_state: 'candidate',
  };
}

function makeFinding(overrides: Partial<ReviewFinding>): ReviewFinding {
  return ReviewFindingSchema.parse({
    finding_id: 'fnd_aaaaaaaaaaaa',
    section_id: '01-test',
    claim_ids: ['clm_aaaaaaaaaaaa_heuristic_1'],
    source_ids: ['src_aaaaaaaaaaaa'],
    category: 'overgeneralized_claim',
    severity: 'warn',
    summary: 'x',
    evidence: '',
    required_action: 'fix',
    reviewer: 'heuristic',
    review_method: 'm',
    confidence: 'medium',
    created_at: '2026-05-06T22:00:00.000Z',
    ...overrides,
  });
}

describe('deriveClaimReviews', () => {
  it('accepts claims with no findings', () => {
    const reviews = deriveClaimReviews({
      claims: [makeClaim('clm_aaaaaaaaaaaa_heuristic_1')],
      findings: [],
      reviewer: 'heuristic',
      reviewMethod: 'm',
    });
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.decision).toBe('accepted_for_synthesis');
    expect(reviews[0]?.finding_ids).toEqual([]);
  });

  it('rejects claim with block-severity ungrounded_excerpt', () => {
    const reviews = deriveClaimReviews({
      claims: [makeClaim('clm_aaaaaaaaaaaa_heuristic_1')],
      findings: [makeFinding({ category: 'ungrounded_excerpt', severity: 'block' })],
      reviewer: 'heuristic',
      reviewMethod: 'm',
    });
    expect(reviews[0]?.decision).toBe('rejected');
  });

  it('routes block-severity unmapped_contradiction to needs_contradiction_mapping', () => {
    const reviews = deriveClaimReviews({
      claims: [makeClaim('clm_aaaaaaaaaaaa_heuristic_1')],
      findings: [makeFinding({ category: 'unmapped_contradiction', severity: 'block' })],
      reviewer: 'heuristic',
      reviewMethod: 'm',
    });
    expect(reviews[0]?.decision).toBe('needs_contradiction_mapping');
  });

  it('routes warn overgeneralized_claim to needs_scope_repair', () => {
    const reviews = deriveClaimReviews({
      claims: [makeClaim('clm_aaaaaaaaaaaa_heuristic_1')],
      findings: [makeFinding({ category: 'overgeneralized_claim', severity: 'warn' })],
      reviewer: 'heuristic',
      reviewMethod: 'm',
    });
    expect(reviews[0]?.decision).toBe('needs_scope_repair');
  });

  it('picks highest-priority decision when multiple findings cite the same claim', () => {
    const reviews = deriveClaimReviews({
      claims: [makeClaim('clm_aaaaaaaaaaaa_heuristic_1')],
      findings: [
        makeFinding({ finding_id: 'fnd_111111111111', category: 'overgeneralized_claim', severity: 'warn' }),
        makeFinding({ finding_id: 'fnd_222222222222', category: 'unsupported_claim', severity: 'block' }),
      ],
      reviewer: 'heuristic',
      reviewMethod: 'm',
    });
    expect(reviews[0]?.decision).toBe('rejected');
    expect(reviews[0]?.finding_ids).toHaveLength(2);
  });

  it('treats info-only findings as accepted', () => {
    const reviews = deriveClaimReviews({
      claims: [makeClaim('clm_aaaaaaaaaaaa_heuristic_1')],
      findings: [makeFinding({ category: 'missing_not_constraint', severity: 'info' })],
      reviewer: 'heuristic',
      reviewMethod: 'm',
    });
    expect(reviews[0]?.decision).toBe('accepted_for_synthesis');
  });
});
