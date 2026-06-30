// A-REVIEW-003 regression: a non-positive claims-per-window must not hang
// pageClaimsForReview's `i += windowSize` loop, and a negative env
// OLLAMA_INTERN_REVIEW_WINDOW / CLI-supplied 0 must be clamped to the default.
//
// Invariant (both halves):
//   - BAD input (windowSize 0, -5; env -5; config 0): pageClaimsForReview
//     returns in bounded time (single window covering all items) AND the
//     constructed reviewer's effective window is the positive default.
//   - GOOD input (windowSize 30; env "10"): paging chunks as expected and the
//     positive value survives.

import { describe, it, expect, afterEach } from 'vitest';
import {
  pageClaimsForReview,
  OllamaInternReviewer,
} from '../../src/review/reviewers/ollama-intern.js';

const ORIGINAL_ENV = process.env.OLLAMA_INTERN_REVIEW_WINDOW;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.OLLAMA_INTERN_REVIEW_WINDOW;
  else process.env.OLLAMA_INTERN_REVIEW_WINDOW = ORIGINAL_ENV;
});

// Reach the private claimsPerWindow without `any`.
function windowOf(r: OllamaInternReviewer): number {
  return (r as unknown as { claimsPerWindow: number }).claimsPerWindow;
}

describe('A-REVIEW-003 — pageClaimsForReview window-size guard', () => {
  const items = [1, 2, 3, 4, 5];

  it('BAD: windowSize 0 does not hang and returns a single full window', () => {
    // If unguarded, `i += 0` loops forever; a returning call proves the guard.
    const out = pageClaimsForReview(items, 0);
    expect(out).toEqual([[1, 2, 3, 4, 5]]);
  });

  it('BAD: windowSize -5 does not hang and returns a single full window', () => {
    const out = pageClaimsForReview(items, -5);
    expect(out).toEqual([[1, 2, 3, 4, 5]]);
  });

  it('BAD: non-integer windowSize is clamped to a single full window', () => {
    const out = pageClaimsForReview(items, 2.5);
    expect(out).toEqual([[1, 2, 3, 4, 5]]);
  });

  it('GOOD: a positive integer window pages normally', () => {
    expect(pageClaimsForReview(items, 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(pageClaimsForReview([], 2)).toEqual([]);
  });
});

describe('A-REVIEW-003 — reviewer window clamps non-positive config/env to default', () => {
  it('BAD: config.claimsPerWindow = 0 is clamped to the positive default (30)', () => {
    delete process.env.OLLAMA_INTERN_REVIEW_WINDOW;
    const r = new OllamaInternReviewer({ claimsPerWindow: 0 });
    expect(windowOf(r)).toBe(30);
  });

  it('BAD: env OLLAMA_INTERN_REVIEW_WINDOW=-5 is clamped to the positive default (30)', () => {
    process.env.OLLAMA_INTERN_REVIEW_WINDOW = '-5';
    const r = new OllamaInternReviewer();
    expect(windowOf(r)).toBe(30);
  });

  it('GOOD: a positive env window survives', () => {
    process.env.OLLAMA_INTERN_REVIEW_WINDOW = '10';
    const r = new OllamaInternReviewer();
    expect(windowOf(r)).toBe(10);
  });

  it('GOOD: a positive config window survives', () => {
    delete process.env.OLLAMA_INTERN_REVIEW_WINDOW;
    const r = new OllamaInternReviewer({ claimsPerWindow: 15 });
    expect(windowOf(r)).toBe(15);
  });
});
