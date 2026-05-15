/**
 * R-003 + R-005 (v0.10 Slice 3) — override-ledger extension to clear severities.
 *
 * The existing v0.4 override-ledger schema requires at least one of
 * new_source_type or new_publisher. Slice 3 introduces an additional
 * field `clear_severities: SourceSeverity[]` so an operator can clear a
 * quarantine signal when they have out-of-band evidence the fetch was
 * legitimate (or the extraction was rich-but-honest).
 *
 * The refine semantics relax to: at least one of new_source_type,
 * new_publisher, OR clear_severities must be present.
 */
import { describe, it, expect } from 'vitest';

import { validateSourceCardOverride } from '../../src/sources/source-card-overrides-schema.js';

const base = {
  source_id: 'src_aabbccddeeff',
  url: 'https://example.com/page',
  reason: 'operator authoring',
  operator: 'test-op',
  created_at: '2026-05-15T10:00:00.000Z',
  pack_version: '0.10.0',
};

describe('source-card override — clear_severities field', () => {
  it('accepts clear_severities alone (no new_source_type, no new_publisher)', () => {
    expect(() =>
      validateSourceCardOverride({
        ...base,
        clear_severities: ['bot_check_or_captcha_detected'],
      }),
    ).not.toThrow();
  });

  it('accepts clear_severities combined with new_source_type', () => {
    expect(() =>
      validateSourceCardOverride({
        ...base,
        new_source_type: 'primary',
        clear_severities: ['extraction_suspect_word_count_mismatch'],
      }),
    ).not.toThrow();
  });

  it('accepts both severity values in a single clear_severities array', () => {
    expect(() =>
      validateSourceCardOverride({
        ...base,
        clear_severities: [
          'bot_check_or_captcha_detected',
          'extraction_suspect_word_count_mismatch',
        ],
      }),
    ).not.toThrow();
  });

  it('rejects an unknown severity name in clear_severities', () => {
    expect(() =>
      validateSourceCardOverride({
        ...base,
        clear_severities: ['some_unknown_severity'],
      }),
    ).toThrow();
  });

  it('still rejects entries with neither field — refine semantics preserved', () => {
    expect(() => validateSourceCardOverride({ ...base })).toThrow(
      /at least one of new_source_type, new_publisher, or clear_severities/i,
    );
  });

  it('back-compat: pre-Slice-3 override (new_source_type alone) still validates', () => {
    expect(() =>
      validateSourceCardOverride({ ...base, new_source_type: 'primary' }),
    ).not.toThrow();
  });
});
