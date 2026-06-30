/**
 * A-SOURCES-004 regression — deterministic equal-created_at tie-break.
 *
 * getEffectiveSourceType / getEffectivePublisher previously resolved an
 * equal-created_at tie to the FIRST (older / earlier-appended) override
 * because the stable sort returned 0. The correct winner is the
 * later-APPENDED record (latest operator action wins).
 *
 * Both halves:
 *   - BAD: two overrides with identical created_at — the SECOND-appended
 *     value must win (was the first).
 *   - GOOD: distinct created_at still resolves to the newer timestamp.
 */
import { describe, it, expect } from 'vitest';
import {
  getEffectiveSourceType,
  getEffectivePublisher,
} from '../../src/sources/effective-card.js';
import type { SourceCardOverride } from '../../src/sources/source-card-overrides-schema.js';

function override(partial: Partial<SourceCardOverride>): SourceCardOverride {
  return {
    source_id: 'src_aaaaaaaaaaaa',
    url: 'https://example.com/x',
    reason: 'operator correction',
    operator: 'tester',
    created_at: '2026-01-01T00:00:00.000Z',
    pack_version: '0.13.1',
    ...partial,
  } as SourceCardOverride;
}

const card = { source_id: 'src_aaaaaaaaaaaa', source_type: 'other' as const };
const pubCard = { source_id: 'src_aaaaaaaaaaaa', publisher: null };

describe('A-SOURCES-004 — equal-created_at tie-break (source_type)', () => {
  it('later-appended override wins on identical created_at', () => {
    const sameTs = '2026-02-02T12:00:00.000Z';
    const overrides = [
      override({ created_at: sameTs, new_source_type: 'primary' }), // first
      override({ created_at: sameTs, new_source_type: 'secondary' }), // later — should win
    ];
    expect(getEffectiveSourceType(card, overrides)).toBe('secondary');
  });

  it('GOOD half: distinct created_at resolves to the newer timestamp', () => {
    const overrides = [
      override({ created_at: '2026-02-02T12:00:00.000Z', new_source_type: 'secondary' }),
      override({ created_at: '2026-01-01T00:00:00.000Z', new_source_type: 'primary' }),
    ];
    expect(getEffectiveSourceType(card, overrides)).toBe('secondary');
  });
});

describe('A-SOURCES-004 — equal-created_at tie-break (publisher)', () => {
  it('later-appended publisher override wins on identical created_at', () => {
    const sameTs = '2026-03-03T08:00:00.000Z';
    const overrides = [
      override({ created_at: sameTs, new_publisher: 'Old Press' }),
      override({ created_at: sameTs, new_publisher: 'New Press' }), // later — should win
    ];
    expect(getEffectivePublisher(pubCard, overrides)).toBe('New Press');
  });

  it('GOOD half: distinct created_at resolves to the newer timestamp', () => {
    const overrides = [
      override({ created_at: '2026-03-03T08:00:00.000Z', new_publisher: 'New Press' }),
      override({ created_at: '2026-01-01T00:00:00.000Z', new_publisher: 'Old Press' }),
    ];
    expect(getEffectivePublisher(pubCard, overrides)).toBe('New Press');
  });
});
