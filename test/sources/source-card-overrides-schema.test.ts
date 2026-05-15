/**
 * A-003 regression — source-card override refine semantics.
 *
 * The refine condition now keys on "at least one of new_source_type or
 * new_publisher is PRESENT in the object" rather than "non-null". This
 * permits publisher-only nulling — a valid operator correction that the
 * earlier refine erroneously rejected.
 */
import { describe, it, expect } from 'vitest';
import { validateSourceCardOverride } from '../../src/sources/source-card-overrides-schema.js';

const base = {
  source_id: 'src_aabbccddeeff',
  url: 'https://example.com/page',
  reason: 'regression test',
  operator: 'test',
  created_at: '2026-05-10T10:00:00.000Z',
  pack_version: '0.4.0',
};

describe('A-003 — source-card override refine accepts presence (not non-null)', () => {
  it('accepts publisher-only nulling: { new_publisher: null }', () => {
    expect(() =>
      validateSourceCardOverride({ ...base, new_publisher: null }),
    ).not.toThrow();
  });

  it('accepts publisher-only non-null: { new_publisher: "X" }', () => {
    expect(() =>
      validateSourceCardOverride({ ...base, new_publisher: 'XRPL Foundation' }),
    ).not.toThrow();
  });

  it('accepts source-type-only: { new_source_type: "primary" }', () => {
    expect(() =>
      validateSourceCardOverride({ ...base, new_source_type: 'primary' }),
    ).not.toThrow();
  });

  it('accepts both fields set together', () => {
    expect(() =>
      validateSourceCardOverride({
        ...base,
        new_source_type: 'secondary',
        new_publisher: 'Example Foundation',
      }),
    ).not.toThrow();
  });

  it('accepts both keys explicitly set to null (publisher-only nulling, source-type unchanged)', () => {
    expect(() =>
      validateSourceCardOverride({
        ...base,
        new_source_type: null,
        new_publisher: null,
      }),
    ).not.toThrow();
  });

  it('rejects when neither key is present in the object', () => {
    // v0.10 Slice 3 — refine message expanded to mention clear_severities
    // alongside new_source_type / new_publisher.
    expect(() => validateSourceCardOverride({ ...base })).toThrow(
      /at least one of new_source_type, new_publisher, or clear_severities/i,
    );
  });
});
