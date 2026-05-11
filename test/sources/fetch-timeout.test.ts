/**
 * A-002 regression — request timeout.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchOnce } from '../../src/sources/fetch.js';

let workDir: string;
beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-timeout-'));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('fetchOnce — A-002 timeout', () => {
  it('emits network_error with timeout reason when the request hangs', async () => {
    const fetchImpl = (_url: string, init?: { signal?: AbortSignal }) =>
      new Promise<Response>((_, reject) => {
        const sig = init?.signal;
        if (sig) {
          if (sig.aborted) reject(new Error('aborted'));
          sig.addEventListener('abort', () => reject(new Error('aborted')));
        }
      });
    const { receipt } = await fetchOnce('https://example.com/hang', {
      sectionId: '01-section',
      packPath: workDir,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 50,
      unsafeAllowAllHosts: true,
    });
    expect(receipt.fetch_outcome).toBe('network_error');
    expect(receipt.fetch_error ?? '').toMatch(/timeout|abort/i);
  });
});
