/**
 * A-007 regression — SSRF guard on the initial URL.
 *
 * The default code path rejects http://127.0.0.1/ and http://10.0.0.1/
 * before fetchImpl ever runs. unsafeAllowAllHosts: true (used by test
 * fixtures with mocked fetchImpls) must bypass the check.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchOnce } from '../../src/sources/fetch.js';

let workDir: string;
beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-ssrf-'));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('fetchOnce — A-007 SSRF guard', () => {
  it('refuses http://127.0.0.1/ before the network call runs', async () => {
    let called = false;
    const fetchImpl = async () => {
      called = true;
      return new Response('should not happen');
    };
    const { receipt } = await fetchOnce('http://127.0.0.1:1234/', {
      sectionId: '01-section',
      packPath: workDir,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(called).toBe(false);
    expect(receipt.fetch_outcome).toBe('network_error');
    expect(receipt.fetch_error ?? '').toMatch(/SSRF refused/i);
  });

  it('refuses http://10.0.0.1/ (private IPv4 range)', async () => {
    const { receipt } = await fetchOnce('http://10.0.0.1/', {
      sectionId: '01-section',
      packPath: workDir,
    });
    expect(receipt.fetch_outcome).toBe('network_error');
    expect(receipt.fetch_error ?? '').toMatch(/SSRF refused.*private\/loopback/i);
  });

  it('allows the request when unsafeAllowAllHosts: true is provided', async () => {
    const fetchImpl = async () =>
      new Response('hi', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    const { receipt } = await fetchOnce('http://127.0.0.1:1234/', {
      sectionId: '01-section',
      packPath: workDir,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      unsafeAllowAllHosts: true,
    });
    expect(receipt.fetch_outcome).toBe('ok');
  });
});
