/**
 * A-CLAIMS-004 regression — the never-incremented, never-emitted rejection
 * counters claimsRejectedScopeMissing / claimsRejectedExtractorParaphrase are
 * removed from ExtractClaimsSummary (and its initializer in extract.ts).
 *
 * INVARIANT (both halves proven):
 *   (bad)  the dead keys are absent from a real ExtractClaimsSummary object.
 *   (good) the two genuinely-detected categories remain present and counted
 *          (claimsRejectedExcerptIdMissing / claimsRejectedExcerptIdMalformed).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import { extract } from '../../src/claims/index.js';
import { HeuristicClaimExtractor } from '../../src/claims/extractors/heuristic.js';

const sourceId = 'src_abcdef012345';
const sha256 = 'a'.repeat(64);

let workDir: string;
let packPath: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-dead-fields-'));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function fixturePack(keyPoints: string[]): Promise<void> {
  const result = await init({ topic: 'Dead-field probe', outDir: workDir });
  packPath = result.packPath;
  await sectionAdd({ id: '01-landscape', purpose: 'Probe', packPath });
  const rawText = `<html><body>${keyPoints.map((kp) => `<p>${kp}</p>`).join('')}</body></html>`;
  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  await writeFile(
    join(cardDir, `${sourceId}.json`),
    JSON.stringify({
      source_id: sourceId,
      receipt_id: `rcpt_${sourceId.replace(/^src_/, '')}_1700000000000`,
      section_id: '01-landscape',
      url: 'https://example.com/x',
      final_url: 'https://example.com/x',
      fetched_at: '2026-05-06T22:00:00.000Z',
      publisher: 'Example Pub',
      published_at: null,
      title: 'Example Source',
      source_type: 'secondary',
      relevance: 'unknown',
      key_points: keyPoints,
      limitations: [],
      asserts: 'Source headline assertion',
      scope: null,
      not: null,
      extracted_by: 'heuristic',
      extracted_at: '2026-05-06T22:00:00.000Z',
    }),
    'utf8',
  );
  const rawDir = join(packPath, 'evidence', 'raw');
  await mkdir(rawDir, { recursive: true });
  await writeFile(join(rawDir, `${sourceId}.html`), rawText, 'utf8');
  await appendFile(
    join(packPath, 'evidence', 'fetch-log.jsonl'),
    JSON.stringify({
      receipt_id: `rcpt_${sourceId.replace(/^src_/, '')}_1700000000000`,
      source_id: sourceId,
      section_id: '01-landscape',
      requested_url: 'https://example.com/x',
      final_url: 'https://example.com/x',
      status: 200,
      status_text: 'OK',
      content_type: 'text/html',
      fetched_at: '2026-05-06T22:00:00.000Z',
      byte_count: rawText.length,
      sha256,
      title: 'Example Source',
      raw_text_path: `evidence/raw/${sourceId}.html`,
      fetch_outcome: 'ok',
      fetch_error: null,
      extraction_outcome: 'ok',
      extraction_extractor: 'heuristic',
      extraction_error: null,
    }) + '\n',
    'utf8',
  );
  await appendFile(
    join(packPath, 'sections', '01-landscape', 'sources.jsonl'),
    JSON.stringify({ source_id: sourceId, added_at: '2026-05-06T22:00:01.000Z' }) + '\n',
    'utf8',
  );
}

describe('A-CLAIMS-004 — dead rejection counters removed from ExtractClaimsSummary', () => {
  it('omits the dead fields but keeps the two genuinely-detected categories', async () => {
    await fixturePack(['A substantive key point that is long enough.']);
    const summary = await extract({
      sectionId: '01-landscape',
      packPath,
      extractors: [new HeuristicClaimExtractor()],
    });
    const keys = Object.keys(summary);
    // bad half: the dead keys must not exist on the summary object.
    expect(keys).not.toContain('claimsRejectedScopeMissing');
    expect(keys).not.toContain('claimsRejectedExtractorParaphrase');
    // good half: the real mechanical-detection categories remain present.
    expect(keys).toContain('claimsRejectedExcerptIdMissing');
    expect(keys).toContain('claimsRejectedExcerptIdMalformed');
    expect(summary.claimsRejectedExcerptIdMissing).toBe(0);
    expect(summary.claimsRejectedExcerptIdMalformed).toBe(0);
  });
});
