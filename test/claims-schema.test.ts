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

  it('parses a legacy claim WITHOUT frame_excluded and defaults to false (v0.8.0 back-compat)', () => {
    // Legacy claims.jsonl rows written pre-v0.8.0 do not carry the
    // frame_excluded field. The schema must round-trip them with the field
    // filled in as false so reviewer/gate consumers can read every row.
    const parsed = ClaimSchema.parse(baseClaim);
    expect(parsed.frame_excluded).toBe(false);
  });

  it('parses a fresh claim WITH frame_excluded:true (v0.8.0 forward path)', () => {
    const parsed = ClaimSchema.parse({ ...baseClaim, frame_excluded: true });
    expect(parsed.frame_excluded).toBe(true);
  });

  it('round-trips frame_excluded through serialize → parse', () => {
    const parsed1 = ClaimSchema.parse({ ...baseClaim, frame_excluded: true });
    const serialized = JSON.stringify(parsed1);
    const parsed2 = ClaimSchema.parse(JSON.parse(serialized));
    expect(parsed2.frame_excluded).toBe(true);
  });

  it('parses frame_exclusion_reason="critic_unavailable" (v0.8.0 phase 1b-b correctness fix)', () => {
    // System-state value stamped by the extractor on critic-call failure.
    // Must round-trip through the schema cleanly so the review pipeline can
    // route the claim to decision=frame_excluded with the system-state
    // reason preserved.
    const parsed = ClaimSchema.parse({
      ...baseClaim,
      frame_excluded: true,
      frame_exclusion_reason: 'critic_unavailable',
      frame_exclusion_rationale: 'Critic call failed; conservatively excluded from synthesis evidence.',
    });
    expect(parsed.frame_excluded).toBe(true);
    expect(parsed.frame_exclusion_reason).toBe('critic_unavailable');
  });

  it('still rejects an unknown frame_exclusion_reason value', () => {
    expect(() =>
      ClaimSchema.parse({
        ...baseClaim,
        frame_excluded: true,
        frame_exclusion_reason: 'made_up_reason',
        frame_exclusion_rationale: 'r',
      }),
    ).toThrow();
  });
});
