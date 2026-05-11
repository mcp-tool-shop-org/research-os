/**
 * A-RE-001 regression — gather() must use the batched
 * createSectionSourceIdAppender instead of the deprecated
 * appendSectionSourceId. End-to-end through the actual gather() caller.
 *
 * Coverage:
 *   (1) gather() with N=20 URLs writes all 20 source_ids to sources.jsonl.
 *   (2) Pre-existing sources.jsonl entries are preserved exactly once
 *       (proves the appender reads the file once on construction and uses
 *       an in-memory Set for dedupe — if anyone reverted to a per-call
 *       full-read + per-call write, this content would still be correct,
 *       so we ALSO assert (3) and (4) below).
 *   (3) Appender contract: calling add() N times then flush() once writes
 *       exactly one batched payload (the deprecated path wrote per-call).
 *   (4) Duplicate URLs collapse to a single sources.jsonl entry.
 *   (5) The deprecated appendSectionSourceId symbol is no longer exported
 *       from @mcptoolshop/research-os (proves the old API is dead, not
 *       merely deprecated).
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import { gather } from '../../src/sources/index.js';
import * as sourcesIndex from '../../src/sources/index.js';
import { HeuristicExtractor } from '../../src/sources/extractors/heuristic.js';
import { createSectionSourceIdAppender } from '../../src/sources/cards.js';

const SECTION_ID = '01-landscape';
const N_URLS = 20;

let server: Server;
let baseUrl: string;
let workDir: string;
let packPath: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      `<html><head>
<title>Article ${req.url}</title>
<meta property="og:site_name" content="Pub" />
<meta name="description" content="Article ${req.url} argues X under conditions Y." />
</head><body><article><h1>Article ${req.url}</h1><p>${'A'.repeat(80)}</p><p>${'B'.repeat(80)}</p></article></body></html>`,
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-gather-appender-'));
  const result = await init({
    topic: 'A-RE-001 regression — appender must be batched',
    outDir: workDir,
  });
  packPath = result.packPath;
  await sectionAdd({
    id: SECTION_ID,
    purpose: 'Map the existing tools',
    packPath,
  });
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('gather — A-RE-001 batched-appender integration', () => {
  it(`writes all ${N_URLS} source_ids to sections/${SECTION_ID}/sources.jsonl`, async () => {
    const sourcesJsonl = join(packPath, 'sections', SECTION_ID, 'sources.jsonl');

    const urls = Array.from({ length: N_URLS }, (_, i) => `${baseUrl}/article-${i}`);
    const summary = await gather({
      sectionId: SECTION_ID,
      packPath,
      unsafeAllowAllHosts: true,
      urls,
      extractors: [new HeuristicExtractor()],
    });

    expect(summary.cardsWritten).toBe(N_URLS);
    expect(summary.sourceIds).toHaveLength(N_URLS);

    const jsonlText = await readFile(sourcesJsonl, 'utf8');
    const lines = jsonlText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(N_URLS);
    const idsInFile = new Set(
      lines.map((l) => (JSON.parse(l) as { source_id: string }).source_id),
    );
    expect(idsInFile.size).toBe(N_URLS);
    for (const sid of summary.sourceIds) expect(idsInFile.has(sid)).toBe(true);
  });

  it('preserves pre-existing sources.jsonl entries exactly once', async () => {
    // Pre-seed sources.jsonl. The batched appender reads this seed once on
    // construction, the sentinel enters its in-memory dedupe Set, and the
    // final file = seed + 3 new ids — never duplicated.
    const sourcesJsonl = join(packPath, 'sections', SECTION_ID, 'sources.jsonl');
    const SENTINEL_ID = 'src_seed_sentinel';
    await writeFile(
      sourcesJsonl,
      JSON.stringify({ source_id: SENTINEL_ID, added_at: '2026-01-01T00:00:00.000Z' }) +
        '\n',
      'utf8',
    );

    const urls = Array.from({ length: 3 }, (_, i) => `${baseUrl}/seed-test-${i}`);
    const summary = await gather({
      sectionId: SECTION_ID,
      packPath,
      unsafeAllowAllHosts: true,
      urls,
      extractors: [new HeuristicExtractor()],
    });
    expect(summary.cardsWritten).toBe(3);

    const lines = (await readFile(sourcesJsonl, 'utf8'))
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(4);
    const ids = lines.map((l) => (JSON.parse(l) as { source_id: string }).source_id);
    expect(ids.filter((id) => id === SENTINEL_ID)).toHaveLength(1);
    expect(new Set(ids).size).toBe(4);
  });

  it('batched appender writes one payload per flush, not one per add', async () => {
    // Direct contract proof: 20 add() calls + 1 flush() = a single appended
    // payload of 20 newline-terminated JSON lines. A second flush with no
    // queued items is a no-op (no extra write). This is what gather() now
    // relies on; if anyone re-introduces per-iteration appendFile, the
    // file's line count would still be correct but the underlying contract
    // is what protects O(N) IO.
    const sourcesJsonl = join(packPath, 'sections', SECTION_ID, 'sources.jsonl');
    const beforeBytes = (await readFile(sourcesJsonl, 'utf8').catch(() => '')).length;

    const appender = await createSectionSourceIdAppender(packPath, SECTION_ID);
    for (let i = 0; i < N_URLS; i++) appender.add(`src_test_${i}`);
    // Adding a duplicate must be a no-op for the queue.
    expect(appender.add('src_test_0')).toBe(false);

    // Before flush(), no new bytes should be on disk.
    const midBytes = (await readFile(sourcesJsonl, 'utf8')).length;
    expect(midBytes).toBe(beforeBytes);

    await appender.flush();
    const afterFirstFlush = (await readFile(sourcesJsonl, 'utf8')).length;
    expect(afterFirstFlush).toBeGreaterThan(beforeBytes);

    // Second flush is a no-op — no new bytes.
    await appender.flush();
    const afterSecondFlush = (await readFile(sourcesJsonl, 'utf8')).length;
    expect(afterSecondFlush).toBe(afterFirstFlush);

    const lines = (await readFile(sourcesJsonl, 'utf8'))
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(N_URLS);
    const ids = new Set(
      lines.map((l) => (JSON.parse(l) as { source_id: string }).source_id),
    );
    expect(ids.size).toBe(N_URLS);
  });

  it('dedupes duplicate URLs into a single sources.jsonl line', async () => {
    const urls = [
      `${baseUrl}/article-A`,
      `${baseUrl}/article-A`,
      `${baseUrl}/article-A`,
      `${baseUrl}/article-B`,
    ];
    const summary = await gather({
      sectionId: SECTION_ID,
      packPath,
      unsafeAllowAllHosts: true,
      urls,
      extractors: [new HeuristicExtractor()],
    });
    expect(summary.attempted).toBe(2);
    expect(summary.cardsWritten).toBe(2);

    const sourcesJsonl = join(packPath, 'sections', SECTION_ID, 'sources.jsonl');
    const lines = (await readFile(sourcesJsonl, 'utf8'))
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(2);
    const ids = new Set(lines.map((l) => (JSON.parse(l) as { source_id: string }).source_id));
    expect(ids.size).toBe(2);
  });

  it('does not re-export the deprecated appendSectionSourceId symbol', () => {
    // A-RE-001 deletion proof — the old API is gone from the public surface.
    expect(
      (sourcesIndex as Record<string, unknown>).appendSectionSourceId,
    ).toBeUndefined();
    // The batched appender is the supported replacement and must be exported.
    expect(
      typeof (sourcesIndex as Record<string, unknown>).createSectionSourceIdAppender,
    ).toBe('function');
  });
});
