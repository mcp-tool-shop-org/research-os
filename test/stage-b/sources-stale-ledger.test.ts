import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadOrBuildLedger } from '../../src/sources/excerpts/ledger.js';
import type { SourceCard } from '../../src/sources/schema.js';

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

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-stale-ledger-'));
  await mkdir(join(workDir, 'evidence'), { recursive: true });
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('B-SOURCES-001/003 — stale-ledger source_hash guard', () => {
  // RED-half target: a content-changed re-gather (new sourceHash) must NOT
  // reuse the cached excerpts derived from old content.
  it('rebuilds the ledger when the incoming sourceHash differs from the stored excerpts', async () => {
    const first = await loadOrBuildLedger({
      packPath: workDir,
      sourceCard: card,
      sourceHash: HASH_A,
      rawText: '<p>Original first sentence in the source.</p><p>Original second sentence here.</p>',
    });
    expect(first.built).toBe(true);
    for (const e of first.excerpts) expect(e.source_hash).toBe(HASH_A);

    // Same source_id, but the content changed → new hash + new raw text.
    const second = await loadOrBuildLedger({
      packPath: workDir,
      sourceCard: card,
      sourceHash: HASH_B,
      rawText: '<p>Completely revised first paragraph after edit.</p><p>Revised second paragraph here.</p>',
    });

    // The stale ledger must be rebuilt, not reused.
    expect(second.built).toBe(true);
    // Rebuilt excerpts carry the NEW hash, proving they came from current content.
    for (const e of second.excerpts) expect(e.source_hash).toBe(HASH_B);
  });

  // HAPPY-half: an unchanged re-gather (same non-null hash) still reuses the
  // cached ledger — default behavior must stay byte-identical.
  it('reuses the existing ledger when the incoming sourceHash matches', async () => {
    const first = await loadOrBuildLedger({
      packPath: workDir,
      sourceCard: card,
      sourceHash: HASH_A,
      rawText: '<p>Stable first sentence.</p><p>Stable second sentence here.</p>',
    });
    expect(first.built).toBe(true);

    const second = await loadOrBuildLedger({
      packPath: workDir,
      sourceCard: card,
      sourceHash: HASH_A,
      rawText: '<p>Different chunking text but same hash so it stays sticky.</p>',
    });
    expect(second.built).toBe(false);
    expect(second.excerpts).toEqual(first.excerpts);
  });

  // HAPPY-half: pre-hash ledgers (null stored hash) and null incoming hash
  // remain sticky — no spurious rebuild for the legacy/no-hash path.
  it('keeps reusing the ledger when the incoming sourceHash is null', async () => {
    const first = await loadOrBuildLedger({
      packPath: workDir,
      sourceCard: card,
      sourceHash: null,
      rawText: 'Once-built paragraph here.',
    });
    expect(first.built).toBe(true);

    const second = await loadOrBuildLedger({
      packPath: workDir,
      sourceCard: card,
      sourceHash: null,
      rawText: 'Different text on the second call would chunk differently — but ledger is sticky.',
    });
    expect(second.built).toBe(false);
  });
});
