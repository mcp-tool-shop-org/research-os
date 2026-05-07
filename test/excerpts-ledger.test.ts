import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadOrBuildLedger, ledgerPathFor } from '../src/sources/excerpts/ledger.js';
import type { SourceCard } from '../src/sources/schema.js';

let workDir: string;

const card: SourceCard = {
  source_id: 'src_abcdef012345',
  receipt_id: 'rcpt_abcdef012345_1700000000000',
  section_id: '01-landscape',
  url: 'https://example.com/x',
  final_url: 'https://example.com/x',
  fetched_at: '2026-05-06T22:00:00.000Z',
  publisher: 'Example Pub',
  published_at: null,
  title: 'Example',
  source_type: 'secondary',
  relevance: 'unknown',
  key_points: ['Key point one of meaningful length.', 'Key point two of meaningful length.'],
  limitations: [],
  asserts: 'Source headline',
  scope: null,
  not: null,
  extracted_by: 'heuristic',
  extracted_at: '2026-05-06T22:00:00.000Z',
};

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-ledger-'));
  await mkdir(join(workDir, 'evidence'), { recursive: true });
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('loadOrBuildLedger', () => {
  it('builds the ledger from raw text when available, with sequential excerpt IDs', async () => {
    const result = await loadOrBuildLedger({
      packPath: workDir,
      sourceCard: card,
      sourceHash: 'a'.repeat(64),
      rawText: '<p>First substantive sentence in the source.</p><p>Second substantive sentence in the source.</p>',
    });
    expect(result.built).toBe(true);
    expect(result.origin).toBe('raw_text');
    expect(result.excerpts.length).toBeGreaterThanOrEqual(2);
    expect(result.excerpts[0]?.excerpt_id).toBe('ex_abcdef012345_001');
    expect(result.excerpts[1]?.excerpt_id).toBe('ex_abcdef012345_002');
    for (const e of result.excerpts) {
      expect(e.source_id).toBe('src_abcdef012345');
      expect(e.source_hash).toBe('a'.repeat(64));
    }
  });

  it('falls back to key_points when no raw text is available', async () => {
    const result = await loadOrBuildLedger({
      packPath: workDir,
      sourceCard: card,
      sourceHash: null,
      rawText: null,
    });
    expect(result.built).toBe(true);
    expect(result.origin).toBe('key_point');
    expect(result.excerpts).toHaveLength(2);
    expect(result.excerpts[0]?.text).toBe('Key point one of meaningful length.');
  });

  it('loads the existing ledger on the second call without rebuilding', async () => {
    await loadOrBuildLedger({
      packPath: workDir,
      sourceCard: card,
      sourceHash: null,
      rawText: 'Once-built paragraph here.',
    });
    const second = await loadOrBuildLedger({
      packPath: workDir,
      sourceCard: card,
      sourceHash: null,
      rawText: 'Different text on the second call would chunk differently — but ledger is sticky.',
    });
    expect(second.built).toBe(false);
  });

  it('writes the ledger at evidence/excerpts/<source_id>.jsonl', async () => {
    await loadOrBuildLedger({
      packPath: workDir,
      sourceCard: card,
      sourceHash: null,
      rawText: 'A single paragraph that is long enough to chunk.',
    });
    const path = ledgerPathFor(workDir, 'src_abcdef012345');
    expect(path).toContain(join('evidence', 'excerpts', 'src_abcdef012345.jsonl'));
  });
});
