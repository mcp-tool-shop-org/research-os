import { describe, it, expect } from 'vitest';
import { candidateContradictionPairs } from '../src/contradictions/detectors/ollama-intern.js';
import type { Claim } from '../src/claims/schema.js';

function claim(idx: number, asserts: string, scope: string | null = null): Claim {
  return {
    claim_id: `clm_abcdef012345_ollama_intern_${idx}`,
    section_id: '01-test',
    source_ids: ['src_abcdef012345'],
    source_hashes: ['a'.repeat(64)],
    asserts,
    scope,
    not: null,
    evidence_excerpt_ids: ['ex_abcdef012345_001'],
    evidence_excerpt: 'literal',
    evidence_location: null,
    confidence: 'low',
    extractor: 'ollama-intern',
    extraction_method: 'ollama_intern_propositional',
    created_at: '2026-05-06T22:00:00.000Z',
    review_state: 'candidate',
  };
}

describe('candidateContradictionPairs', () => {
  it('emits no pairs when claims share no tokens and no scopes', () => {
    const claims = [
      claim(1, 'foxes hunt rabbits sometimes'),
      claim(2, 'compilers parse syntax trees'),
    ];
    expect(candidateContradictionPairs(claims)).toEqual([]);
  });

  it('emits a pair when token Jaccard meets the similarity threshold', () => {
    const claims = [
      claim(1, 'knowledge graphs represent entities and relationships'),
      claim(2, 'knowledge graphs represent entities and attributes'),
    ];
    const pairs = candidateContradictionPairs(claims);
    expect(pairs).toEqual([[0, 1]]);
  });

  it('emits a pair via scope overlap even when asserts share no tokens', () => {
    const claims = [
      claim(1, 'completely different sentence about apples', 'machine learning training pipeline'),
      claim(2, 'wholly orthogonal sentence regarding bananas', 'machine learning training pipeline'),
    ];
    const pairs = candidateContradictionPairs(claims);
    expect(pairs).toEqual([[0, 1]]);
  });

  it('drops empty-asserts claims', () => {
    const claims = [claim(1, ''), claim(2, 'a sentence about something')];
    expect(candidateContradictionPairs(claims)).toEqual([]);
  });

  it('reduces N² aggressively when most claims are unrelated', () => {
    // 20 claims with disjoint token sets — pairwise = 190; prefilter should
    // keep 0 because no Jaccard >= 0.25 and no scopes set.
    const buckets = [
      'apples bananas cherries dates',
      'elephants flamingos giraffes hyenas',
      'kettles lanterns mittens napkins',
      'oranges pineapples quinces raspberries',
      'salamanders tortoises urchins voles',
      'whales xerox yetis zucchini',
      'planets quasars rockets satellites',
      'aurora boreal cumulus drizzle',
      'icebergs jacuzzis kilometers latitudes',
      'meadows nurseries orchards prairies',
    ];
    const claims = Array.from({ length: 20 }, (_, i) =>
      claim(i + 1, `${buckets[i % buckets.length]} extra-token-${i}`),
    );
    expect(candidateContradictionPairs(claims).length).toBeLessThan(190);
  });
});
