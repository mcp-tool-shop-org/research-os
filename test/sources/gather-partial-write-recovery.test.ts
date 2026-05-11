/**
 * B-A-001 regression — gather() partial-write recovery.
 *
 * Stage A's A-008 batched-flush optimization (createSectionSourceIdAppender)
 * moved the appender seam from per-iteration durable to end-of-loop durable.
 * fetchOnce + writeSourceCard + appendFetchLog can throw between mkdir/writeFile
 * of evidence/raw/<sid>.<ext> for disk-full / EACCES / EROFS / antivirus
 * quarantine reasons. Before B-A-001, an uncaught throw:
 *   (a) skipped appendFetchLog — fetch receipt permanently lost,
 *   (b) aborted the loop for remaining URLs,
 *   (c) dropped already-queued source_ids because the deferred end-of-loop
 *       sourceIdAppender.flush() never ran.
 * After B-A-001, gather() wraps each iteration in try/catch; on exception it
 * (1) flushes the appender to make prior successful URLs durable, (2) writes a
 * synthetic failure receipt, and (3) continues with the next URL.
 *
 * Coverage:
 *   (1) Happy path — all 5 URLs succeed; baseline behavior unchanged.
 *   (2) Mid-loop write exception — URL #3 throws after fetch returns OK
 *       (we monkey-patch the heuristic extractor's extract() to throw on the
 *       third call to simulate any post-fetch I/O failure path). URLs #1, #2
 *       are durable in sources.jsonl, URL #3's failure receipt is recorded,
 *       URLs #4, #5 continue and land in sources.jsonl.
 *   (3) Exception on every URL — extractor.extract() throws every time. No
 *       source_ids in sources.jsonl, all 5 failure receipts recorded, the
 *       function returns without crashing.
 *
 * All cases go through the real gather() entrypoint per the Phase-3 doctrine
 * "end-to-end through the actual caller" rule.
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
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import { gather } from '../../src/sources/index.js';
import { HeuristicExtractor } from '../../src/sources/extractors/heuristic.js';
import type {
  Extractor,
  ExtractionInput,
  ExtractionResult,
} from '../../src/sources/types.js';

const SECTION_ID = '01-landscape';

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
  workDir = await mkdtemp(join(tmpdir(), 'research-os-gather-recovery-'));
  const result = await init({
    topic: 'B-A-001 regression — gather partial-write recovery',
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

/**
 * Build a wrapper extractor that delegates to HeuristicExtractor for every
 * call EXCEPT the ones whose 1-based index is in `failOn` — those throw.
 * Throwing inside extract() exercises the same gather() catch as a
 * writeSourceCard / appendFetchLog throw would (the seam is one
 * try-block-wide; any throw inside the iteration triggers the recovery
 * path).
 */
function makeFlakyExtractor(failOn: ReadonlySet<number>): Extractor {
  const real = new HeuristicExtractor();
  let calls = 0;
  return {
    name: 'heuristic',
    async available() {
      return true;
    },
    async extract(input: ExtractionInput): Promise<ExtractionResult> {
      calls += 1;
      if (failOn.has(calls)) {
        throw new Error(`B-A-001 synthetic write failure on call #${calls}`);
      }
      return real.extract(input);
    },
  };
}

describe('gather — B-A-001 partial-write recovery', () => {
  it('happy path: all 5 URLs succeed; sources.jsonl + receipts complete', async () => {
    const urls = Array.from({ length: 5 }, (_, i) => `${baseUrl}/happy-${i}`);
    const summary = await gather({
      sectionId: SECTION_ID,
      packPath,
      unsafeAllowAllHosts: true,
      urls,
      extractors: [new HeuristicExtractor()],
    });

    expect(summary.attempted).toBe(5);
    expect(summary.fetchedOk).toBe(5);
    expect(summary.fetchedFailed).toBe(0);
    expect(summary.cardsWritten).toBe(5);
    expect(summary.sourceIds).toHaveLength(5);
    expect(summary.receiptsAppended).toBe(5);

    const jsonlPath = join(packPath, 'sections', SECTION_ID, 'sources.jsonl');
    const lines = (await readFile(jsonlPath, 'utf8'))
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(5);
    const ids = new Set(
      lines.map((l) => (JSON.parse(l) as { source_id: string }).source_id),
    );
    for (const sid of summary.sourceIds) expect(ids.has(sid)).toBe(true);

    const log = (await readFile(
      join(packPath, 'evidence', 'fetch-log.jsonl'),
      'utf8',
    ))
      .trim()
      .split('\n')
      .filter(Boolean);
    expect(log).toHaveLength(5);
  });

  it('mid-loop exception: prior URLs durable, failure receipt recorded, loop continues', async () => {
    const urls = Array.from({ length: 5 }, (_, i) => `${baseUrl}/midfail-${i}`);
    // Fail on the 3rd extract() call. URLs #1, #2 succeed; #3 throws; #4, #5
    // succeed. The per-exception flush in gather() must make #1, #2 durable
    // before the next iteration begins.
    const flaky = makeFlakyExtractor(new Set([3]));

    const summary = await gather({
      sectionId: SECTION_ID,
      packPath,
      unsafeAllowAllHosts: true,
      urls,
      extractors: [flaky],
    });

    // 5 URLs attempted, 5 fetched OK (network layer never failed), but
    // extraction threw on #3 — that maps to fetchedFailed in the recovery
    // path (the synthetic receipt has fetch_outcome='network_error').
    expect(summary.attempted).toBe(5);
    // #1, #2, #4, #5 went down the success path (fetchedOk + cardsWritten).
    expect(summary.fetchedOk).toBe(4);
    expect(summary.fetchedFailed).toBe(1);
    expect(summary.cardsWritten).toBe(4);
    expect(summary.sourceIds).toHaveLength(4);

    // sources.jsonl has exactly 4 source_ids — proves the per-exception flush
    // made #1, #2 durable before the throw and #4, #5 landed after.
    const jsonlPath = join(packPath, 'sections', SECTION_ID, 'sources.jsonl');
    const lines = (await readFile(jsonlPath, 'utf8'))
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(4);
    const idsInFile = new Set(
      lines.map((l) => (JSON.parse(l) as { source_id: string }).source_id),
    );
    for (const sid of summary.sourceIds) expect(idsInFile.has(sid)).toBe(true);

    // fetch-log.jsonl has 5 receipts — one synthetic failure receipt for #3
    // with fetch_outcome='network_error' and fetch_error prefixed
    // 'gather write failed:'.
    const log = (await readFile(
      join(packPath, 'evidence', 'fetch-log.jsonl'),
      'utf8',
    ))
      .trim()
      .split('\n')
      .filter(Boolean);
    expect(log).toHaveLength(5);
    const receipts = log.map(
      (l) =>
        JSON.parse(l) as {
          fetch_outcome: string;
          fetch_error: string | null;
          requested_url: string;
        },
    );
    const failed = receipts.filter(
      (r) =>
        r.fetch_error !== null &&
        r.fetch_error.startsWith('gather write failed:'),
    );
    expect(failed).toHaveLength(1);
    expect(failed[0].fetch_outcome).toBe('network_error');
    expect(failed[0].requested_url).toBe(urls[2]);
  });

  it('exception on every URL: no source_ids, all 5 failure receipts, no crash', async () => {
    const urls = Array.from({ length: 5 }, (_, i) => `${baseUrl}/allfail-${i}`);
    const flaky = makeFlakyExtractor(new Set([1, 2, 3, 4, 5]));

    const summary = await gather({
      sectionId: SECTION_ID,
      packPath,
      unsafeAllowAllHosts: true,
      urls,
      extractors: [flaky],
    });

    expect(summary.attempted).toBe(5);
    expect(summary.fetchedOk).toBe(0);
    expect(summary.fetchedFailed).toBe(5);
    expect(summary.cardsWritten).toBe(0);
    expect(summary.sourceIds).toHaveLength(0);

    // sources.jsonl exists (init created the directory + empty file via the
    // batched appender's setup) but has no real entries.
    const jsonlPath = join(packPath, 'sections', SECTION_ID, 'sources.jsonl');
    if (existsSync(jsonlPath)) {
      const lines = (await readFile(jsonlPath, 'utf8'))
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0);
      expect(lines).toHaveLength(0);
    }

    // fetch-log.jsonl has 5 synthetic failure receipts.
    const log = (await readFile(
      join(packPath, 'evidence', 'fetch-log.jsonl'),
      'utf8',
    ))
      .trim()
      .split('\n')
      .filter(Boolean);
    expect(log).toHaveLength(5);
    const receipts = log.map(
      (l) =>
        JSON.parse(l) as {
          fetch_outcome: string;
          fetch_error: string | null;
        },
    );
    for (const r of receipts) {
      expect(r.fetch_outcome).toBe('network_error');
      expect(r.fetch_error?.startsWith('gather write failed:')).toBe(true);
    }
  });
});
