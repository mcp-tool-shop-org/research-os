import { describe, it, expect } from 'vitest';
import { ClaimSchema } from '../src/claims/schema.js';

const baseClaim = {
  claim_id: 'clm_abcdef012345_heuristic_1',
  section_id: '01-landscape',
  source_ids: ['src_abcdef012345'],
  source_hashes: ['a'.repeat(64)],
  asserts: 'Some atomic proposition.',
  scope: null,
  not: null,
  evidence_excerpt: 'literal text from source',
  evidence_location: null,
  confidence: 'low',
  extractor: 'heuristic',
  extraction_method: 'heuristic_key_point',
  created_at: '2026-05-06T22:00:00.000Z',
  review_state: 'candidate',
};

describe('ClaimSchema', () => {
  it('parses a heuristic claim shape', () => {
    expect(() => ClaimSchema.parse(baseClaim)).not.toThrow();
  });

  it('parses an ollama-intern claim with scope/not populated', () => {
    expect(() =>
      ClaimSchema.parse({
        ...baseClaim,
        claim_id: 'clm_abcdef012345_ollama_intern_1',
        extractor: 'ollama-intern',
        extraction_method: 'ollama_intern_propositional',
        scope: 'role-os rollout lockdown fixes',
        not: 'universal publish policy',
        confidence: 'medium',
      }),
    ).not.toThrow();
  });

  it('rejects a claim with no source_ids', () => {
    expect(() => ClaimSchema.parse({ ...baseClaim, source_ids: [] })).toThrow();
  });

  it('rejects malformed claim_id', () => {
    expect(() =>
      ClaimSchema.parse({ ...baseClaim, claim_id: 'bad-id' }),
    ).toThrow();
  });

  it('rejects malformed source_id', () => {
    expect(() =>
      ClaimSchema.parse({ ...baseClaim, source_ids: ['not-a-source-id'] }),
    ).toThrow();
  });

  it('rejects an empty asserts string', () => {
    expect(() => ClaimSchema.parse({ ...baseClaim, asserts: '' })).toThrow();
  });

  it('rejects an empty evidence_excerpt', () => {
    expect(() =>
      ClaimSchema.parse({ ...baseClaim, evidence_excerpt: '' }),
    ).toThrow();
  });

  it('rejects unknown review_state', () => {
    expect(() =>
      ClaimSchema.parse({ ...baseClaim, review_state: 'maybe' }),
    ).toThrow();
  });

  it('accepts every defined review_state for read-back', () => {
    for (const s of ['candidate', 'gated', 'reviewed', 'rejected', 'accepted']) {
      expect(() => ClaimSchema.parse({ ...baseClaim, review_state: s })).not.toThrow();
    }
  });

  it('rejects unknown confidence value', () => {
    expect(() =>
      ClaimSchema.parse({ ...baseClaim, confidence: 'maximum' }),
    ).toThrow();
  });
});
