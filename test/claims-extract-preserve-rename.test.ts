import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { extract } from '../src/claims/index.js';
import { HeuristicClaimExtractor } from '../src/claims/extractors/heuristic.js';

let workDir: string;
let packPath: string;

const sourceId = 'src_abcdef012345';
const sha256 = 'a'.repeat(64);
const PRESERVE_SUFFIX = '.pre-mcp-2026-05-11';

async function fixturePackWithSource(keyPoints: string[]) {
  const result = await init({
    topic: 'How does claim extraction preserve legacy artifacts?',
    outDir: workDir,
  });
  packPath = result.packPath;
  await sectionAdd({
    id: '01-landscape',
    purpose: 'Probe preserve-rename',
    packPath,
  });
  const rawText = `<html><body>${keyPoints.map((kp) => `<p>${kp}</p>`).join('')}</body></html>`;
  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  const card = {
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
  };
  await writeFile(join(cardDir, `${sourceId}.json`), JSON.stringify(card), 'utf8');

  const rawDir = join(packPath, 'evidence', 'raw');
  await mkdir(rawDir, { recursive: true });
  await writeFile(join(rawDir, `${sourceId}.html`), rawText, 'utf8');

  const receipt = {
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
  };
  await appendFile(
    join(packPath, 'evidence', 'fetch-log.jsonl'),
    JSON.stringify(receipt) + '\n',
    'utf8',
  );
  await appendFile(
    join(packPath, 'sections', '01-landscape', 'sources.jsonl'),
    JSON.stringify({ source_id: sourceId, added_at: '2026-05-06T22:00:01.000Z' }) + '\n',
    'utf8',
  );
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-preserve-rename-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

// Note on the fixture: section add scaffolds an empty `claims.jsonl` stub at
// section-creation time. The preserve-rename helper sees that file the FIRST
// time extract() runs and migrates it. Tests below either prime a real
// (non-empty) claims.jsonl before calling extract(), or assert behaviour
// against that stub's lifecycle.

describe('claims.jsonl pre-mcp preservation (v0.8.0)', () => {
  it('renames a populated pre-existing claims.jsonl to claims.jsonl.pre-mcp-2026-05-11', async () => {
    await fixturePackWithSource([
      'First substantive key point that is long enough to ground.',
      'Second substantive key point that is long enough to ground.',
    ]);

    const claimsPath = join(packPath, 'sections', '01-landscape', 'claims.jsonl');
    const preservedPath = claimsPath + PRESERVE_SUFFIX;

    // Replace the empty section-add stub with a non-empty sentinel so we can
    // unambiguously assert the rename moved THIS content (not some empty
    // stub that happened to share the path).
    const sentinelBody =
      JSON.stringify({ legacy_claim: 'from-the-pre-mcp-world' }) + '\n';
    await writeFile(claimsPath, sentinelBody, 'utf8');

    // First extract() under v0.8.0 — sees the populated claims.jsonl, moves
    // it aside to the preservation path, then writes a fresh ledger.
    await extract({
      sectionId: '01-landscape',
      packPath,
      extractors: [new HeuristicClaimExtractor()],
    });
    expect(existsSync(preservedPath)).toBe(true);
    expect(await readFile(preservedPath, 'utf8')).toBe(sentinelBody);

    // claims.jsonl was rewritten by the run — and is NOT the sentinel.
    expect(existsSync(claimsPath)).toBe(true);
    const freshBody = await readFile(claimsPath, 'utf8');
    expect(freshBody).not.toBe(sentinelBody);
    expect(freshBody.trim().length).toBeGreaterThan(0);
  });

  it('does NOT clobber an existing claims.jsonl.pre-mcp-2026-05-11 (second migration is a no-op)', async () => {
    await fixturePackWithSource([
      'First substantive key point that is long enough to ground.',
    ]);

    const claimsPath = join(packPath, 'sections', '01-landscape', 'claims.jsonl');
    const preservedPath = claimsPath + PRESERVE_SUFFIX;

    // Plant a preservation file from a hypothetical earlier migration.
    const sentinelBody =
      JSON.stringify({ sentinel: 'do-not-clobber', when: 'earlier migration' }) + '\n';
    await writeFile(preservedPath, sentinelBody, 'utf8');

    // Plant a populated claims.jsonl that v0.8.0 would normally migrate —
    // but the preserve file is already present, so the helper must leave
    // both files alone and the run must dedupe-append against the existing
    // claims.jsonl.
    const priorClaimsBody =
      JSON.stringify({ legacy_claim: 'still-here', migration_attempted: 2 }) + '\n';
    await writeFile(claimsPath, priorClaimsBody, 'utf8');

    await extract({
      sectionId: '01-landscape',
      packPath,
      extractors: [new HeuristicClaimExtractor()],
    });

    // The preservation file is untouched — second migration must not
    // clobber the prior preservation copy.
    expect(await readFile(preservedPath, 'utf8')).toBe(sentinelBody);
    // claims.jsonl was NOT renamed — the prior content remains (with new
    // claims appended by this run; the sentinel line is still present).
    expect(existsSync(claimsPath)).toBe(true);
    const finalBody = await readFile(claimsPath, 'utf8');
    expect(finalBody.startsWith(priorClaimsBody)).toBe(true);
  });

  it('preserves the empty section-add stub on the very first extract call', async () => {
    // section add writes an empty claims.jsonl stub. Under v0.8.0 the first
    // extract call treats that stub as legacy and renames it — this is the
    // observed real-world behaviour, and the helper is one-shot per pack
    // so it does NOT recur on subsequent runs.
    await fixturePackWithSource([
      'First substantive key point that is long enough to ground.',
    ]);
    const claimsPath = join(packPath, 'sections', '01-landscape', 'claims.jsonl');
    const preservedPath = claimsPath + PRESERVE_SUFFIX;
    // section add left an empty stub.
    expect(existsSync(claimsPath)).toBe(true);
    expect((await readFile(claimsPath, 'utf8')).trim()).toBe('');
    expect(existsSync(preservedPath)).toBe(false);
    await extract({
      sectionId: '01-landscape',
      packPath,
      extractors: [new HeuristicClaimExtractor()],
    });
    // After extract(): preserved file exists (empty), claims.jsonl populated.
    expect(existsSync(preservedPath)).toBe(true);
    expect((await readFile(preservedPath, 'utf8')).trim()).toBe('');
    expect(existsSync(claimsPath)).toBe(true);
    expect((await readFile(claimsPath, 'utf8')).trim().length).toBeGreaterThan(0);
  });
});
