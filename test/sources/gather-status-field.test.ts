/**
 * R-004 (v0.10 Slice 4) — honest gather_outcome status enum on fetch-log.jsonl.
 *
 * Replaces the conflated "Failed (ok HTTP 200)" phrasing observed in
 * operator-aloneness DST gate v0.1 (2026-05-15). The fetched-PDF case
 * previously read as both failed AND ok in the operator's progress feed;
 * the actual state is "fetched but text extraction skipped." This slice
 * surfaces a 5-value rollup status field on each FetchReceipt that the
 * operator can read at a glance:
 *
 *   - ok                     : fetched + text extracted successfully
 *   - fetch_failed           : HTTP error, timeout, network failure, SSRF refusal
 *   - extraction_skipped     : fetched, extraction layer not applicable (PDF, binary)
 *   - extraction_failed      : fetched, extractor errored mid-extraction
 *   - bot_check_detected     : fetched, R-003 marker+body-shape signal fired at gather
 *
 * Precedence (highest to lowest):
 *   fetch_failed > bot_check_detected > extraction_failed > extraction_skipped > ok
 *
 * Bot-check integration choice: HYBRID. Gather-layer runs a light marker+body-words
 * check (Signal A from R-003); audit-layer R-003 stays unchanged and authoritative.
 * Drift risk is bounded — both layers fire on the canonical Incapsula case.
 *
 * All cases go through the real gather() entrypoint per Phase-3 doctrine.
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
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import { gather } from '../../src/sources/index.js';
import { HeuristicExtractor } from '../../src/sources/extractors/heuristic.js';
import { FetchReceiptSchema, type FetchReceipt } from '../../src/sources/schema.js';
import type { Extractor } from '../../src/sources/types.js';

const SECTION_ID = '01-landscape';

let server: Server;
let baseUrl: string;
let workDir: string;
let packPath: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/article') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<html><head>
<title>Article</title>
<meta property="og:site_name" content="Pub" />
<meta name="description" content="An article that argues X under conditions Y." />
</head><body><article><h1>Article</h1><p>${'A'.repeat(80)}</p><p>${'B'.repeat(80)}</p></article></body></html>`,
      );
      return;
    }
    if (req.url === '/pdf') {
      // Binary content type → fetch.ts skips text decoding → rawText=null.
      res.writeHead(200, { 'Content-Type': 'application/pdf' });
      res.end(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]));
      return;
    }
    if (req.url === '/missing') {
      res.writeHead(404);
      res.end();
      return;
    }
    if (req.url === '/incapsula') {
      // APA-class Incapsula JS challenge fragment — small body, bot-check marker,
      // mostly <script>. R-003 Signal A at gather time should fire.
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<html><head><title>Request Rejected</title></head><body><iframe src="/_Incapsula_Resource?..."></iframe><script>(function(){var p="x";})();</script></body></html>`,
      );
      return;
    }
    if (req.url === '/captcha-research') {
      // Legitimate prose research paper about CAPTCHA — long body, marker
      // substring present but body word count exceeds threshold. R-003 false-positive
      // guard at gather time should NOT fire.
      const prose = 'This paper examines CAPTCHA design and accessibility tradeoffs. '.repeat(60);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<html><head><title>CAPTCHA Research</title></head><body><article><h1>CAPTCHA Research</h1><p>${prose}</p></article></body></html>`,
      );
      return;
    }
    res.writeHead(500);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'rk-gather-status-'));
  const result = await init({
    topic: 'gather_outcome status field regression test',
    outDir: workDir,
  });
  packPath = result.packPath;
  await sectionAdd({ id: SECTION_ID, purpose: 'test', packPath });
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function readReceipts(): Promise<FetchReceipt[]> {
  const log = await readFile(join(packPath, 'evidence', 'fetch-log.jsonl'), 'utf8');
  return log
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => FetchReceiptSchema.parse(JSON.parse(line)));
}

describe('gather_outcome status field on FetchReceipt (R-004 Slice 4)', () => {
  it('writes gather_outcome=ok for a healthy HTML fetch + extraction', async () => {
    await gather({
      sectionId: SECTION_ID,
      packPath,
      unsafeAllowAllHosts: true,
      urls: [`${baseUrl}/article`],
      extractors: [new HeuristicExtractor()],
    });
    const [receipt] = await readReceipts();
    expect(receipt.gather_outcome).toBe('ok');
    expect(receipt.fetch_outcome).toBe('ok');
    expect(receipt.extraction_outcome).toBe('ok');
  });

  it('writes gather_outcome=fetch_failed for HTTP 404', async () => {
    await gather({
      sectionId: SECTION_ID,
      packPath,
      unsafeAllowAllHosts: true,
      urls: [`${baseUrl}/missing`],
      extractors: [new HeuristicExtractor()],
    });
    const [receipt] = await readReceipts();
    expect(receipt.gather_outcome).toBe('fetch_failed');
    expect(receipt.fetch_outcome).toBe('http_error');
    expect(receipt.status).toBe(404);
  });

  it('writes gather_outcome=fetch_failed for network failure (DNS refused)', async () => {
    // Force a DNS / connection refusal by pointing at an unrouted port on
    // localhost (no listener). fetchImpl will throw, fetchOnce returns a
    // network_error receipt.
    await gather({
      sectionId: SECTION_ID,
      packPath,
      unsafeAllowAllHosts: true,
      urls: ['http://127.0.0.1:1/refused'],
      extractors: [new HeuristicExtractor()],
    });
    const [receipt] = await readReceipts();
    expect(receipt.gather_outcome).toBe('fetch_failed');
    expect(receipt.fetch_outcome).toBe('network_error');
  });

  it('writes gather_outcome=extraction_skipped for a PDF fetch (HTTP 200, binary content type)', async () => {
    await gather({
      sectionId: SECTION_ID,
      packPath,
      unsafeAllowAllHosts: true,
      urls: [`${baseUrl}/pdf`],
      extractors: [new HeuristicExtractor()],
    });
    const [receipt] = await readReceipts();
    expect(receipt.gather_outcome).toBe('extraction_skipped');
    // The v0.1 footprint: fetch succeeded (HTTP 200) but rawText was null
    // because fetch.ts only decodes text-like content types.
    expect(receipt.fetch_outcome).toBe('ok');
    expect(receipt.status).toBe(200);
    expect(receipt.raw_text_path).toBeNull();
  });

  it('writes gather_outcome=extraction_failed when the extractor errors mid-extraction', async () => {
    const failingExtractor: Extractor = {
      name: 'heuristic' as const,
      async available() {
        return true;
      },
      async extract() {
        return { ok: false as const, error: 'parser threw on malformed HTML' };
      },
    };
    await gather({
      sectionId: SECTION_ID,
      packPath,
      unsafeAllowAllHosts: true,
      urls: [`${baseUrl}/article`],
      extractors: [failingExtractor],
    });
    const [receipt] = await readReceipts();
    expect(receipt.gather_outcome).toBe('extraction_failed');
    expect(receipt.extraction_outcome).toBe('failed');
  });

  it('writes gather_outcome=bot_check_detected for an Incapsula fragment (R-003 Signal A at gather)', async () => {
    await gather({
      sectionId: SECTION_ID,
      packPath,
      unsafeAllowAllHosts: true,
      urls: [`${baseUrl}/incapsula`],
      extractors: [new HeuristicExtractor()],
    });
    const [receipt] = await readReceipts();
    expect(receipt.gather_outcome).toBe('bot_check_detected');
    // Fetch and extraction outcomes are unchanged — the bot-check signal is
    // an additional layer on top of fetch+extract bookkeeping.
    expect(receipt.fetch_outcome).toBe('ok');
  });

  it('does NOT flag a legitimate CAPTCHA-research paper as bot_check_detected (false-positive guard)', async () => {
    await gather({
      sectionId: SECTION_ID,
      packPath,
      unsafeAllowAllHosts: true,
      urls: [`${baseUrl}/captcha-research`],
      extractors: [new HeuristicExtractor()],
    });
    const [receipt] = await readReceipts();
    // Long prose paper containing the word "captcha" — the marker alone
    // is not sufficient. The body-words threshold rejects this.
    expect(receipt.gather_outcome).toBe('ok');
  });

  it('bot_check_detected wins over extraction_failed when both could fire', async () => {
    // Force the extractor to fail mid-extraction on the bot-check body so we
    // can verify precedence: bot_check_detected wins.
    const failingExtractor: Extractor = {
      name: 'heuristic' as const,
      async available() {
        return true;
      },
      async extract() {
        return { ok: false as const, error: 'forced fail to assert precedence' };
      },
    };
    await gather({
      sectionId: SECTION_ID,
      packPath,
      unsafeAllowAllHosts: true,
      urls: [`${baseUrl}/incapsula`],
      extractors: [failingExtractor],
    });
    const [receipt] = await readReceipts();
    expect(receipt.gather_outcome).toBe('bot_check_detected');
  });
});

describe('progress messages reflect gather_outcome honestly (R-004 Slice 4)', () => {
  // emitProgress writes to process.stderr unless RESEARCH_OS_NO_PROGRESS=1
  // or non-TTY. We capture the writes by swapping process.stderr.write.

  function captureStderr(): { lines: string[]; restore: () => void } {
    const lines: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: unknown) => {
      const s = typeof chunk === 'string' ? chunk : (chunk as { toString?: () => string })?.toString?.() ?? '';
      for (const part of s.split(/\n/)) if (part.length > 0) lines.push(part);
      return true;
    }) as unknown as typeof process.stderr.write;
    return {
      lines,
      restore: () => {
        process.stderr.write = orig as unknown as typeof process.stderr.write;
      },
    };
  }

  const originalIsTTY = process.stderr.isTTY;

  beforeEach(() => {
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      writable: true,
      value: true,
    });
    delete process.env.RESEARCH_OS_NO_PROGRESS;
  });

  afterEach(() => {
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      writable: true,
      value: originalIsTTY,
    });
  });

  it('PDF case: progress line contains "extraction_skipped" and does NOT contain "Failed (ok"', async () => {
    const cap = captureStderr();
    try {
      await gather({
        sectionId: SECTION_ID,
        packPath,
        unsafeAllowAllHosts: true,
        urls: [`${baseUrl}/pdf`],
        extractors: [new HeuristicExtractor()],
      });
    } finally {
      cap.restore();
    }
    const joined = cap.lines.join('\n');
    // Honest phrasing: the PDF case must surface as extraction_skipped.
    expect(joined).toContain('extraction_skipped');
    // The v0.1 conflated phrasing MUST be gone.
    expect(joined).not.toContain('Failed (ok');
    // And no plain "Failed" word on the extraction-skipped line — this is
    // not a failure, just an unhandled content type.
    expect(cap.lines.some((l) => l.includes('extraction_skipped') && l.includes('Failed'))).toBe(false);
  });

  it('404 case: progress line contains "fetch_failed" (not the bare word "Failed")', async () => {
    const cap = captureStderr();
    try {
      await gather({
        sectionId: SECTION_ID,
        packPath,
        unsafeAllowAllHosts: true,
        urls: [`${baseUrl}/missing`],
        extractors: [new HeuristicExtractor()],
      });
    } finally {
      cap.restore();
    }
    const joined = cap.lines.join('\n');
    expect(joined).toContain('fetch_failed');
    expect(joined).toContain('/missing');
  });

  it('extraction failure case: progress line contains "extraction_failed"', async () => {
    const failingExtractor: Extractor = {
      name: 'heuristic' as const,
      async available() {
        return true;
      },
      async extract() {
        return { ok: false as const, error: 'forced failure' };
      },
    };
    const cap = captureStderr();
    try {
      await gather({
        sectionId: SECTION_ID,
        packPath,
        unsafeAllowAllHosts: true,
        urls: [`${baseUrl}/article`],
        extractors: [failingExtractor],
      });
    } finally {
      cap.restore();
    }
    const joined = cap.lines.join('\n');
    expect(joined).toContain('extraction_failed');
  });

  it('bot-check case: progress line contains "bot_check_detected"', async () => {
    const cap = captureStderr();
    try {
      await gather({
        sectionId: SECTION_ID,
        packPath,
        unsafeAllowAllHosts: true,
        urls: [`${baseUrl}/incapsula`],
        extractors: [new HeuristicExtractor()],
      });
    } finally {
      cap.restore();
    }
    const joined = cap.lines.join('\n');
    expect(joined).toContain('bot_check_detected');
  });
});
