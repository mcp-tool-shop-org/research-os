// Stage A verifier follow-up — discover-time SSRF guard must re-check the
// POST-REDIRECT final URL (A-SOURCES-001 completion).
//
// The initial Stage A fix guarded only the first URL passed to fetchUrlTitle.
// fetch.ts (the shared guard) ALSO re-validates response.url after a redirect;
// fetchUrlTitle did not, so an LLM-proposed https URL that 30x-redirects to a
// private/loopback/link-local host was fetched and its <title> leaked.
//
// Both halves (initial url uses the PUBLIC IP literal 8.8.8.8 so the pre-fetch
// check passes WITHOUT DNS — proving it is specifically the redirect re-check):
//   - BAD : redirect to 169.254.169.254 / 127.0.0.1 → title null + refusal, body
//           never title-parsed.
//   - GOOD: benign public → public redirect still yields the title.

import { describe, it, expect } from 'vitest';
import { fetchUrlTitle } from '../../src/discover/relevance.js';

function redirectingFetch(
  finalUrl: string,
  body = '<html><head><title>internal admin console</title></head><body>secret</body></html>',
): typeof fetch {
  return (async () => {
    const res = new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
    // Response.url is read-only via the constructor; redefine it to simulate the
    // browser/undici having followed a redirect to a different host.
    Object.defineProperty(res, 'url', { value: finalUrl, configurable: true });
    return res;
  }) as unknown as typeof fetch;
}

describe('fetchUrlTitle — A-SOURCES-001 redirect SSRF re-check', () => {
  it('BAD: a public URL redirecting to 169.254.169.254 is refused, title not read', async () => {
    const out = await fetchUrlTitle(
      'https://8.8.8.8/start',
      redirectingFetch('http://169.254.169.254/latest/meta-data/'),
      5000,
    );
    expect(out.title).toBeNull();
    expect(out.error ?? '').toMatch(/SSRF refused \(redirect\)/);
  });

  it('BAD: a public URL redirecting to loopback 127.0.0.1 is refused', async () => {
    const out = await fetchUrlTitle(
      'https://8.8.8.8/start',
      redirectingFetch('http://127.0.0.1/internal'),
      5000,
    );
    expect(out.title).toBeNull();
    expect(out.error ?? '').toMatch(/SSRF refused \(redirect\)/);
  });

  it('GOOD: a benign public → public redirect still yields the title', async () => {
    const out = await fetchUrlTitle(
      'https://8.8.8.8/start',
      redirectingFetch(
        'https://1.1.1.1/landed',
        '<html><head><title>public landing</title></head></html>',
      ),
      5000,
    );
    expect(out.error).toBeNull();
    expect(out.title).toBe('public landing');
  });
});
