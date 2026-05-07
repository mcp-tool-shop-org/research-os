import { describe, it, expect } from 'vitest';
import { HeuristicContradictionDetector } from '../src/contradictions/detectors/heuristic.js';
import type { Claim } from '../src/claims/schema.js';

const detector = new HeuristicContradictionDetector();

function makeClaim(overrides: Partial<Claim>): Claim {
  return {
    claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
    section_id: '01-landscape',
    source_ids: ['src_aaaaaaaaaaaa'],
    source_hashes: ['a'.repeat(64)],
    asserts: 'placeholder',
    scope: null,
    not: null,
    evidence_excerpt: 'placeholder',
    evidence_location: null,
    confidence: 'low',
    extractor: 'heuristic',
    extraction_method: 'heuristic_key_point',
    created_at: '2026-05-06T22:00:00.000Z',
    review_state: 'candidate',
    ...overrides,
  };
}

describe('HeuristicContradictionDetector', () => {
  it('is always available', async () => {
    expect(await detector.available()).toBe(true);
  });

  it('detects a direct_conflict on shared subject + negation mismatch', async () => {
    const a = makeClaim({
      claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
      asserts: 'WAL provides high concurrency for SQLite readers and writers',
      scope: 'SQLite WAL mode',
    });
    const b = makeClaim({
      claim_id: 'clm_bbbbbbbbbbbb_heuristic_1',
      asserts: 'WAL does not provide high concurrency for SQLite readers and writers',
      scope: 'SQLite WAL mode',
    });
    const result = await detector.detect([a, b]);
    if (!result.ok) throw new Error('detection failed');
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]?.draft.type).toBe('direct_conflict');
  });

  it('detects overgeneralization_risk when one claim is universal and the other is scoped', async () => {
    const universal = makeClaim({
      claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
      asserts: 'patch publish before next repo for any code change',
      scope: null,
    });
    const scoped = makeClaim({
      claim_id: 'clm_bbbbbbbbbbbb_heuristic_1',
      asserts: 'patch publish before next repo during role-os rollout lockdown',
      scope: 'role-os rollout lockdown',
    });
    const result = await detector.detect([universal, scoped]);
    if (!result.ok) throw new Error('detection failed');
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]?.draft.type).toBe('overgeneralization_risk');
  });

  it('does not surface direct_conflict when scopes do not overlap', async () => {
    const a = makeClaim({
      claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
      asserts: 'tests must ship with code changes',
      scope: 'star-freight production code',
    });
    const b = makeClaim({
      claim_id: 'clm_bbbbbbbbbbbb_heuristic_1',
      asserts: 'tests do not ship with code changes',
      scope: 'archived motif spike branches',
    });
    const result = await detector.detect([a, b]);
    if (!result.ok) throw new Error('detection failed');
    const directConflicts = result.drafts.filter((d) => d.draft.type === 'direct_conflict');
    expect(directConflicts).toHaveLength(0);
  });

  it('returns no contradiction for two unrelated claims', async () => {
    const a = makeClaim({
      claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
      asserts: 'FTS5 supports prefix queries',
      scope: 'SQLite FTS5',
    });
    const b = makeClaim({
      claim_id: 'clm_bbbbbbbbbbbb_heuristic_1',
      asserts: 'WAL improves concurrency',
      scope: 'SQLite WAL mode',
    });
    const result = await detector.detect([a, b]);
    if (!result.ok) throw new Error('detection failed');
    expect(result.drafts).toHaveLength(0);
  });

  it('returns method=heuristic_similarity_negation', async () => {
    const result = await detector.detect([]);
    if (!result.ok) throw new Error('detection failed');
    expect(result.method).toBe('heuristic_similarity_negation');
  });

  it('handles fewer than 2 claims gracefully', async () => {
    const a = makeClaim({});
    const r0 = await detector.detect([]);
    const r1 = await detector.detect([a]);
    if (!r0.ok || !r1.ok) throw new Error('detection failed');
    expect(r0.drafts).toEqual([]);
    expect(r1.drafts).toEqual([]);
  });
});
