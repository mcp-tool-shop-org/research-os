// End-to-end-through-actual-caller stderr emission tests. We run real
// gather() / pack publish() / OllamaInternReviewer.review() and capture
// process.stderr to assert progress lines hit stderr (and NOT stdout) on
// the live entrypoints — per doctrine #4, regression tests run through the
// caller, not the helper directly.
//
// Spy is on process.stderr.write rather than a child_process boundary
// because the helper writes to process.stderr directly and the call sites
// import from the same module — wrapping the global write captures it
// cleanly across the import boundary.

import { afterEach, beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { gather } from '../src/sources/index.js';
import { HeuristicExtractor } from '../src/sources/extractors/heuristic.js';
import { OllamaInternReviewer } from '../src/review/reviewers/ollama-intern.js';
import type { Claim } from '../src/claims/schema.js';
import type { Section } from '../src/intake/schema.js';

const originalIsTTY = process.stderr.isTTY;

function setIsTTY(v: boolean): void {
  Object.defineProperty(process.stderr, 'isTTY', {
    configurable: true,
    writable: true,
    value: v,
  });
}

interface Capture {
  lines: string[];
  stdoutCalls: unknown[];
  restore: () => void;
}

// Direct method-replacement rather than vi.spyOn. Vitest's worker captures
// process.stderr at startup; depending on the harness mode the spy may not
// see the write at all. We swap the method on the WriteStream and record
// calls by hand — this works regardless of vitest's stderr-capture mode.
function captureStderr(): Capture {
  const lines: string[] = [];
  const stdoutCalls: unknown[] = [];
  const origStderr = process.stderr.write.bind(process.stderr);
  const origStdout = process.stdout.write.bind(process.stdout);
  process.stderr.write = ((chunk: unknown) => {
    const s = typeof chunk === 'string' ? chunk : (chunk as { toString?: () => string })?.toString?.() ?? '';
    for (const part of s.split(/\n/)) {
      if (part.length > 0) lines.push(part);
    }
    return true;
  }) as unknown as typeof process.stderr.write;
  process.stdout.write = ((chunk: unknown) => {
    stdoutCalls.push(chunk);
    return true;
  }) as unknown as typeof process.stdout.write;
  return {
    lines,
    stdoutCalls,
    restore: () => {
      process.stderr.write = origStderr as unknown as typeof process.stderr.write;
      process.stdout.write = origStdout as unknown as typeof process.stdout.write;
    },
  };
}

beforeEach(() => {
  delete process.env.RESEARCH_OS_NO_PROGRESS;
  delete process.env.RESEARCH_OS_FORCE_PROGRESS;
  setIsTTY(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(process.stderr, 'isTTY', {
    configurable: true,
    writable: true,
    value: originalIsTTY,
  });
  delete process.env.RESEARCH_OS_NO_PROGRESS;
  delete process.env.RESEARCH_OS_FORCE_PROGRESS;
});

// -------------------------------------------------------------------------
// gather (C2-005 / C2-006): real fetch loop, real synthetic-failure path.
// -------------------------------------------------------------------------
describe('gather() progress emission (C2-005 / C2-006)', () => {
  let server: Server;
  let baseUrl: string;
  let workDir: string;
  let packPath: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/ok') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          `<html><head><title>OK Article</title></head><body><article><h1>Title</h1><p>${'A'.repeat(80)}</p></article></body></html>`,
        );
        return;
      }
      if (req.url === '/missing') {
        res.writeHead(404);
        res.end();
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
    workDir = await mkdtemp(join(tmpdir(), 'rk-progress-gather-'));
    const result = await init({
      topic: 'Progress emission regression test',
      outDir: workDir,
    });
    packPath = result.packPath;
    await sectionAdd({ id: '01-landscape', purpose: 'test', packPath });
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('emits per-URL "Gathering N/M ..." lines on stderr and nothing on stdout', async () => {
    const cap = captureStderr();
    await gather({
      sectionId: '01-landscape',
      packPath,
      unsafeAllowAllHosts: true,
      urls: [`${baseUrl}/ok`, `${baseUrl}/missing`],
      extractors: [new HeuristicExtractor()],
    });

    // Both URLs appear in order with N/M progress.
    expect(cap.lines.some((l) => l.startsWith('Gathering 1/2 ') && l.includes('/ok'))).toBe(true);
    expect(cap.lines.some((l) => l.startsWith('Gathering 2/2 ') && l.includes('/missing'))).toBe(true);

    // 404 surfaces inline on stderr with the URL named (C2-005 failure branch).
    expect(
      cap.lines.some(
        (l) => l.includes('! Failed') && l.includes('/missing') && l.includes('receipt recorded'),
      ),
    ).toBe(true);

    // Progress did NOT leak into stdout.
    expect(cap.stdoutCalls).toEqual([]);
    cap.restore();
  });

  it('emits NO progress when RESEARCH_OS_NO_PROGRESS=1 (TTY override)', async () => {
    process.env.RESEARCH_OS_NO_PROGRESS = '1';
    const cap = captureStderr();
    await gather({
      sectionId: '01-landscape',
      packPath,
      unsafeAllowAllHosts: true,
      urls: [`${baseUrl}/ok`],
      extractors: [new HeuristicExtractor()],
    });
    // No "Gathering N/M ..." lines reached stderr.
    expect(cap.lines.filter((l) => l.startsWith('Gathering '))).toHaveLength(0);
    cap.restore();
  });
});

// -------------------------------------------------------------------------
// review (C2-001 / C2-003): exercise the live OllamaInternReviewer.review()
// with a stub fetch so we hit the real window loop without Ollama.
// -------------------------------------------------------------------------
describe('OllamaInternReviewer.review() progress emission (C2-001 / C2-003)', () => {
  // Shape-conformant Claim stubs. We do not parse through ClaimSchema (skip
  // the strict claim_id regex) because the reviewer's window loop only does
  // a validIds-Set lookup on claim_id and a string-join on the other fields.
  function makeClaim(seqNum: number): Claim {
    const hexId = seqNum.toString(16).padStart(12, '0');
    return {
      claim_id: `clm_${hexId}_heuristic_0`,
      section_id: '01-test',
      source_ids: ['src_000000000abc'],
      source_hashes: [],
      asserts: `Asserts ${seqNum}`,
      scope: null,
      not: null,
      evidence_excerpt_ids: [],
      evidence_excerpt: 'evidence',
      evidence_location: null,
      confidence: 'medium',
      extractor: 'heuristic',
      extraction_method: 'test',
      created_at: new Date().toISOString(),
      review_state: 'candidate',
    } as Claim;
  }

  const stubSection: Section = {
    id: '01-test',
    purpose: 'test section',
    status: 'gated',
    min_sources: 0,
    primary_sources_required: 0,
    contradictions_required: false,
    max_time_minutes: 60,
  } as Section;

  const stubInput = (claims: Claim[]) => ({
    research: {
      sections: [stubSection],
      primary_source_waiver: { section_waivers: [] },
    } as never,
    section: stubSection,
    candidateClaims: claims,
    sources: [],
    receipts: [],
    contradictions: [],
    resolutions: [],
    excerptsBySourceId: new Map(),
    gateResult: null,
    rawTextBySourceId: new Map(),
    briefText: null,
  });

  // Fake fetch that returns an empty-findings JSON body for every /api/chat
  // call. We don't need a real model — only the live window loop driving
  // emitProgress is under test.
  const fakeOk = async (url: string | URL): Promise<Response> => {
    const u = url.toString();
    if (u.endsWith('/api/tags')) {
      return new Response(JSON.stringify({ models: [{ name: 'hermes3:8b' }] }), {
        status: 200,
      });
    }
    return new Response(
      JSON.stringify({ message: { content: JSON.stringify({ findings: [] }) } }),
      { status: 200 },
    );
  };

  it('emits an upfront banner and per-window line (single window)', async () => {
    const reviewer = new OllamaInternReviewer({
      fetchImpl: fakeOk as unknown as typeof fetch,
      claimsPerWindow: 30,
    });
    const claims = Array.from({ length: 5 }, (_, i) => makeClaim(i));
    const cap = captureStderr();
    const result = await reviewer.review(stubInput(claims));
    expect(result.ok).toBe(true);

    // C2-003: upfront banner with claim count, window count, pass label.
    expect(
      cap.lines.some(
        (l) =>
          l.includes('Reviewing 5 claims across 1 window') &&
          l.includes('pass: general'),
      ),
    ).toBe(true);

    // C2-001: per-window line.
    expect(
      cap.lines.some(
        (l) =>
          l.startsWith('Reviewing window 1/1') &&
          l.includes('claim 5/5') &&
          l.includes('pass: general'),
      ),
    ).toBe(true);

    expect(cap.stdoutCalls).toEqual([]);
    cap.restore();
  });

  it('emits per-window lines across multiple windows with running claim counter', async () => {
    const reviewer = new OllamaInternReviewer({
      fetchImpl: fakeOk as unknown as typeof fetch,
      claimsPerWindow: 2,
    });
    const claims = Array.from({ length: 5 }, (_, i) => makeClaim(i));
    const cap = captureStderr();
    await reviewer.review(stubInput(claims));

    expect(cap.lines.some((l) => l.includes('Reviewing window 1/3') && l.includes('claim 2/5'))).toBe(true);
    expect(cap.lines.some((l) => l.includes('Reviewing window 2/3') && l.includes('claim 4/5'))).toBe(true);
    expect(cap.lines.some((l) => l.includes('Reviewing window 3/3') && l.includes('claim 5/5'))).toBe(true);
    cap.restore();
  });

  it('labels narrow_critic pass distinctly', async () => {
    const reviewer = new OllamaInternReviewer({
      fetchImpl: fakeOk as unknown as typeof fetch,
      claimsPerWindow: 30,
      mode: 'narrow_critic',
    });
    const cap = captureStderr();
    await reviewer.review(stubInput([makeClaim(1)]));
    expect(cap.lines.some((l) => l.includes('pass: narrow_critic'))).toBe(true);
    cap.restore();
  });
});
