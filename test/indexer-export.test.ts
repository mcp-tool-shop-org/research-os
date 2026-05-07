import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { build, exportRepoKnowledge, syncRepoKnowledge, IndexNotBuiltError } from '../src/indexer/index.js';

let workDir: string;
let packPath: string;

async function basicPack() {
  const r = await init({ topic: 'How does the export-repo-knowledge step behave?', outDir: workDir });
  packPath = r.packPath;
  await sectionAdd({ id: '01-test', purpose: 'probe', packPath });
  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  const card = {
    source_id: 'src_aaaaaaaaaaaa',
    receipt_id: 'rcpt_aaaaaaaaaaaa_1',
    section_id: '01-test',
    url: 'https://example.com',
    final_url: 'https://example.com',
    fetched_at: '2026-05-06T22:00:00.000Z',
    publisher: 'p1',
    published_at: null,
    title: 'T',
    source_type: 'secondary',
    relevance: 'unknown',
    key_points: ['kp'],
    limitations: [],
    asserts: 'A asserts',
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
    requested_url: 'https://example.com',
    final_url: 'https://example.com',
    status: 200,
    status_text: 'OK',
    content_type: 'text/html',
    fetched_at: '2026-05-06T22:00:00.000Z',
    byte_count: 100,
    sha256: createHash('sha256').update('src_aaaaaaaaaaaa').digest('hex'),
    title: 'T',
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
    asserts: 'C asserts something',
    scope: 'narrow',
    not: 'broad',
    evidence_excerpt: 'literal',
    evidence_location: null,
    confidence: 'low',
    extractor: 'heuristic',
    extraction_method: 'heuristic_key_point',
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
  workDir = await mkdtemp(join(tmpdir(), 'research-os-indexer-export-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('exportRepoKnowledge', () => {
  it('writes a JSONL file with claim and source facts', async () => {
    await basicPack();
    const summary = await exportRepoKnowledge({ packPath });
    expect(summary.outPath.endsWith('research-os-facts.jsonl')).toBe(true);
    expect(summary.factCount).toBeGreaterThan(0);
    expect(summary.byType['research_os.claim']).toBe(1);
    expect(summary.byType['research_os.source']).toBe(1);

    const content = await readFile(summary.outPath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    expect(lines.length).toBe(summary.factCount);
    for (const line of lines) {
      const fact = JSON.parse(line);
      expect(typeof fact.id).toBe('string');
      expect(typeof fact.fact_type).toBe('string');
      expect(typeof fact.text).toBe('string');
      expect(typeof fact.artifact_path).toBe('string');
    }
  });

  it('throws IndexNotBuiltError when index is missing', async () => {
    const r = await init({ topic: 'How does the indexer export-repo-knowledge behave without an index?', outDir: workDir });
    packPath = r.packPath;
    await expect(exportRepoKnowledge({ packPath })).rejects.toBeInstanceOf(IndexNotBuiltError);
  });

  it('respects --out path when provided', async () => {
    await basicPack();
    const out = join(workDir, 'custom', 'facts.jsonl');
    const summary = await exportRepoKnowledge({ packPath, outPath: out });
    expect(summary.outPath).toBe(out);
    expect(existsSync(out)).toBe(true);
  });
});

describe('syncRepoKnowledge', () => {
  it('skips cleanly when @mcptoolshop/repo-knowledge is not locally installed', async () => {
    await basicPack();
    const result = await syncRepoKnowledge({ packPath });
    expect(result.attempted).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.factsSynced).toBe(0);
    expect(result.reason).toContain('not available locally');
  });
});
