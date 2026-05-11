import { describe, it, expect } from 'vitest';
import { InvalidArgumentError } from 'commander';
import { parseIntArg } from '../../src/cli.js';

// D-006: numeric CLI options must throw InvalidArgumentError on non-numeric
// input rather than silently propagating NaN. The helper is exported from
// cli.ts; integration testing the option flags themselves would require
// mocking commander.action which is heavy, so we unit-test the coercer.

describe('parseIntArg', () => {
  it('parses a valid base-10 integer', () => {
    const coerce = parseIntArg('--limit');
    expect(coerce('25')).toBe(25);
  });

  it('parses a negative integer', () => {
    const coerce = parseIntArg('--target');
    expect(coerce('-5')).toBe(-5);
  });

  it('parses leading-zero integers as decimal (parseInt with radix 10)', () => {
    const coerce = parseIntArg('--top');
    // parseInt('010', 10) === 10 — confirms we passed radix=10, not octal.
    expect(coerce('010')).toBe(10);
  });

  it('truncates trailing non-digit chars per parseInt semantics', () => {
    // parseInt('12abc', 10) === 12. This is intentional — we mirror
    // parseInt's behavior so existing tooling that depends on it stays
    // compatible. The hard error is reserved for entirely-non-numeric.
    const coerce = parseIntArg('--top');
    expect(coerce('12abc')).toBe(12);
  });

  it('throws InvalidArgumentError on entirely non-numeric input', () => {
    const coerce = parseIntArg('--limit');
    expect(() => coerce('abc')).toThrow(InvalidArgumentError);
  });

  it('throws InvalidArgumentError on empty string', () => {
    const coerce = parseIntArg('--limit');
    expect(() => coerce('')).toThrow(InvalidArgumentError);
  });

  it('error message includes the label and the offending value', () => {
    const coerce = parseIntArg('--max-time');
    try {
      coerce('not-a-number');
      // unreachable
      expect.fail('expected InvalidArgumentError to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidArgumentError);
      const msg = (err as Error).message;
      expect(msg).toContain('--max-time');
      expect(msg).toContain('not-a-number');
      expect(msg).toMatch(/expected integer/i);
    }
  });

  it('each call returns an independent coercer bound to its own label', () => {
    const a = parseIntArg('--top');
    const b = parseIntArg('--limit');
    try {
      a('xx');
      expect.fail('expected throw');
    } catch (err) {
      expect((err as Error).message).toContain('--top');
    }
    try {
      b('yy');
      expect.fail('expected throw');
    } catch (err) {
      expect((err as Error).message).toContain('--limit');
    }
  });
});
