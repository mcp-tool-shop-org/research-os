/**
 * A-001 regression — response size cap.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchOnce } from '../../src/sources/fetch.js';

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-cap-'));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

function streamingResponse(chunks: Uint8Array[]): Response {
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i++]);
      } else {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

describe('fetchOnce — A-001 size cap', () => {
  it('returns too_large when streaming body exceeds maxBytes', async () => {
    const big = new Uint8Array(2048).fill(65);
    const fetchImpl = async () => streamingResponse([big, big, big, big]);
    const { receipt, rawText } = await fetchOnce('https://example.com/big', {
      sectionId: '01-section',
      packPath: workDir,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxBytes: 1024,
      unsafeAllowAllHosts: true,
    });
    expect(receipt.fetch_outcome).toBe('too_large');
    expect(receipt.fetch_error).toMatch(/exceeded/);
    expect(rawText).toBeNull();
  });

  it('returns ok when body is under maxBytes', async () => {
    const small = new Uint8Array(100).fill(66);
    const fetchImpl = async () => streamingResponse([small]);
    const { receipt } = await fetchOnce('https://example.com/small', {
      sectionId: '01-section',
      packPath: workDir,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxBytes: 1024,
      unsafeAllowAllHosts: true,
    });
    expect(receipt.fetch_outcome).toBe('ok');
    expect(receipt.byte_count).toBe(100);
  });
});
