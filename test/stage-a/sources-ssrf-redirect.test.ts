/**
 * A-TESTS-CI-002 regression (test-only) — fetchOnce redirect SSRF re-check.
 *
 * fetch.ts re-validates the FINAL url after a redirect (the
 * 'SSRF refused (redirect)' branch, ~lines 251-270): an attacker can serve a
 * 30x from a benign public host to a private/loopback target, and the
 * post-fetch check must refuse it. The 169.254.169.254 cloud-metadata IP is
 * the canonical SSRF target and had no explicit coverage.
 *
 * Both halves:
 *   - BAD: a fetchImpl whose Response.url is 127.0.0.1 / 169.254.169.254
 *     (distinct from the requested PUBLIC url) is refused
 *     (fetch_outcome === 'network_error', /SSRF refused \(redirect\)/).
 *   - GOOD: a benign public → public redirect passes (fetch_outcome === 'ok').
 *
 * unsafeAllowAllHosts is NOT set: the redirect re-check only runs on the
 * guarded path. The requested url uses a PUBLIC IP literal (8.8.8.8) so the
 * INITIAL pre-fetch isUrlSafe check passes WITHOUT any DNS lookup (keeps the
 * test offline/deterministic) — proving it is specifically the redirect
 * re-check that catches the rebind to the private final_url.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchOnce } from '../../src/sources/fetch.js';

let workDir: string;
beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-ssrf-redirect-'));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

/**
 * Build a fetchImpl that returns a 200 OK whose Response.url (the post-redirect
 * final url) is `finalUrl` — simulating the browser/undici following a redirect
 * to a different host than requested.
 */
function redirectingFetch(finalUrl: string): typeof fetch {
  return (async () => {
    const res = new Response('<html><head><title>ok</title></head><body>hi</body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
    // Response.url is read-only via the constructor; redefine it for the test.
    Object.defineProperty(res, 'url', { value: finalUrl, configurable: true });
    return res;
  }) as unknown as typeof fetch;
}

describe('fetchOnce — A-TESTS-CI-002 redirect SSRF re-check', () => {
  it('refuses a redirect whose final_url is 127.0.0.1 (loopback)', async () => {
    const { receipt } = await fetchOnce('https://8.8.8.8/start', {
      sectionId: '01-section',
      packPath: workDir,
      fetchImpl: redirectingFetch('http://127.0.0.1/internal'),
    });
    expect(receipt.fetch_outcome).toBe('network_error');
    expect(receipt.fetch_error ?? '').toMatch(/SSRF refused \(redirect\)/);
    expect(receipt.final_url).toBe('http://127.0.0.1/internal');
  });

  it('refuses a redirect to the 169.254.169.254 cloud-metadata IP', async () => {
    const { receipt } = await fetchOnce('https://8.8.8.8/start', {
      sectionId: '01-section',
      packPath: workDir,
      fetchImpl: redirectingFetch('http://169.254.169.254/latest/meta-data/'),
    });
    expect(receipt.fetch_outcome).toBe('network_error');
    expect(receipt.fetch_error ?? '').toMatch(/SSRF refused \(redirect\)/);
    expect(receipt.fetch_error ?? '').toMatch(/169\.254\.169\.254/);
  });

  it('GOOD half: a benign public → public redirect passes', async () => {
    const { receipt } = await fetchOnce('https://8.8.8.8/start', {
      sectionId: '01-section',
      packPath: workDir,
      // Final url is a different but still PUBLIC host (IP literal) — must NOT
      // be refused. Using an IP literal avoids any DNS lookup in CI.
      fetchImpl: redirectingFetch('https://1.1.1.1/landed'),
    });
    expect(receipt.fetch_outcome).toBe('ok');
    expect(receipt.final_url).toBe('https://1.1.1.1/landed');
  });
});
