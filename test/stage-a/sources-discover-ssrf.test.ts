/**
 * A-SOURCES-001 regression — discover-time SSRF guard.
 *
 * Two invariants, both halves each:
 *
 * 1. fetchUrlTitle (called via assessRelevanceBatch at discover time) must run
 *    the LLM-proposed URL through the shared SSRF guard BEFORE fetchImpl.
 *      - BAD: http://127.0.0.1/ (loopback) is NOT fetched and resolves to
 *        'unverified' (graceful degradation), fetchImpl never called.
 *      - GOOD: a public host IS fetched and a matching title yields 'verified'.
 *
 * 2. isHttpsUrl (via discover()) must reject http:.
 *      - BAD: http:// candidate is rejected ('Rejected non-https URL').
 *      - GOOD: https:// candidate is admitted.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assessRelevanceBatch,
  fetchUrlTitle,
} from '../../src/discover/relevance.js';
import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import {
  discover,
  type DiscoverProvider,
  type DiscoverProviderInput,
  type DiscoverProviderResult,
} from '../../src/discover/index.js';

describe('A-SOURCES-001 — discover-time SSRF guard on fetchUrlTitle', () => {
  it('does NOT fetch a loopback URL and resolves it to unverified', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response('<title>Daylight savings workplace study</title>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }) as unknown as typeof fetch;

    const out = await fetchUrlTitle('http://127.0.0.1:8080/admin', fetchImpl, 5000);
    expect(called).toBe(false); // BAD half: the private URL was never fetched
    expect(out.title).toBeNull();
    expect(out.error ?? '').toMatch(/SSRF refused/i);

    // And through the batch path it lands as 'unverified', not 'verified'.
    const checks = await assessRelevanceBatch({
      urls: ['http://127.0.0.1:8080/admin'],
      query: 'daylight savings workplace study',
      fetchImpl,
      threshold: 0.2,
      fetchTimeoutMs: 5000,
      concurrency: 1,
    });
    expect(checks[0]!.status).toBe('unverified');
  });

  it('GOOD half: a public URL IS fetched and a matching title is verified', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response('<title>Daylight savings workplace productivity</title>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }) as unknown as typeof fetch;

    const checks = await assessRelevanceBatch({
      urls: ['https://example.com/paper'],
      query: 'daylight savings workplace productivity',
      fetchImpl,
      threshold: 0.2,
      fetchTimeoutMs: 5000,
      concurrency: 1,
    });
    expect(called).toBe(true); // public host WAS fetched
    expect(checks[0]!.status).toBe('verified');
  });
});

class FakeProvider implements DiscoverProvider {
  readonly name = 'fake';
  constructor(private readonly result: DiscoverProviderResult) {}
  async available(): Promise<boolean> {
    return true;
  }
  async propose(_input: DiscoverProviderInput): Promise<DiscoverProviderResult> {
    return this.result;
  }
}

describe('A-SOURCES-001 — isHttpsUrl rejects http:', () => {
  let workDir: string;
  let packPath: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'research-os-sources-https-'));
    const r = await init({ topic: 'https rejection fixture pack', outDir: workDir });
    packPath = r.packPath;
    await sectionAdd({ id: '04-test', purpose: 'https floor', packPath });
  });
  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('rejects an http:// candidate and admits the https:// one', async () => {
    const provider = new FakeProvider({
      ok: true,
      method: 'fake',
      proposals: [
        {
          url: 'http://example.com/insecure', // BAD half: plain http must be rejected
          title: 'Insecure source',
          publisher: null,
          source_type_guess: 'docs',
          why_relevant: 'documentation served over http',
          rank: 1,
        },
        {
          url: 'https://example.com/secure', // GOOD half: https admitted
          title: 'Secure source',
          publisher: null,
          source_type_guess: 'docs',
          why_relevant: 'documentation served over https',
          rank: 2,
        },
      ],
    });
    const result = await discover({
      sectionId: '04-test',
      packPath,
      query: 'documentation https floor check',
      providers: [provider],
    });
    expect(result.candidatesRejectedInvalidUrl).toBe(1);
    expect(result.candidatesAdded).toBe(1);
    expect(result.candidates[0]!.url).toBe('https://example.com/secure');
    expect(result.warnings.some((w) => /Rejected non-https URL.*http:\/\/example/.test(w))).toBe(
      true,
    );
  });
});
