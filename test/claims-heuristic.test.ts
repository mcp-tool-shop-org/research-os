import { describe, it, expect } from 'vitest';
import { HeuristicClaimExtractor } from '../src/claims/extractors/heuristic.js';
import type { SourceCard } from '../src/sources/schema.js';

const baseCard: SourceCard = {
  source_id: 'src_abcdef012345',
  receipt_id: 'rcpt_abcdef012345_1700000000000',
  section_id: '01-landscape',
  url: 'https://example.com/x',
  final_url: 'https://example.com/x',
  fetched_at: '2026-05-06T22:00:00.000Z',
  publisher: 'Example Pub',
  published_at: null,
  title: 'Example',
  source_type: 'secondary',
  relevance: 'unknown',
  key_points: [
    'First substantive point made by the source.',
    'Second substantive point.',
    'Third one.',
  ],
  limitations: [],
  asserts: 'Source headline assertion',
  scope: null,
  not: null,
  extracted_by: 'heuristic',
  extracted_at: '2026-05-06T22:00:00.000Z',
};

const extractor = new HeuristicClaimExtractor();

describe('HeuristicClaimExtractor', () => {
  it('is always available', async () => {
    expect(await extractor.available()).toBe(true);
  });

  it('emits one draft claim per non-empty key_point with null scope/not', async () => {
    const result = await extractor.extract({ sourceCard: baseCard, sourceHash: null, rawText: null });
    if (!result.ok) throw new Error('should not fail');
    expect(result.claims).toHaveLength(3);
    expect(result.method).toBe('heuristic_key_point');
    for (const c of result.claims) {
      expect(c.scope).toBeNull();
      expect(c.not).toBeNull();
      expect(c.confidence).toBe('low');
      expect(c.evidence_excerpt).toBe(c.asserts);
    }
  });

  it('falls back to source-card asserts when there are no key_points', async () => {
    const result = await extractor.extract({
      sourceCard: { ...baseCard, key_points: [] },
      sourceHash: null,
      rawText: null,
    });
    if (!result.ok) throw new Error('should not fail');
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]?.asserts).toBe(baseCard.asserts);
  });

  it('skips empty/whitespace key_points', async () => {
    const result = await extractor.extract({
      sourceCard: { ...baseCard, key_points: ['real point', '   ', ''] },
      sourceHash: null,
      rawText: null,
    });
    if (!result.ok) throw new Error('should not fail');
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]?.asserts).toBe('real point');
  });
});
