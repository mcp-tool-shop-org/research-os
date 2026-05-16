import { describe, it, expect } from 'vitest';

import {
  tokenizeForRelevance,
  computeKeywordOverlap,
  assessRelevance,
  fetchUrlTitle,
  DEFAULT_RELEVANCE_THRESHOLD,
} from '../src/discover/relevance.js';

describe('tokenizeForRelevance', () => {
  it('lowercases, strips punctuation, removes stopwords', () => {
    expect(tokenizeForRelevance('The Quick Brown Fox!')).toEqual(['quick', 'brown', 'fox']);
  });

  it('handles the v0.2 originating-bug query verbatim', () => {
    const tokens = tokenizeForRelevance(
      'daylight savings time workplace productivity cognitive performance',
    );
    expect(tokens).toContain('daylight');
    expect(tokens).toContain('savings');
    expect(tokens).toContain('workplace');
    expect(tokens).toContain('productivity');
    expect(tokens).toContain('cognitive');
    expect(tokens).toContain('performance');
  });

  it('returns empty array on empty / whitespace input', () => {
    expect(tokenizeForRelevance('')).toEqual([]);
    expect(tokenizeForRelevance('   \n  ')).toEqual([]);
  });

  it('handles hyphens and slashes as word boundaries', () => {
    expect(tokenizeForRelevance('multi-modal cross/section')).toEqual([
      'multi',
      'modal',
      'cross',
      'section',
    ]);
  });

  it('drops short tokens (length < 3) so single letters do not inflate overlap', () => {
    expect(tokenizeForRelevance('a b c daylight')).toEqual(['daylight']);
  });

  it('deduplicates repeated tokens within a single text', () => {
    const tokens = tokenizeForRelevance('daylight daylight workplace workplace');
    expect(tokens).toEqual(['daylight', 'workplace']);
  });
});

describe('computeKeywordOverlap', () => {
  it('zero overlap on the v0.2 cancer-paper title vs DST query', () => {
    const result = computeKeywordOverlap(
      'Trends in cancer mortality in Andalusia, Spain',
      'daylight savings time workplace productivity cognitive performance',
    );
    expect(result.matchedKeywords).toEqual([]);
    expect(result.overlapScore).toBe(0);
  });

  it('high overlap on a real DST workplace title', () => {
    const result = computeKeywordOverlap(
      'Daylight Saving Time and Workplace Productivity Effects',
      'daylight savings time workplace productivity cognitive performance',
    );
    // saving != savings (strict match), but daylight + time + workplace + productivity match
    expect(result.matchedKeywords).toEqual(
      expect.arrayContaining(['daylight', 'time', 'workplace', 'productivity']),
    );
    expect(result.overlapScore).toBeGreaterThan(DEFAULT_RELEVANCE_THRESHOLD);
  });

  it('zero on the carboxylesterase biochem title from v0.2', () => {
    const result = computeKeywordOverlap(
      'Carboxylesterase enzyme structure and substrate selectivity',
      'daylight savings time workplace productivity cognitive performance',
    );
    expect(result.overlapScore).toBe(0);
  });

  it('zero on the HIV-lymphoma title from v0.2', () => {
    const result = computeKeywordOverlap(
      'HIV-associated diffuse large B-cell lymphoma in resource-limited settings',
      'daylight savings time workplace productivity cognitive performance',
    );
    expect(result.overlapScore).toBe(0);
  });

  it('returns overlapScore = matched / queryKeywords.length', () => {
    // 7 query tokens; title has 1 matching token → 1/7 ≈ 0.14
    const result = computeKeywordOverlap(
      'workplace conditions in factories',
      'daylight savings time workplace productivity cognitive performance',
    );
    expect(result.matchedKeywords).toEqual(['workplace']);
    expect(result.overlapScore).toBeCloseTo(1 / 7, 5);
  });

  it('returns 0 with empty title or empty query (no false positives on missing data)', () => {
    expect(computeKeywordOverlap('', 'daylight savings time').overlapScore).toBe(0);
    expect(computeKeywordOverlap('daylight time', '').overlapScore).toBe(0);
  });
});

describe('assessRelevance', () => {
  it('verified when title fetched and overlap above threshold', () => {
    const r = assessRelevance({
      fetchedTitle: 'Daylight Saving Time and Workplace Productivity',
      query: 'daylight savings time workplace productivity cognitive performance',
      threshold: DEFAULT_RELEVANCE_THRESHOLD,
      fetchError: null,
    });
    expect(r.status).toBe('verified');
    expect(r.fetched_title).toBe('Daylight Saving Time and Workplace Productivity');
    expect(r.overlap_score).toBeGreaterThan(DEFAULT_RELEVANCE_THRESHOLD);
  });

  it('topic_mismatch when title fetched and overlap below threshold (v0.2 case)', () => {
    const r = assessRelevance({
      fetchedTitle: 'Trends in cancer mortality in Andalusia, Spain',
      query: 'daylight savings time workplace productivity cognitive performance',
      threshold: DEFAULT_RELEVANCE_THRESHOLD,
      fetchError: null,
    });
    expect(r.status).toBe('topic_mismatch');
    expect(r.matched_keywords).toEqual([]);
    expect(r.overlap_score).toBe(0);
  });

  it('unverified when fetch errored (no signal either way — graceful degradation)', () => {
    const r = assessRelevance({
      fetchedTitle: null,
      query: 'daylight savings time workplace productivity',
      threshold: DEFAULT_RELEVANCE_THRESHOLD,
      fetchError: 'network timeout',
    });
    expect(r.status).toBe('unverified');
    expect(r.fetched_title).toBeNull();
    expect(r.error).toBe('network timeout');
  });

  it('unverified when fetch returned no <title> tag', () => {
    const r = assessRelevance({
      fetchedTitle: null,
      query: 'daylight savings time',
      threshold: DEFAULT_RELEVANCE_THRESHOLD,
      fetchError: null,
    });
    expect(r.status).toBe('unverified');
  });
});

describe('fetchUrlTitle', () => {
  it('parses a <title> tag from a normal HTML response', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        '<!DOCTYPE html><html><head><title>Daylight Saving Time and Productivity</title></head><body>...</body></html>',
        { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
      );
    const r = await fetchUrlTitle('https://example.com/paper', fakeFetch, 5000);
    expect(r.title).toBe('Daylight Saving Time and Productivity');
    expect(r.error).toBeNull();
  });

  it('handles the v0.2 PMC7244163 case — fetched title reveals real cancer paper', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        '<html><head><title>Trends in cancer mortality in Andalusia, Spain - PMC</title></head><body>abstract...</body></html>',
        { status: 200, headers: { 'content-type': 'text/html' } },
      );
    const r = await fetchUrlTitle(
      'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7244163/',
      fakeFetch,
      5000,
    );
    expect(r.title).toBe('Trends in cancer mortality in Andalusia, Spain - PMC');
    expect(r.error).toBeNull();
  });

  it('returns title=null when no <title> tag is present', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response('<html><body>no title here</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    const r = await fetchUrlTitle('https://example.com/x', fakeFetch, 5000);
    expect(r.title).toBeNull();
    expect(r.error).toBeNull();
  });

  it('returns error string on HTTP non-2xx response', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response('Not Found', { status: 404 });
    const r = await fetchUrlTitle('https://example.com/missing', fakeFetch, 5000);
    expect(r.title).toBeNull();
    expect(r.error).toMatch(/404|HTTP/i);
  });

  it('returns error string on network failure', async () => {
    const fakeFetch: typeof fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    const r = await fetchUrlTitle('https://example.com/x', fakeFetch, 5000);
    expect(r.title).toBeNull();
    expect(r.error).toMatch(/ECONNREFUSED|fetch failed|network/i);
  });

  it('decodes basic HTML entities in the title', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        '<html><head><title>Smith &amp; Jones &mdash; Productivity Effects</title></head></html>',
        { status: 200, headers: { 'content-type': 'text/html' } },
      );
    const r = await fetchUrlTitle('https://example.com/x', fakeFetch, 5000);
    expect(r.title).toBe('Smith & Jones — Productivity Effects');
  });

  it('handles multi-line <title> tags by collapsing whitespace', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        '<html><head><title>\n  Daylight Saving\n  Time Effects\n</title></head></html>',
        { status: 200, headers: { 'content-type': 'text/html' } },
      );
    const r = await fetchUrlTitle('https://example.com/x', fakeFetch, 5000);
    expect(r.title).toBe('Daylight Saving Time Effects');
  });
});
