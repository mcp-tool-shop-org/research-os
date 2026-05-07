import { describe, it, expect } from 'vitest';
import { HeuristicClaimExtractor } from '../src/claims/extractors/heuristic.js';
import type { Excerpt } from '../src/sources/excerpts/schema.js';
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

function ex(idx: number, text: string): Excerpt {
  return {
    excerpt_id: `ex_abcdef012345_${String(idx).padStart(3, '0')}`,
    source_id: 'src_abcdef012345',
    source_hash: null,
    text,
    location_hint: `key_point ${idx}`,
    char_start: 0,
    char_end: text.length,
    origin: 'key_point',
    created_at: '2026-05-06T22:00:00.000Z',
  };
}

const baseExcerpts: Excerpt[] = [
  ex(1, 'First substantive point made by the source.'),
  ex(2, 'Second substantive point.'),
  ex(3, 'Third one.'),
];

const extractor = new HeuristicClaimExtractor();

describe('HeuristicClaimExtractor', () => {
  it('is always available', async () => {
    expect(await extractor.available()).toBe(true);
  });

  it('emits one draft claim per non-empty key_point, each citing one excerpt id', async () => {
    const result = await extractor.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: baseExcerpts,
    });
    if (!result.ok) throw new Error('should not fail');
    expect(result.claims).toHaveLength(3);
    expect(result.method).toBe('heuristic_key_point');
    for (const c of result.claims) {
      expect(c.scope).toBeNull();
      expect(c.not).toBeNull();
      expect(c.confidence).toBe('low');
      expect(c.evidence_excerpt_ids.length).toBeGreaterThanOrEqual(1);
      // The chosen excerpt must come from the supplied ledger.
      for (const id of c.evidence_excerpt_ids) {
        expect(baseExcerpts.map((e) => e.excerpt_id)).toContain(id);
      }
    }
  });

  it('falls back to source-card asserts (paired with the first excerpt) when no key_points', async () => {
    const result = await extractor.extract({
      sourceCard: { ...baseCard, key_points: [] },
      sourceHash: null,
      excerpts: [ex(1, 'A general statement that grounds the asserts text.')],
    });
    if (!result.ok) throw new Error('should not fail');
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]?.asserts).toBe(baseCard.asserts);
    expect(result.claims[0]?.evidence_excerpt_ids).toEqual(['ex_abcdef012345_001']);
  });

  it('skips empty/whitespace key_points', async () => {
    const result = await extractor.extract({
      sourceCard: { ...baseCard, key_points: ['real point', '   ', ''] },
      sourceHash: null,
      excerpts: [ex(1, 'something with real point inside it.')],
    });
    if (!result.ok) throw new Error('should not fail');
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]?.asserts).toBe('real point');
    expect(result.claims[0]?.evidence_excerpt_ids).toEqual(['ex_abcdef012345_001']);
  });

  it('produces no drafts when no excerpts are supplied (span-first invariant)', async () => {
    const result = await extractor.extract({
      sourceCard: baseCard,
      sourceHash: null,
      excerpts: [],
    });
    if (!result.ok) throw new Error('should not fail');
    expect(result.claims).toHaveLength(0);
  });
});
