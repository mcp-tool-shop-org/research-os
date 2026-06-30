// Stage A regression — A-CLI-001 (bounded positive-int CLI coercer).
//
// Invariant: --review-window and --per-source-cap must coerce to an integer
// >= 1 (with a sane upper bound). The old unbounded parseIntArg accepted 0 and
// negatives, which flowed into pageClaimsForReview / the triage per-source cap
// and caused an infinite loop / OOM. parsePositiveIntFlagArg is the validating
// coercer that replaces parseIntArg on those two flags.
//   BAD half  — 0, negatives, and non-integers are rejected with a clear,
//               surface-named InvalidArgumentError.
//   GOOD half — a positive integer is accepted and returned as a number.

import { describe, it, expect } from 'vitest';
import { InvalidArgumentError } from 'commander';

import { parsePositiveIntFlagArg } from '../../src/cli.js';

describe('parsePositiveIntFlagArg (A-CLI-001)', () => {
  const coerce = parsePositiveIntFlagArg('--review-window');

  it('rejects zero (BAD half — would cause an unbounded paging loop)', () => {
    expect(() => coerce('0')).toThrow(InvalidArgumentError);
    expect(() => coerce('0')).toThrow(/--review-window/);
  });

  it('rejects negative integers (BAD half)', () => {
    expect(() => coerce('-1')).toThrow(InvalidArgumentError);
    expect(() => coerce('-1')).toThrow(/--review-window/);
  });

  it('rejects non-integers / unit-suffixed values (BAD half)', () => {
    expect(() => coerce('abc')).toThrow(InvalidArgumentError);
    expect(() => coerce('5s')).toThrow(InvalidArgumentError);
    expect(() => coerce('1.5')).toThrow(InvalidArgumentError);
  });

  it('rejects values above the safety upper bound (BAD half — typo guard)', () => {
    expect(() => coerce('100001')).toThrow(InvalidArgumentError);
  });

  it('accepts a positive integer and returns a number (GOOD half)', () => {
    expect(coerce('1')).toBe(1);
    expect(coerce('30')).toBe(30);
  });

  it('names the --per-source-cap surface in its own error (parity)', () => {
    const cap = parsePositiveIntFlagArg('--per-source-cap');
    expect(() => cap('0')).toThrow(/--per-source-cap/);
    expect(cap('10')).toBe(10);
  });
});
