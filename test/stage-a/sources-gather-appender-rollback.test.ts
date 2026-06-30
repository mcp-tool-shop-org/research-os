/**
 * A-SOURCES-002 regression — appender enqueue must follow appendFetchLog.
 *
 * The success path used to call sourceIdAppender.add() + summary.sourceIds.push()
 * BEFORE appendFetchLog. If appendFetchLog threw, the catch popped
 * summary.sourceIds but the appender's already-queued id still flushed to
 * sources.jsonl on the catch's durability flush — producing a card referenced
 * by sources.jsonl whose ONLY receipt says the fetch failed (a phantom source).
 *
 * Invariant (both halves):
 *   - BAD: a URL whose appendFetchLog throws after a successful extraction must
 *     NOT leave its source_id in sources.jsonl. Only a synthetic FAILURE receipt
 *     is recorded for it; the card is never advertised as a real source.
 *   - GOOD: URLs whose appendFetchLog succeeds DO land in sources.jsonl, and
 *     their source_id matches a non-failed receipt.
 *
 * We mock appendFetchLog to throw for the 2nd successful URL only; URLs #1 and
 * #3 append normally. The throw lands in gather()'s per-iteration catch (the
 * same seam B-A-001 covers), but the failure now originates AFTER add() would
 * historically have queued the id — exactly the window this finding closes.
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// Throw inside appendFetchLog for the success-path receipt of any URL whose
// requested_url ends in '-boom'.
const boomedOnce = new Set<string>();
vi.mock('../../src/sources/cards.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/sources/cards.js')>(
    '../../src/sources/cards.js',
  );
  return {
    ...actual,
    appendFetchLog: vi.fn(async (packPath: string, receipt: { requested_url: string; fetch_outcome: string }) => {
      // Throw only on the FIRST (success-path) receipt for a '-boom' URL.
      // The catch's synthetic FAILURE receipt for the same URL is allowed
      // through so the failed fetch still gets a durable record.
      if (
        receipt.requested_url.endsWith('-boom') &&
        receipt.fetch_outcome === 'ok' &&
        !boomedOnce.has(receipt.requested_url)
      ) {
        boomedOnce.add(receipt.requested_url);
        throw new Error('A-SOURCES-002 synthetic appendFetchLog failure');
      }
      return actual.appendFetchLog(packPath, receipt as never);
    }),
  };
});

const { gather } = await import('../../src/sources/index.js');
const { HeuristicExtractor } = await import('../../src/sources/extractors/heuristic.js');

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
  const { init } = await import('../../src/intake/index.js');
  const { add: sectionAdd } = await import('../../src/sections/index.js');
  workDir = await mkdtemp(join(tmpdir(), 'research-os-appender-rollback-'));
  const result = await init({
    topic: 'A-SOURCES-002 regression — appender enqueue after receipt',
    outDir: workDir,
  });
  packPath = result.packPath;
  await sectionAdd({ id: SECTION_ID, purpose: 'Map the existing tools', packPath });
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('gather — A-SOURCES-002 appender enqueue follows appendFetchLog', () => {
  it('does NOT advertise a source whose appendFetchLog throws', async () => {
    const ok1 = `${baseUrl}/alpha`;
    const boom = `${baseUrl}/beta-boom`; // appendFetchLog throws for this one
    const ok2 = `${baseUrl}/gamma`;

    const summary = await gather({
      sectionId: SECTION_ID,
      packPath,
      unsafeAllowAllHosts: true,
      urls: [ok1, boom, ok2],
      extractors: [new HeuristicExtractor()],
    });

    // The boom URL extracted fine but its receipt append threw → recovery path.
    expect(summary.attempted).toBe(3);
    expect(summary.sourceIds).toHaveLength(2);

    const jsonlPath = join(packPath, 'sections', SECTION_ID, 'sources.jsonl');
    const ids = new Set(
      (await readFile(jsonlPath, 'utf8'))
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0)
        .map((l) => (JSON.parse(l) as { source_id: string }).source_id),
    );
    // BAD half: exactly two ids; the boom card is NOT referenced by sources.jsonl.
    expect(ids.size).toBe(2);
    for (const sid of summary.sourceIds) expect(ids.has(sid)).toBe(true);

    // GOOD half: the two advertised ids each correspond to a non-failed receipt;
    // the boom URL's only receipt is a synthetic failure.
    const log = (await readFile(join(packPath, 'evidence', 'fetch-log.jsonl'), 'utf8'))
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { source_id: string; requested_url: string; fetch_outcome: string; fetch_error: string | null });

    const boomReceipts = log.filter((r) => r.requested_url === boom);
    expect(boomReceipts.length).toBeGreaterThanOrEqual(1);
    // Every receipt the boom URL has on disk is a failure receipt.
    for (const r of boomReceipts) {
      expect(r.fetch_outcome).toBe('network_error');
      expect(r.fetch_error ?? '').toMatch(/gather write failed/);
    }
    // No advertised source_id belongs to the boom URL's source.
    for (const r of boomReceipts) expect(ids.has(r.source_id)).toBe(false);
  });
});
