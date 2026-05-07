import { describe, it, expect } from 'vitest';
import {
  ReviewFindingSchema,
  ClaimReviewSchema,
  ReviewSnapshotSchema,
} from '../src/review/schema.js';

const baseFinding = {
  finding_id: 'fnd_abcdef012345',
  section_id: '01-landscape',
  claim_ids: ['clm_aaaaaaaaaaaa_heuristic_1'],
  source_ids: ['src_aaaaaaaaaaaa'],
  category: 'overgeneralized_claim',
  severity: 'warn',
  summary: 'Claim widens beyond source.',
  evidence: 'Asserts: ...',
  required_action: 'Add scope tag.',
  reviewer: 'heuristic',
  review_method: 'heuristic_field_and_grounding_checks',
  confidence: 'medium',
  created_at: '2026-05-06T22:00:00.000Z',
};

const baseReview = {
  claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
  decision: 'needs_scope_repair',
  reason: 'Findings: overgeneralized_claim (warn).',
  finding_ids: ['fnd_abcdef012345'],
  reviewer: 'heuristic',
  review_method: 'heuristic_field_and_grounding_checks',
  created_at: '2026-05-06T22:00:00.000Z',
};

describe('ReviewFindingSchema', () => {
  it('parses every category', () => {
    for (const cat of [
      'unsupported_claim',
      'ungrounded_excerpt',
      'stale_claim',
      'overgeneralized_claim',
      'scope_widening',
      'missing_not_constraint',
      'source_quality_problem',
      'source_cluster_monopoly',
      'unmapped_contradiction',
      'recommendation_exceeds_evidence',
      'hidden_synthesis',
      'definition_drift',
      'temporal_mismatch',
    ]) {
      expect(() => ReviewFindingSchema.parse({ ...baseFinding, category: cat })).not.toThrow();
    }
  });

  it('rejects unknown category', () => {
    expect(() => ReviewFindingSchema.parse({ ...baseFinding, category: 'gibberish' })).toThrow();
  });

  it('rejects malformed finding_id', () => {
    expect(() => ReviewFindingSchema.parse({ ...baseFinding, finding_id: 'bad' })).toThrow();
  });

  it('rejects empty summary', () => {
    expect(() => ReviewFindingSchema.parse({ ...baseFinding, summary: '' })).toThrow();
  });
});

describe('ClaimReviewSchema', () => {
  it('parses every decision', () => {
    for (const d of [
      'accepted_for_synthesis',
      'rejected',
      'needs_scope_repair',
      'needs_source_repair',
      'needs_contradiction_mapping',
      'needs_human_review',
    ]) {
      expect(() => ClaimReviewSchema.parse({ ...baseReview, decision: d })).not.toThrow();
    }
  });

  it('rejects unknown decision', () => {
    expect(() => ClaimReviewSchema.parse({ ...baseReview, decision: 'maybe' })).toThrow();
  });

  it('rejects empty reason', () => {
    expect(() => ClaimReviewSchema.parse({ ...baseReview, reason: '' })).toThrow();
  });
});

describe('ReviewSnapshotSchema', () => {
  it('parses an empty snapshot', () => {
    expect(() =>
      ReviewSnapshotSchema.parse({
        section_id: '01-landscape',
        reviewer: 'heuristic',
        review_method: 'heuristic_field_and_grounding_checks',
        reviewed_at: '2026-05-06T22:00:00.000Z',
        candidate_claims: 0,
        findings: [],
        claim_reviews: [],
        decision_counts: {},
        severity_counts: {},
        llm_findings_rejected_ungrounded: 0,
        promoted_to_reviewed: false,
      }),
    ).not.toThrow();
  });
});
