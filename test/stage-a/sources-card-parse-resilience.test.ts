/**
 * A-SOURCES-005 regression — per-card parse must not abort the whole audit /
 * rebuild with a raw Zod / JSON stack.
 *
 * runSourceCardAudit and rebuildSourceCards previously did
 * SourceCardSchema.parse(JSON.parse(raw)) per file with NO try/catch, so a
 * single malformed or schema-invalid card threw an uncaught ZodError / SyntaxError
 * that aborted the entire run with a raw stack — violating the codebase's
 * structured-error discipline.
 *
 * Both halves:
 *   - BAD: a pack containing one bad card surfaces a ResearchOSError
 *     (code PACK_PARSE_ERROR) whose message names the offending file — NOT a
 *     bare ZodError / SyntaxError.
 *   - GOOD: a pack of only-valid cards audits / rebuilds without throwing.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ZodError } from 'zod';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import { ResearchOSError } from '../../src/errors.js';
import { runSourceCardAudit } from '../../src/sources/source-card-audit.js';
import { rebuildSourceCards } from '../../src/sources/rebuild-ledger.js';

let workDir: string;
let packPath: string;
let cardsDir: string;

function validCard(suffix: string) {
  const sid = `src_${suffix.padEnd(12, '0').slice(0, 12)}`;
  return {
    source_id: sid,
    receipt_id: `rcpt_${suffix.padEnd(12, '0').slice(0, 12)}_1700000000000`,
    section_id: '01-landscape',
    url: 'https://example.com/valid',
    final_url: 'https://example.com/valid',
    fetched_at: '2026-01-01T00:00:00.000Z',
    publisher: 'Example Org',
    published_at: null,
    title: 'A valid source card',
    source_type: 'docs',
    relevance: 'high',
    key_points: ['point one'],
    limitations: [],
    asserts: 'This source asserts something testable.',
    scope: null,
    not: null,
    extracted_by: 'heuristic',
    extracted_at: '2026-01-01T00:00:00.000Z',
  };
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-card-parse-'));
  const r = await init({ topic: 'A-SOURCES-005 card-parse resilience', outDir: workDir });
  packPath = r.packPath;
  await sectionAdd({ id: '01-landscape', purpose: 'landscape', packPath });
  cardsDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardsDir, { recursive: true });
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('A-SOURCES-005 — audit tolerates a malformed card via structured error', () => {
  it('BAD: a syntactically-broken card yields ResearchOSError naming the file (not raw Zod/JSON)', async () => {
    await writeFile(join(cardsDir, 'aaaaaaaaaaaa.json'), JSON.stringify(validCard('aaaaaaaaaaaa')), 'utf8');
    await writeFile(join(cardsDir, 'broken.json'), '{ this is not valid json ', 'utf8');

    const err = await runSourceCardAudit(packPath).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(ResearchOSError);
    expect(err).not.toBeInstanceOf(ZodError);
    expect((err as ResearchOSError).code).toBe('PACK_PARSE_ERROR');
    expect((err as ResearchOSError).message).toMatch(/broken\.json/);
  });

  it('BAD: a schema-invalid card (wrong source_type) yields PACK_PARSE_ERROR naming the file', async () => {
    const bad = { ...validCard('bbbbbbbbbbbb'), source_type: 'not-a-real-type' };
    await writeFile(join(cardsDir, 'badschema.json'), JSON.stringify(bad), 'utf8');

    const err = await runSourceCardAudit(packPath).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(ResearchOSError);
    expect((err as ResearchOSError).code).toBe('PACK_PARSE_ERROR');
    expect((err as ResearchOSError).message).toMatch(/badschema\.json/);
  });

  it('GOOD: a pack of only-valid cards audits without throwing', async () => {
    await writeFile(join(cardsDir, 'cccccccccccc.json'), JSON.stringify(validCard('cccccccccccc')), 'utf8');
    const result = await runSourceCardAudit(packPath);
    expect(result.report.totals.cards_scanned).toBe(1);
  });
});

describe('A-SOURCES-005 — rebuild tolerates a malformed card via structured error', () => {
  it('BAD: a malformed card yields ResearchOSError (PACK_PARSE_ERROR) naming the file', async () => {
    await writeFile(join(cardsDir, 'dddddddddddd.json'), JSON.stringify(validCard('dddddddddddd')), 'utf8');
    await writeFile(join(cardsDir, 'corrupt.json'), 'not json at all', 'utf8');

    const err = await rebuildSourceCards({ packPath }).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(ResearchOSError);
    expect(err).not.toBeInstanceOf(ZodError);
    expect((err as ResearchOSError).code).toBe('PACK_PARSE_ERROR');
    expect((err as ResearchOSError).message).toMatch(/corrupt\.json/);
  });

  it('GOOD: a pack of only-valid cards rebuilds without throwing', async () => {
    await writeFile(join(cardsDir, 'eeeeeeeeeeee.json'), JSON.stringify(validCard('eeeeeeeeeeee')), 'utf8');
    const result = await rebuildSourceCards({ packPath });
    // No receipts on disk → the single card is skipped, but the run completes.
    expect(result.rebuilt).toBe(1);
    expect(result.skipped).toBe(1);
  });
});
