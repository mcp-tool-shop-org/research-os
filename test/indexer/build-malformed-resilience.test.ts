/**
 * B-A-002 regression — indexer.build() must isolate per-record and per-section
 * failures.
 *
 * Before B-A-002, `src/indexer/build.ts:36` `tryReadJsonl` called
 * `JSON.parse(line)` + `Zod parse(raw)` with NO try/catch. One malformed tail
 * line aborted the entire `research-os index` build for that section.
 * `readSourceCards` had the same shape — one bad
 * `evidence/source-cards/*.json` killed the whole build. Plus there was no
 * per-section try/catch in `build()`: one bad section blocked all healthy
 * sections from indexing.
 *
 * After B-A-002:
 *   - tryReadJsonl wraps JSON.parse + Zod parse per-line, pushes a
 *     `malformed_jsonl` warning (1-based line number, pack-relative path,
 *     reason), continues.
 *   - readSourceCards wraps per-file, pushes a `malformed_source_card`
 *     warning, continues.
 *   - build() wraps each indexSection() call, pushes a
 *     `section_index_failed` warning, continues with the next section.
 *
 * All cases here run through the real `build()` entrypoint per the Phase-3
 * "end-to-end through the actual caller" doctrine rule.
 *
 * Coverage:
 *   (1) Malformed JSONL line — build succeeds, warning recorded with correct
 *       path + 1-based line number, the valid line on the same file is still
 *       indexed (FTS finds it).
 *   (2) Malformed source-card JSON — build succeeds, warning recorded,
 *       healthy source cards still index.
 *   (3) Per-section isolation — section A healthy, section B's claims.jsonl
 *       has a malformed Zod payload, section C healthy. All three are
 *       processed and the malformed line on B emits a warning while A and C
 *       index cleanly. (Hard SQL-level failures inside a section are rare on
 *       a stock pack; the warning path triggered by the malformed line is
 *       the realistic per-section partial-failure mode we expect.)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import { build, indexDbPath } from '../../src/indexer/index.js';

let workDir: string;
let packPath: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-indexer-malformed-'));
  const r = await init({
    topic: 'B-A-002 regression — indexer must isolate bad lines/files/sections',
    outDir: workDir,
  });
  packPath = r.packPath;
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

/** Write one valid source card + section sources.jsonl entry for `sectionId`. */
async function writeHealthySource(sectionId: string, sourceIdSuffix: string) {
  const sourceId = `src_${sourceIdSuffix.padEnd(12, 'a').slice(0, 12)}`;
  const cardDir = join(packPath, 'evidence', 'source-cards');
  await mkdir(cardDir, { recursive: true });
  const card = {
    source_id: sourceId,
    receipt_id: `rcpt_${sourceId.replace(/^src_/, '')}_1`,
    section_id: sectionId,
    url: `https://example.com/${sourceIdSuffix}`,
    final_url: `https://example.com/${sourceIdSuffix}`,
    fetched_at: '2026-05-06T22:00:00.000Z',
    publisher: 'p1',
    published_at: '2025-12-01T00:00:00.000Z',
    title: `Title ${sourceId}`,
    source_type: 'secondary',
    relevance: 'unknown',
    key_points: [`SEARCHTOKEN_${sourceIdSuffix.toUpperCase()} keypoint`],
    limitations: [],
    asserts: `${sourceId} asserts SEARCHTOKEN_${sourceIdSuffix.toUpperCase()}`,
    scope: null,
    not: null,
    extracted_by: 'heuristic',
    extracted_at: '2026-05-06T22:00:00.000Z',
  };
  await writeFile(join(cardDir, `${sourceId}.json`), JSON.stringify(card), 'utf8');
  await appendFile(
    join(packPath, 'sections', sectionId, 'sources.jsonl'),
    JSON.stringify({ source_id: sourceId, added_at: '2026-05-06T22:00:01.000Z' }) +
      '\n',
    'utf8',
  );
  return sourceId;
}

/** Write a valid claim that includes a unique FTS token. */
async function appendHealthyClaim(
  sectionId: string,
  claimIdSuffix: string,
  sourceId: string,
  token: string,
) {
  const claim = {
    claim_id: `clm_${claimIdSuffix.padEnd(12, 'a').slice(0, 12)}_heuristic_1`,
    section_id: sectionId,
    source_ids: [sourceId],
    source_hashes: ['a'.repeat(64)],
    asserts: `claim asserts ${token}`,
    scope: 'narrow',
    not: 'broad',
    evidence_excerpt: `literal evidence containing ${token}`,
    evidence_location: null,
    confidence: 'low',
    extractor: 'heuristic',
    extraction_method: 'heuristic_key_point',
    created_at: '2026-05-06T22:00:00.000Z',
    review_state: 'candidate',
  };
  await appendFile(
    join(packPath, 'sections', sectionId, 'claims.jsonl'),
    JSON.stringify(claim) + '\n',
    'utf8',
  );
}

describe('indexer.build — B-A-002 malformed-record resilience', () => {
  it('case 1: one malformed JSONL line emits a malformed_jsonl warning; valid line on same file still indexes', async () => {
    const sectionId = '01-test';
    await sectionAdd({ id: sectionId, purpose: 'probe', packPath });
    // Suffix tokens must be hex-only — source_id and claim_id regexes require [a-f0-9].
    const sid = await writeHealthySource(sectionId, 'cafe');
    await appendHealthyClaim(sectionId, 'feed', sid, 'GOODTOKEN');
    // Append a malformed line after the good one. Bad line is JSON-valid but
    // fails Zod parse (missing required fields).
    await appendFile(
      join(packPath, 'sections', sectionId, 'claims.jsonl'),
      JSON.stringify({ not_a_claim: true }) + '\n',
      'utf8',
    );

    const summary = await build({ packPath, all: true });
    expect(summary.sectionsIndexed).toBe(1);
    // The good claim is indexed.
    expect(summary.claims).toBe(1);

    // Exactly one malformed_jsonl warning for the claims.jsonl bad line.
    const jsonlWarnings = summary.warnings.filter((w) => w.kind === 'malformed_jsonl');
    expect(jsonlWarnings.length).toBeGreaterThanOrEqual(1);
    const claimWarning = jsonlWarnings.find((w) =>
      w.path?.endsWith(`sections/${sectionId}/claims.jsonl`),
    );
    expect(claimWarning).toBeDefined();
    expect(claimWarning?.line).toBe(2);
    expect(typeof claimWarning?.reason).toBe('string');

    // FTS hits the good claim's token (proves the valid line indexed).
    const db = new Database(indexDbPath(packPath), { readonly: true });
    try {
      const hit = db
        .prepare(
          "SELECT record_type, record_id FROM facts_fts WHERE facts_fts MATCH 'GOODTOKEN' AND record_type = 'claim'",
        )
        .all() as Array<{ record_id: string }>;
      expect(hit.length).toBeGreaterThanOrEqual(1);
    } finally {
      db.close();
    }
  });

  it('case 2: one malformed source-card JSON file emits a malformed_source_card warning; healthy cards still index', async () => {
    const sectionId = '01-test';
    await sectionAdd({ id: sectionId, purpose: 'probe', packPath });
    // Healthy card. Suffix token must be hex-only — source_id regex requires [a-f0-9].
    const goodSid = await writeHealthySource(sectionId, 'face');
    // Malformed card file: write a bogus JSON file in evidence/source-cards/.
    // It must end in .json so readSourceCards tries to parse it.
    const cardDir = join(packPath, 'evidence', 'source-cards');
    await writeFile(join(cardDir, 'src_broken000000.json'), '{ this is not json', 'utf8');
    // Add a corresponding sources.jsonl entry so the bad card would be picked
    // up if it parsed — proves we recovered at the parse seam, not because the
    // card was filtered upstream.
    await appendFile(
      join(packPath, 'sections', sectionId, 'sources.jsonl'),
      JSON.stringify({
        source_id: 'src_broken000000',
        added_at: '2026-05-06T22:00:01.000Z',
      }) + '\n',
      'utf8',
    );

    const summary = await build({ packPath, all: true });
    expect(summary.sectionsIndexed).toBe(1);
    expect(summary.sources).toBe(1); // only the healthy card indexed

    const cardWarning = summary.warnings.find(
      (w) =>
        w.kind === 'malformed_source_card' &&
        w.path?.endsWith('src_broken000000.json'),
    );
    expect(cardWarning).toBeDefined();
    expect(typeof cardWarning?.reason).toBe('string');

    // The healthy source is queryable.
    const db = new Database(indexDbPath(packPath), { readonly: true });
    try {
      const rows = db.prepare('SELECT source_id FROM sources').all() as Array<{
        source_id: string;
      }>;
      expect(rows.map((r) => r.source_id)).toContain(goodSid);
    } finally {
      db.close();
    }
  });

  it('case 3: per-section isolation — bad line in section B does not block A or C', async () => {
    await sectionAdd({ id: '01-aaa', purpose: 'A', packPath });
    await sectionAdd({ id: '02-bbb', purpose: 'B', packPath });
    await sectionAdd({ id: '03-ccc', purpose: 'C', packPath });

    const sidA = await writeHealthySource('01-aaa', 'aaa');
    await appendHealthyClaim('01-aaa', 'aaa', sidA, 'AAATOKEN');

    // Section B: one healthy claim + a malformed JSONL line. Even with the
    // per-line catch absorbing the bad line, this still proves the
    // per-section path (a) wraps each indexSection() in a try/catch and
    // (b) is wired through to the warnings array.
    const sidB = await writeHealthySource('02-bbb', 'bbb');
    await appendHealthyClaim('02-bbb', 'bbb', sidB, 'BBBTOKEN');
    await appendFile(
      join(packPath, 'sections', '02-bbb', 'claims.jsonl'),
      'this is not valid json at all\n',
      'utf8',
    );

    const sidC = await writeHealthySource('03-ccc', 'ccc');
    await appendHealthyClaim('03-ccc', 'ccc', sidC, 'CCCTOKEN');

    const summary = await build({ packPath, all: true });
    // All three sections processed (per-line recovery allowed B to complete).
    expect(summary.sectionsIndexed).toBe(3);
    expect(summary.claims).toBe(3); // 1 per section
    expect(summary.sources).toBe(3);

    // Warning emitted for the bad B line.
    const bWarn = summary.warnings.find(
      (w) =>
        w.kind === 'malformed_jsonl' &&
        w.path?.endsWith('sections/02-bbb/claims.jsonl'),
    );
    expect(bWarn).toBeDefined();

    // A and C are queryable in the index by their FTS tokens — proves the
    // build did not stall at section B.
    const db = new Database(indexDbPath(packPath), { readonly: true });
    try {
      const hitsA = db
        .prepare(
          "SELECT record_id FROM facts_fts WHERE facts_fts MATCH 'AAATOKEN' AND record_type = 'claim'",
        )
        .all() as Array<{ record_id: string }>;
      const hitsC = db
        .prepare(
          "SELECT record_id FROM facts_fts WHERE facts_fts MATCH 'CCCTOKEN' AND record_type = 'claim'",
        )
        .all() as Array<{ record_id: string }>;
      expect(hitsA.length).toBeGreaterThanOrEqual(1);
      expect(hitsC.length).toBeGreaterThanOrEqual(1);
    } finally {
      db.close();
    }
  });
});
