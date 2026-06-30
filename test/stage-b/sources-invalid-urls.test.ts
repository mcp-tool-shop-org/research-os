import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import { gather } from '../../src/sources/index.js';
import { HeuristicExtractor } from '../../src/sources/extractors/heuristic.js';

let workDir: string;
let packPath: string;

// Minimal fetch stub: returns a small HTML body for any http(s) URL. Invalid
// URLs never reach here because collectUrls drops them before the fetch loop.
const fakeFetch: typeof fetch = (async () => {
  return new Response(
    `<html><head><title>Stub</title></head><body><article><p>${'A'.repeat(120)}</p></article></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}) as unknown as typeof fetch;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-invalid-urls-'));
  const result = await init({
    topic: 'How should research-os surface invalid URLs?',
    outDir: workDir,
  });
  packPath = result.packPath;
  await sectionAdd({ id: '01-landscape', purpose: 'Map the tools', packPath });
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('B-SOURCES-002 — GatherSummary.invalidUrls observability', () => {
  // RED-half target: malformed / non-http URLs must be surfaced, not dropped
  // silently. attempted should still reflect only the valid count.
  it('carries dropped malformed/non-http URLs into summary.invalidUrls', async () => {
    const summary = await gather({
      sectionId: '01-landscape',
      packPath,
      unsafeAllowAllHosts: true,
      urls: ['https://example.com/good', 'not a url', 'ftp://files.example.com/x', 'file:///etc/passwd'],
      fetchImpl: fakeFetch,
      extractors: [new HeuristicExtractor()],
    });

    expect(summary.attempted).toBe(1);
    expect(summary.invalidUrls).toEqual(
      expect.arrayContaining(['not a url', 'ftp://files.example.com/x', 'file:///etc/passwd']),
    );
    expect(summary.invalidUrls).toHaveLength(3);
  });

  // HAPPY-half: an all-valid run leaves invalidUrls as an empty array — the
  // additive field defaults to [] and the happy path is unchanged.
  it('returns an empty invalidUrls array when every URL is valid', async () => {
    const summary = await gather({
      sectionId: '01-landscape',
      packPath,
      unsafeAllowAllHosts: true,
      urls: ['https://example.com/good'],
      fetchImpl: fakeFetch,
      extractors: [new HeuristicExtractor()],
    });

    expect(summary.attempted).toBe(1);
    expect(summary.invalidUrls).toEqual([]);
  });
});
