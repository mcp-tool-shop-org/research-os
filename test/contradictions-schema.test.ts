import { describe, it, expect } from 'vitest';
import { ContradictionSchema } from '../src/contradictions/schema.js';

const base = {
  contradiction_id: 'cnt_abcdef012345_heuristic',
  section_id: '01-landscape',
  claim_ids: [
    'clm_aaaaaaaaaaaa_heuristic_1',
    'clm_bbbbbbbbbbbb_heuristic_1',
  ],
  source_ids: ['src_aaaaaaaaaaaa', 'src_bbbbbbbbbbbb'],
  type: 'direct_conflict',
  summary: 'Claims disagree.',
  scope_analysis: 'Scopes overlap.',
  overlap_assessment: 'fully_overlapping',
  severity: 'medium',
  confidence: 'low',
  detector: 'heuristic',
  detection_method: 'heuristic_similarity_negation',
  evidence: 'Token similarity + negation mismatch.',
  status: 'unresolved',
  created_at: '2026-05-06T22:00:00.000Z',
};

describe('ContradictionSchema', () => {
  it('parses a valid heuristic contradiction', () => {
    expect(() => ContradictionSchema.parse(base)).not.toThrow();
  });

  it('parses every tension type', () => {
    for (const t of [
      'direct_conflict',
      'scope_conflict',
      'temporal_conflict',
      'definition_conflict',
      'evidence_conflict',
      'overgeneralization_risk',
    ]) {
      expect(() => ContradictionSchema.parse({ ...base, type: t })).not.toThrow();
    }
  });

  it('rejects an unknown type', () => {
    expect(() => ContradictionSchema.parse({ ...base, type: 'gibberish' })).toThrow();
  });

  it('requires exactly two claim_ids', () => {
    expect(() => ContradictionSchema.parse({ ...base, claim_ids: [base.claim_ids[0]] })).toThrow();
    expect(() =>
      ContradictionSchema.parse({
        ...base,
        claim_ids: [...base.claim_ids, 'clm_cccccccccccc_heuristic_1'],
      }),
    ).toThrow();
  });

  it('rejects malformed contradiction_id', () => {
    expect(() => ContradictionSchema.parse({ ...base, contradiction_id: 'bad-id' })).toThrow();
  });

  it('rejects malformed claim_id inside claim_ids', () => {
    expect(() =>
      ContradictionSchema.parse({ ...base, claim_ids: ['not-a-claim', base.claim_ids[1]] }),
    ).toThrow();
  });

  it('accepts every defined status for read-back', () => {
    for (const s of ['unresolved', 'reconciled', 'preserved_deliberately', 'rejected']) {
      expect(() => ContradictionSchema.parse({ ...base, status: s })).not.toThrow();
    }
  });

  it('rejects unknown severity', () => {
    expect(() => ContradictionSchema.parse({ ...base, severity: 'epic' })).toThrow();
  });
});
