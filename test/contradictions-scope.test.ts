import { describe, it, expect } from 'vitest';
import {
  assessScopeOverlap,
  hasNegation,
  jaccardSimilarity,
  tokenize,
} from '../src/contradictions/scope.js';

describe('tokenize', () => {
  it('lowercases, strips stopwords, drops short tokens', () => {
    expect(tokenize('The quick brown fox jumps over the lazy dog.')).toEqual([
      'quick',
      'brown',
      'fox',
      'jumps',
      'over',
      'lazy',
      'dog',
    ]);
  });

  it('returns empty for non-alphanumeric input', () => {
    expect(tokenize('--- !!! ---')).toEqual([]);
  });
});

describe('jaccardSimilarity', () => {
  it('returns 1.0 for identical token sets', () => {
    expect(jaccardSimilarity('alpha beta gamma', 'alpha beta gamma')).toBe(1);
  });

  it('returns 0 for fully disjoint', () => {
    expect(jaccardSimilarity('alpha beta', 'gamma delta')).toBe(0);
  });

  it('produces a fractional score for partial overlap', () => {
    const v = jaccardSimilarity('alpha beta gamma', 'beta gamma delta');
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
  });
});

describe('hasNegation', () => {
  it('detects common negation markers', () => {
    expect(hasNegation('FTS5 is not a search index')).toBe(true);
    expect(hasNegation('cannot be used here')).toBe(true);
    expect(hasNegation("doesn't work that way")).toBe(true);
  });

  it('does not flag bare statements without negation', () => {
    expect(hasNegation('FTS5 is a search index')).toBe(false);
  });
});

describe('assessScopeOverlap', () => {
  it('returns unknown when both scopes are null', () => {
    expect(assessScopeOverlap(null, null)).toBe('unknown');
  });

  it('returns non_overlapping when one scope is null and the other is set', () => {
    expect(assessScopeOverlap(null, 'role-os rollout')).toBe('non_overlapping');
    expect(assessScopeOverlap('role-os rollout', null)).toBe('non_overlapping');
  });

  it('returns fully_overlapping for identical scopes', () => {
    expect(assessScopeOverlap('role-os rollout fixes', 'role-os rollout fixes')).toBe(
      'fully_overlapping',
    );
  });

  it('returns non_overlapping for disjoint scopes', () => {
    expect(assessScopeOverlap('role-os rollout fixes', 'star-freight visual canon')).toBe(
      'non_overlapping',
    );
  });

  it('returns partially_overlapping for shared but distinct scopes', () => {
    expect(
      assessScopeOverlap('SQLite versions 3.7.0 and later', 'SQLite legacy versions 3.6.x'),
    ).toBe('partially_overlapping');
  });
});
