import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import { build, query } from '../../src/indexer/index.js';
import { ResearchOSError } from '../../src/errors.js';

// A-IDX-001 regression. The invariant has two halves:
//   GOOD: plain hyphenated terms ('machine-learning', 'cost-benefit',
//         'peer-reviewed') are searched literally and return hits — they
//         must NOT be passed UNQUOTED into FTS5 MATCH (where '-learning'
//         parses as a column filter and raises a raw SqliteError 'no such
//         column: learning').
//   BAD:  a genuinely broken FTS5 expression yields a structured
//         ResearchOSError (code INDEX_QUERY_INVALID), not a raw SqliteError.

let workDir: string;
let packPath: string;

async function makePopulatedPack(): Promise<void> {
  const r = await init({ topic: 'How do hyphenated search terms behave in the indexer?', outDir: workDir });
  packPath = r.packPath;
  await sectionAdd({ id: '01-test', purpose: 'probe', packPath });

  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  const card = {
    source_id: 'src_aaaaaaaaaaaa',
    receipt_id: 'rcpt_aaaaaaaaaaaa_1',
    section_id: '01-test',
    url: 'https://example.org/ml.html',
    final_url: 'https://example.org/ml.html',
    fetched_at: '2026-05-06T22:00:00.000Z',
    publisher: 'example.org',
    published_at: null,
    title: 'Machine-learning cost-benefit (peer-reviewed)',
    source_type: 'secondary',
    relevance: 'unknown',
    key_points: ['machine-learning has a cost-benefit tradeoff'],
    limitations: [],
    asserts: 'machine-learning cost-benefit peer-reviewed study',
    scope: null,
    not: null,
    extracted_by: 'heuristic',
    extracted_at: '2026-05-06T22:00:00.000Z',
  };
  await writeFile(join(cardDir, `${card.source_id}.json`), JSON.stringify(card), 'utf8');
  await appendFile(
    join(packPath, 'sections', '01-test', 'sources.jsonl'),
    JSON.stringify({ source_id: card.source_id, added_at: '2026-05-06T22:00:01.000Z' }) + '\n',
    'utf8',
  );

  const receipt = {
    receipt_id: 'rcpt_aaaaaaaaaaaa_1',
    source_id: 'src_aaaaaaaaaaaa',
    section_id: '01-test',
    requested_url: 'https://example.org/ml.html',
    final_url: 'https://example.org/ml.html',
    status: 200,
    status_text: 'OK',
    content_type: 'text/html',
    fetched_at: '2026-05-06T22:00:00.000Z',
    byte_count: 100,
    sha256: createHash('sha256').update('src_aaaaaaaaaaaa').digest('hex'),
    title: 'ML',
    raw_text_path: 'evidence/raw/src_aaaaaaaaaaaa.html',
    fetch_outcome: 'ok',
    fetch_error: null,
    extraction_outcome: 'ok',
    extraction_extractor: 'heuristic',
    extraction_error: null,
  };
  await appendFile(
    join(packPath, 'evidence', 'fetch-log.jsonl'),
    JSON.stringify(receipt) + '\n',
    'utf8',
  );

  const claim = {
    claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
    section_id: '01-test',
    source_ids: ['src_aaaaaaaaaaaa'],
    source_hashes: ['a'.repeat(64)],
    asserts: 'machine-learning models require a cost-benefit analysis backed by peer-reviewed evidence',
    scope: 'machine-learning',
    not: 'unrelated heuristics',
    evidence_excerpt: 'machine-learning cost-benefit peer-reviewed literal text',
    evidence_location: null,
    confidence: 'medium',
    extractor: 'ollama-intern',
    extraction_method: 'ollama_intern_propositional',
    created_at: '2026-05-06T22:00:00.000Z',
    review_state: 'candidate',
  };
  await appendFile(
    join(packPath, 'sections', '01-test', 'claims.jsonl'),
    JSON.stringify(claim) + '\n',
    'utf8',
  );

  await build({ packPath, all: true });
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-stage-a-fts-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('A-IDX-001 hyphenated FTS terms', () => {
  it('GOOD: machine-learning returns hits and does not throw', async () => {
    await makePopulatedPack();
    const result = query({ packPath, term: 'machine-learning' });
    expect(result.totalHits).toBeGreaterThan(0);
  });

  it('GOOD: cost-benefit returns hits and does not throw', async () => {
    await makePopulatedPack();
    const result = query({ packPath, term: 'cost-benefit' });
    expect(result.totalHits).toBeGreaterThan(0);
  });

  it('GOOD: peer-reviewed returns hits and does not throw', async () => {
    await makePopulatedPack();
    const result = query({ packPath, term: 'peer-reviewed' });
    expect(result.totalHits).toBeGreaterThan(0);
  });

  it('BAD: a deliberately broken FTS expression yields a structured ResearchOSError, not a raw SqliteError', async () => {
    await makePopulatedPack();
    // An unbalanced quote is unambiguous FTS intent (leading '"') so it is
    // passed through to MATCH and fails inside FTS5 — must be converted.
    let caught: unknown;
    try {
      query({ packPath, term: '"unterminated AND (' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ResearchOSError);
    expect((caught as ResearchOSError).code).toBe('INDEX_QUERY_INVALID');
    expect((caught as ResearchOSError).hint).toBeTruthy();
  });
});
