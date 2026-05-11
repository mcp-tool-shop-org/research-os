/**
 * A-004 regression — charset-aware decoding.
 *
 * Verifies that pickCharset honors Content-Type charset parameters and BOM
 * sniffs. We use Shift_JIS for the header-driven path and UTF-16LE with a
 * BOM for the BOM-sniff path.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchOnce } from '../../src/sources/fetch.js';

let workDir: string;
beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-charset-'));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

function bytesResponse(body: Uint8Array, contentType: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(body);
      c.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': contentType },
  });
}

describe('fetchOnce — A-004 charset decoding', () => {
  it('decodes Shift_JIS bytes when the Content-Type advertises Shift_JIS', async () => {
    // "テスト" in Shift_JIS = 0x83 0x65 0x83 0x58 0x83 0x67
    const sjis = new Uint8Array([0x83, 0x65, 0x83, 0x58, 0x83, 0x67]);
    const fetchImpl = async () => bytesResponse(sjis, 'text/html; charset=Shift_JIS');
    const { receipt, rawText } = await fetchOnce('https://example.com/sjis', {
      sectionId: '01-section',
      packPath: workDir,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      unsafeAllowAllHosts: true,
    });
    expect(receipt.fetch_outcome).toBe('ok');
    expect(rawText).toBe('テスト');
  });

  it('decodes UTF-16LE bytes via BOM sniff when no charset is in the header', async () => {
    // BOM + "Hi" in UTF-16LE
    const utf16 = new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00]);
    const fetchImpl = async () => bytesResponse(utf16, 'text/plain');
    const { receipt, rawText } = await fetchOnce('https://example.com/utf16', {
      sectionId: '01-section',
      packPath: workDir,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      unsafeAllowAllHosts: true,
    });
    expect(receipt.fetch_outcome).toBe('ok');
    // BOM may or may not be stripped depending on TextDecoder; assert payload presence
    expect(rawText ?? '').toContain('Hi');
  });
});
