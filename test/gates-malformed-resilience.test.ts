import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { gate } from '../src/gates/index.js';

// B-C-005 regression: src/gates/run.ts:readJsonl tolerates malformed lines.
// A single bad line in any input JSONL no longer crashes the whole gate run
// with an opaque ZodError — the gate result instead carries a
// `malformed_jsonl_warnings[]` array of {path, line, reason} records.

let workDir: string;
let packPath: string;

async function makeBasicSection(): Promise<void> {
  const r = await init({
    topic: 'B-C-005 malformed-resilience fixture',
    outDir: workDir,
  });
  packPath = r.packPath;
  await sectionAdd({ id: '01-test', purpose: 'probe', packPath });

  // Write at least one valid source card + receipt so readSourceCards has
  // shape (it's not part of B-C-005's tolerance test).
  const sourceId = 'src_aaaaaaaaaaaa';
  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  await writeFile(
    join(cardDir, `${sourceId}.json`),
    JSON.stringify({
      source_id: sourceId,
      receipt_id: `rcpt_${sourceId.replace(/^src_/, '')}_1`,
      section_id: '01-test',
      url: 'https://example.com',
      final_url: 'https://example.com',
      fetched_at: '2026-05-06T22:00:00.000Z',
      publisher: 'p1',
      published_at: null,
      title: 'T',
      source_type: 'secondary',
      relevance: 'unknown',
      key_points: [],
      limitations: [],
      asserts: 'A',
      scope: null,
      not: null,
      extracted_by: 'heuristic',
      extracted_at: '2026-05-06T22:00:00.000Z',
    }),
    'utf8',
  );
  await appendFile(
    join(packPath, 'evidence', 'fetch-log.jsonl'),
    JSON.stringify({
      receipt_id: `rcpt_${sourceId.replace(/^src_/, '')}_1`,
      source_id: sourceId,
      section_id: '01-test',
      requested_url: 'https://example.com',
      final_url: 'https://example.com',
      status: 200,
      status_text: 'OK',
      content_type: 'text/html',
      fetched_at: '2026-05-06T22:00:00.000Z',
      byte_count: 100,
      sha256: createHash('sha256').update(sourceId).digest('hex'),
      title: 'T',
      raw_text_path: null,
      fetch_outcome: 'ok',
      fetch_error: null,
      extraction_outcome: 'ok',
      extraction_extractor: 'heuristic',
      extraction_error: null,
    }) + '\n',
    'utf8',
  );
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'ro-bc005-test-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('B-C-005 — gate readJsonl tolerates malformed lines', () => {
  it('returns successfully with one warning when claims.jsonl has one bad line', async () => {
    await makeBasicSection();
    const claimsPath = join(packPath, 'sections', '01-test', 'claims.jsonl');

    // One well-formed claim + one malformed (not JSON) line.
    const goodClaim = JSON.stringify({
      claim_id: 'clm_aaaaaaaaaaaa_heuristic_1',
      section_id: '01-test',
      source_ids: ['src_aaaaaaaaaaaa'],
      source_hashes: ['a'.repeat(64)],
      asserts: 'A',
      scope: 'narrow',
      not: 'broad',
      evidence_excerpt: 'literal',
      evidence_location: null,
      confidence: 'low',
      extractor: 'heuristic',
      extraction_method: 'heuristic_key_point',
      created_at: '2026-05-06T22:00:00.000Z',
      review_state: 'candidate',
    });
    await writeFile(claimsPath, goodClaim + '\n' + '{ broken line } not valid json\n', 'utf8');

    const result = await gate({ sectionId: '01-test', packPath });
    expect(result.section_id).toBe('01-test');
    expect(result.malformed_jsonl_warnings).toBeDefined();
    expect(result.malformed_jsonl_warnings.length).toBe(1);
    const w = result.malformed_jsonl_warnings[0]!;
    expect(w.path).toContain('claims.jsonl');
    expect(w.line).toBe(2);
    expect(w.reason).toMatch(/json|JSON|parse|Unexpected/i);
  });

  it('returns successfully with multiple warnings when several JSONL inputs have bad lines', async () => {
    await makeBasicSection();
    // Bad line in claims.jsonl AND in contradictions.jsonl.
    const claimsPath = join(packPath, 'sections', '01-test', 'claims.jsonl');
    await writeFile(claimsPath, '{ not json line 1\n', 'utf8');

    const contradictionsPath = join(
      packPath,
      'sections',
      '01-test',
      'contradictions.jsonl',
    );
    await writeFile(contradictionsPath, '{ also broken\nstill broken\n', 'utf8');

    const result = await gate({ sectionId: '01-test', packPath });
    expect(result.malformed_jsonl_warnings.length).toBeGreaterThanOrEqual(3);
    // Each warning has the right path + line + reason shape
    for (const w of result.malformed_jsonl_warnings) {
      expect(typeof w.path).toBe('string');
      expect(w.line).toBeGreaterThan(0);
      expect(typeof w.reason).toBe('string');
    }
  });

  it('returns empty warnings when all JSONL inputs are well-formed (default [])', async () => {
    await makeBasicSection();
    // No malformed lines anywhere
    const result = await gate({ sectionId: '01-test', packPath });
    expect(result.malformed_jsonl_warnings).toEqual([]);
  });
});
