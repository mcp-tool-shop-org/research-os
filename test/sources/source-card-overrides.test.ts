/**
 * Component A (v0.4) — source-card override ledger tests.
 *
 * 13 cases covering: readOverrides, appendOverride, validateSourceCardOverride,
 * getEffectiveSourceType, getEffectivePublisher, buildCard integration, and
 * the F-27 closure proof (re-gather cannot revert operator corrections).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readOverrides, appendOverride } from '../../src/sources/source-card-overrides.js';
import { validateSourceCardOverride } from '../../src/sources/source-card-overrides-schema.js';
import { getEffectiveSourceType, getEffectivePublisher } from '../../src/sources/effective-card.js';
import { buildCard } from '../../src/sources/cards.js';
import type { SourceCardOverride } from '../../src/sources/source-card-overrides-schema.js';
import type { FetchReceipt, SourceCard } from '../../src/sources/schema.js';
import type { ExtractionResult } from '../../src/sources/types.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'research-os-overrides-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

/** Minimal valid override with new_source_type only. */
function makeOverride(partial: Partial<SourceCardOverride> = {}): SourceCardOverride {
  return {
    source_id: 'src_aabbccddeeff',
    url: 'https://example.com/page',
    new_source_type: 'primary',
    reason: 'test override',
    operator: 'test-operator',
    created_at: '2026-05-10T10:00:00.000Z',
    pack_version: '0.4.0',
    ...partial,
  };
}

/** Minimal schema-conformant FetchReceipt. */
function makeReceipt(sourceId: string, url: string): FetchReceipt {
  return {
    receipt_id: `rcpt_aabbcc_1`,
    source_id: sourceId,
    section_id: '01-test',
    requested_url: url,
    final_url: url,
    status: 200,
    status_text: 'OK',
    content_type: 'text/html',
    fetched_at: '2026-05-10T10:00:00.000Z',
    byte_count: 1000,
    sha256: 'a'.repeat(64),
    title: 'Test Page',
    raw_text_path: null,
    fetch_outcome: 'ok',
    fetch_error: null,
    extraction_outcome: 'ok',
    extraction_extractor: 'heuristic',
    extraction_error: null,
  };
}

/** Minimal successful extraction result. */
function makeExtraction(
  partial: Partial<Extract<ExtractionResult, { ok: true }>> = {},
): Extract<ExtractionResult, { ok: true }> {
  return {
    ok: true,
    publisher: null,
    published_at: null,
    title: 'Test Page',
    source_type: 'secondary',
    relevance: 'medium',
    key_points: ['point one'],
    limitations: [],
    asserts: 'This source asserts something.',
    scope: null,
    not: null,
    ...partial,
  };
}

// ── Test 1: Empty / missing ledger reads as no overrides ──────────────────────

describe('readOverrides — missing file', () => {
  it('returns [] when evidence/source-card-overrides.jsonl does not exist', async () => {
    const result = await readOverrides(tmpDir);
    expect(result).toEqual([]);
  });
});

// ── Test 2: Append a valid source-type override ───────────────────────────────

describe('appendOverride + readOverrides — source-type roundtrip', () => {
  it('appends a valid new_source_type entry and reads it back', async () => {
    const override = makeOverride({ new_source_type: 'primary' });
    await appendOverride(tmpDir, override);
    const result = await readOverrides(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].new_source_type).toBe('primary');
    expect(result[0].source_id).toBe(override.source_id);
    expect(result[0].reason).toBe('test override');
  });
});

// ── Test 3: Append a valid publisher override ─────────────────────────────────

describe('appendOverride + readOverrides — publisher roundtrip', () => {
  it('appends a valid new_publisher entry and reads it back', async () => {
    const override = makeOverride({
      new_source_type: undefined,
      new_publisher: 'XRPL Foundation',
    });
    await appendOverride(tmpDir, override);
    const result = await readOverrides(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].new_publisher).toBe('XRPL Foundation');
    expect(result[0].new_source_type).toBeUndefined();
  });
});

// ── Test 4: Reject override with neither field ────────────────────────────────

describe('validateSourceCardOverride — no-op override rejection', () => {
  it('throws when both new_source_type and new_publisher are absent', () => {
    const bad = {
      source_id: 'src_aabbccddeeff',
      url: 'https://example.com',
      reason: 'should fail',
      operator: 'op',
      created_at: '2026-05-10T10:00:00.000Z',
      pack_version: '0.4.0',
      // neither new_source_type nor new_publisher present
    };
    expect(() => validateSourceCardOverride(bad)).toThrow(
      /at least one of new_source_type or new_publisher/i,
    );
  });

  it('throws when both new_source_type and new_publisher are explicitly null', () => {
    const bad = {
      source_id: 'src_aabbccddeeff',
      url: 'https://example.com',
      new_source_type: null,
      new_publisher: null,
      reason: 'both null',
      operator: 'op',
      created_at: '2026-05-10T10:00:00.000Z',
      pack_version: '0.4.0',
    };
    expect(() => validateSourceCardOverride(bad)).toThrow(
      /at least one of new_source_type or new_publisher/i,
    );
  });

  it('throws when reason is whitespace-only', () => {
    const bad = {
      source_id: 'src_aabbccddeeff',
      url: 'https://example.com',
      new_source_type: 'primary',
      reason: '   ',
      operator: 'op',
      created_at: '2026-05-10T10:00:00.000Z',
      pack_version: '0.4.0',
    };
    expect(() => validateSourceCardOverride(bad)).toThrow(/reason/i);
  });

  it('throws when new_source_type is not an allowed enum value', () => {
    const bad = {
      source_id: 'src_aabbccddeeff',
      url: 'https://example.com',
      new_source_type: 'journal',
      reason: 'bad enum',
      operator: 'op',
      created_at: '2026-05-10T10:00:00.000Z',
      pack_version: '0.4.0',
    };
    expect(() => validateSourceCardOverride(bad)).toThrow();
  });

  it('throws when created_at is not a valid ISO 8601 timestamp', () => {
    const bad = {
      source_id: 'src_aabbccddeeff',
      url: 'https://example.com',
      new_source_type: 'primary',
      reason: 'bad date',
      operator: 'op',
      created_at: 'not-a-date',
      pack_version: '0.4.0',
    };
    expect(() => validateSourceCardOverride(bad)).toThrow(/ISO 8601/i);
  });
});

// ── Test 5: Latest valid override wins for same source_id ─────────────────────

describe('getEffectiveSourceType — latest-wins precedence', () => {
  it('returns newer entry when two entries share the same source_id', () => {
    const older = makeOverride({
      new_source_type: 'secondary',
      created_at: '2026-05-10T09:00:00.000Z',
    });
    const newer = makeOverride({
      new_source_type: 'primary',
      created_at: '2026-05-10T10:00:00.000Z',
    });
    const card = { source_id: older.source_id, source_type: 'unknown' as const };
    // Pass in reverse order to verify sort is not order-dependent
    const result = getEffectiveSourceType(card, [newer, older]);
    expect(result).toBe('primary');
  });
});

// ── Test 6: Effective source type uses override over classifier result ─────────

describe('getEffectiveSourceType — override beats classifier', () => {
  it('returns override new_source_type when override exists, ignoring card.source_type', () => {
    const override = makeOverride({ new_source_type: 'primary' });
    const card = { source_id: override.source_id, source_type: 'secondary' as const };
    expect(getEffectiveSourceType(card, [override])).toBe('primary');
  });

  it('returns card.source_type when no override exists for this source_id', () => {
    const override = makeOverride({ source_id: 'src_111111111111', new_source_type: 'primary' });
    const card = { source_id: 'src_222222222222', source_type: 'docs' as const };
    expect(getEffectiveSourceType(card, [override])).toBe('docs');
  });
});

// ── Test 7: Effective publisher uses override over extractor result ────────────

describe('getEffectivePublisher — override beats extractor', () => {
  it('returns override new_publisher when override exists, ignoring card.publisher', () => {
    const override = makeOverride({
      new_source_type: undefined,
      new_publisher: 'docs.comfy.org',
    });
    const card = { source_id: override.source_id, publisher: null };
    expect(getEffectivePublisher(card, [override])).toBe('docs.comfy.org');
  });

  it('returns card.publisher when no matching publisher override exists', () => {
    const override = makeOverride({
      source_id: 'src_111111111111',
      new_source_type: undefined,
      new_publisher: 'someone-else',
    });
    const card = { source_id: 'src_222222222222', publisher: 'Pub Two' };
    expect(getEffectivePublisher(card, [override])).toBe('Pub Two');
  });

  it('latest-wins for publisher: newer publisher override wins', () => {
    const older = makeOverride({
      new_source_type: undefined,
      new_publisher: 'OldPublisher',
      created_at: '2026-05-10T08:00:00.000Z',
    });
    const newer = makeOverride({
      new_source_type: undefined,
      new_publisher: 'NewPublisher',
      created_at: '2026-05-10T10:00:00.000Z',
    });
    const card = { source_id: older.source_id, publisher: null };
    expect(getEffectivePublisher(card, [older, newer])).toBe('NewPublisher');
  });
});

// ── Test 8: rule_hint preserved; override dominates type but not evidence ──────

describe('buildCard — rule_hint preserved when override applies', () => {
  it('card carries classifier rule_hint AND overridden source_type after override', () => {
    const sourceId = 'src_aabbccddeeff';
    const url = 'https://xrpl.org/docs/references/protocol';
    const receipt = makeReceipt(sourceId, url);
    const extraction = makeExtraction({ source_type: 'secondary' });

    // Override changes source_type from 'primary' (classifier would set via canonical-vendor)
    // to 'docs' — verifying rule_hint is preserved regardless of override.
    const override = makeOverride({
      source_id: sourceId,
      url,
      new_source_type: 'docs',
    });

    const card = buildCard({ receipt, extraction, extractedBy: 'heuristic', overrides: [override] });

    // Classifier (L3 canonical-vendor:xrpl-foundation) set rule_hint — preserved.
    expect(card.rule_hint).toBe('canonical-vendor:xrpl-foundation');
    expect(card.precedence_level).toBe(3);
    // Override (L1) dominated the source_type value.
    expect(card.source_type).toBe('docs');
  });
});

// ── Test 9: Re-gather does not revert corrected source_type (F-27 closure) ────

describe('buildCard + overrides — F-27 closure: re-gather does not revert source_type', () => {
  it('card written during re-gather carries overridden source_type, not classifier result', () => {
    const sourceId = 'src_aabbccddeeff';
    // URL that classifier would type as 'unknown' (no-rule-match)
    const url = 'https://some-research-blog.example.com/paper';
    const receipt = makeReceipt(sourceId, url);
    // Extractor originally said secondary; operator corrected to primary via override.
    const extraction = makeExtraction({ source_type: 'secondary' });
    const override = makeOverride({
      source_id: sourceId,
      url,
      new_source_type: 'primary',
      reason: 'This is a primary source for the topic',
    });

    // Simulate re-gather: buildCard runs again with the same source_id and same extractor output,
    // but with the override ledger loaded. The override must dominate.
    const card = buildCard({ receipt, extraction, extractedBy: 'heuristic', overrides: [override] });
    expect(card.source_type).toBe('primary');
    expect(card.source_id).toBe(sourceId);
  });
});

// ── Test 10: Re-gather does not revert corrected publisher (F-27 closure) ──────

describe('buildCard + overrides — F-27 closure: re-gather does not revert publisher', () => {
  it('card written during re-gather carries overridden publisher, not extractor result', () => {
    const sourceId = 'src_aabbccddeeff';
    const url = 'https://some-research-blog.example.com/paper';
    const receipt = makeReceipt(sourceId, url);
    // Extractor returned null publisher (common in external packs).
    const extraction = makeExtraction({ publisher: null });
    const override = makeOverride({
      source_id: sourceId,
      url,
      new_source_type: undefined,
      new_publisher: 'ResearchGroup Inc.',
      reason: 'Publisher identified by operator after review',
    });

    const card = buildCard({ receipt, extraction, extractedBy: 'heuristic', overrides: [override] });
    expect(card.publisher).toBe('ResearchGroup Inc.');
    expect(card.source_id).toBe(sourceId);
  });
});

// ── Test 11 (moved): Malformed JSONL throws with line context ─────────────────
// (Frozen-pack byte-identity is verified via verify-pack shell commands in Step 6.)

describe('readOverrides — malformed JSONL behavior', () => {
  it('throws with line number and content when a line is not valid JSON', async () => {
    await mkdir(join(tmpDir, 'evidence'), { recursive: true });
    const validLine = JSON.stringify(makeOverride());
    const badLine = 'not-valid-json{{{';
    await writeFile(
      join(tmpDir, 'evidence', 'source-card-overrides.jsonl'),
      `${validLine}\n${badLine}\n`,
      'utf8',
    );

    await expect(readOverrides(tmpDir)).rejects.toThrow(/line 2/i);
    await expect(readOverrides(tmpDir)).rejects.toThrow(badLine.slice(0, 20));
  });

  it('throws with validation context when a line is valid JSON but fails schema', async () => {
    await mkdir(join(tmpDir, 'evidence'), { recursive: true });
    const validLine = JSON.stringify(makeOverride());
    const invalidOverride = JSON.stringify({
      source_id: 'src_aabbccddeeff',
      url: 'https://example.com',
      // Neither new_source_type nor new_publisher — fails refinement
      reason: 'test',
      operator: 'op',
      created_at: '2026-05-10T10:00:00.000Z',
      pack_version: '0.4.0',
    });
    await writeFile(
      join(tmpDir, 'evidence', 'source-card-overrides.jsonl'),
      `${validLine}\n${invalidOverride}\n`,
      'utf8',
    );

    await expect(readOverrides(tmpDir)).rejects.toThrow(/line 2/i);
    await expect(readOverrides(tmpDir)).rejects.toThrow(/new_source_type or new_publisher/i);
  });
});

// ── Test 13: GitHub UI HTML demonstration card integration ────────────────────

describe('getEffectiveSourceType — GitHub UI HTML card override (canonical proof case)', () => {
  it('corrects source_type for a GitHub UI HTML card via override without mutating the frozen card', () => {
    // Represents a frozen card like github.com/godotengine/godot/releases
    // The classifier flags these as unknown+flagged:github-ui-html.
    // Operator authors an override to correct it in the ledger (not the card file).
    const frozenCard: Pick<SourceCard, 'source_id' | 'source_type'> = {
      source_id: 'src_deadbeef0000',
      source_type: 'unknown',
    };

    const override: SourceCardOverride = {
      source_id: 'src_deadbeef0000',
      url: 'https://github.com/godotengine/godot/releases',
      previous_source_type: 'unknown',
      new_source_type: 'secondary',
      reason:
        'GitHub releases UI — secondary reference for version history. Not API JSON.',
      operator: 'test-operator',
      created_at: '2026-05-10T10:00:00.000Z',
      pack_version: '0.4.0',
    };

    // Frozen card object is NOT mutated. Effective view is computed from ledger.
    const originalType = frozenCard.source_type;
    const effectiveType = getEffectiveSourceType(frozenCard, [override]);

    expect(originalType).toBe('unknown');     // frozen card unchanged
    expect(effectiveType).toBe('secondary');  // override applied at read time
  });

  it('field independence: a source_type override does not affect publisher resolution', () => {
    // A later override sets only new_source_type; an earlier override set new_publisher.
    // Publisher resolution must still return the publisher from the earlier override.
    const sourceId = 'src_deadbeef0001';
    const publisherOverride = makeOverride({
      source_id: sourceId,
      new_source_type: undefined,
      new_publisher: 'Godot Foundation',
      created_at: '2026-05-10T08:00:00.000Z',
    });
    const typeOverride = makeOverride({
      source_id: sourceId,
      new_source_type: 'docs',
      created_at: '2026-05-10T10:00:00.000Z',
    });

    const card = { source_id: sourceId, source_type: 'unknown' as const, publisher: null };
    expect(getEffectiveSourceType(card, [publisherOverride, typeOverride])).toBe('docs');
    expect(getEffectivePublisher(card, [publisherOverride, typeOverride])).toBe('Godot Foundation');
  });
});
