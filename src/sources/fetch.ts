import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { URL } from 'node:url';
import { isIP } from 'node:net';
import { promises as dns } from 'node:dns';

import type { FetchReceipt } from './schema.js';
import { RESEARCH_OS_VERSION } from '../index.js';

export interface FetchAttemptResult {
  receipt: FetchReceipt;
  rawText: string | null;
  rawTextAbsPath: string | null;
}

function urlHash(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 12);
}

export function makeSourceId(url: string): string {
  return `src_${urlHash(url)}`;
}

export function makeReceiptId(sourceId: string, when: Date): string {
  const ts = when.getTime();
  return `rcpt_${sourceId.replace(/^src_/, '')}_${ts}`;
}

function pickExtension(contentType: string | null, finalUrl: string | null): string {
  if (contentType?.includes('text/html')) return '.html';
  if (contentType?.includes('text/plain')) return '.txt';
  if (contentType?.includes('application/json')) return '.json';
  if (contentType?.includes('text/markdown')) return '.md';
  if (finalUrl) {
    try {
      const ext = extname(new URL(finalUrl).pathname);
      if (ext) return ext;
    } catch {
      /* fall through */
    }
  }
  return '.txt';
}

function isTextLike(contentType: string | null): boolean {
  if (!contentType) return true;
  return (
    contentType.startsWith('text/') ||
    contentType.includes('json') ||
    contentType.includes('xml') ||
    contentType.includes('javascript')
  );
}

/**
 * A-004 — charset-aware decoding.
 */
function pickCharset(contentType: string | null, buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return 'utf-8';
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return 'utf-16le';
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) return 'utf-16be';
  if (!contentType) return 'utf-8';
  const m = /charset\s*=\s*["']?([\w-]+)["']?/i.exec(contentType);
  if (!m) return 'utf-8';
  const cs = m[1].toLowerCase();
  try {
    new TextDecoder(cs);
    return cs;
  } catch {
    return 'utf-8';
  }
}

/**
 * A-007 — SSRF guard.
 */
function isPrivateOrLoopbackAddress(addr: string): boolean {
  const v = isIP(addr);
  if (v === 4) {
    const parts = addr.split('.').map((p) => Number(p));
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
    const [a, b] = parts;
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
    return false;
  }
  if (v === 6) {
    const bare = addr.toLowerCase().split('%')[0];
    if (bare === '::1' || bare === '0:0:0:0:0:0:0:1') return true;
    if (bare === '::' || bare === '0:0:0:0:0:0:0:0') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(bare);
    if (mapped) return isPrivateOrLoopbackAddress(mapped[1]);
    if (/^f[cd][0-9a-f]{2}:/.test(bare)) return true;
    if (/^fe[89ab][0-9a-f]:/.test(bare)) return true;
    return false;
  }
  return false;
}

async function isUrlSafe(
  urlStr: string,
): Promise<{ safe: true } | { safe: false; reason: string }> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { safe: false, reason: 'invalid URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `non-http(s) protocol ${parsed.protocol}` };
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (isIP(hostname)) {
    if (isPrivateOrLoopbackAddress(hostname)) {
      return { safe: false, reason: `private/loopback IP ${hostname}` };
    }
    return { safe: true };
  }
  try {
    // NOTE: Known DNS-rebinding TOCTOU between this pre-check and the
    // fetchImpl() resolution. An attacker controlling the authoritative DNS
    // for a hostname can return a public IP here and a private/loopback IP
    // at fetch time (or use low-TTL A-record swap). This is acceptable for
    // the current operator-curated URL threat model. Hardening (custom
    // dispatcher with pre-resolved IP) is a post-v1.0 concern; see SECURITY.md.
    const records = await dns.lookup(hostname, { all: true });
    for (const r of records) {
      if (isPrivateOrLoopbackAddress(r.address)) {
        return {
          safe: false,
          reason: `hostname ${hostname} resolves to private/loopback ${r.address}`,
        };
      }
    }
    return { safe: true };
  } catch (err) {
    return {
      safe: false,
      reason: `DNS lookup failed for ${hostname}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export interface FetchOptions {
  sectionId: string;
  packPath: string;
  fetchImpl?: typeof fetch;
  maxBytes?: number;
  timeoutMs?: number;
  unsafeAllowAllHosts?: boolean;
}

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

export async function fetchOnce(
  url: string,
  options: FetchOptions,
): Promise<FetchAttemptResult> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const unsafeAllowAllHosts = options.unsafeAllowAllHosts ?? false;
  const sourceId = makeSourceId(url);
  const fetchedAt = new Date();
  const receiptId = makeReceiptId(sourceId, fetchedAt);

  const receiptBase = {
    receipt_id: receiptId,
    source_id: sourceId,
    section_id: options.sectionId,
    requested_url: url,
    fetched_at: fetchedAt.toISOString(),
    extraction_outcome: 'skipped' as const,
    extraction_extractor: null,
    extraction_error: null,
  };

  if (!unsafeAllowAllHosts) {
    const initialCheck = await isUrlSafe(url);
    if (!initialCheck.safe) {
      const receipt: FetchReceipt = {
        ...receiptBase,
        final_url: null,
        status: null,
        status_text: null,
        content_type: null,
        byte_count: null,
        sha256: null,
        title: null,
        raw_text_path: null,
        fetch_outcome: 'network_error',
        fetch_error: `SSRF refused: ${initialCheck.reason}`,
      };
      return { receipt, rawText: null, rawTextAbsPath: null };
    }
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      redirect: 'follow',
      headers: { 'User-Agent': `research-os/${RESEARCH_OS_VERSION}` },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutHandle);
    const baseMsg = err instanceof Error ? err.message : String(err);
    const fetchError = timedOut
      ? `timeout after ${timeoutMs} ms${baseMsg ? ` (${baseMsg})` : ''}`
      : baseMsg;
    const receipt: FetchReceipt = {
      ...receiptBase,
      final_url: null,
      status: null,
      status_text: null,
      content_type: null,
      byte_count: null,
      sha256: null,
      title: null,
      raw_text_path: null,
      fetch_outcome: 'network_error',
      fetch_error: fetchError,
    };
    return { receipt, rawText: null, rawTextAbsPath: null };
  }

  const finalUrl = response.url || url;
  if (!unsafeAllowAllHosts && finalUrl !== url) {
    const finalCheck = await isUrlSafe(finalUrl);
    if (!finalCheck.safe) {
      clearTimeout(timeoutHandle);
      const receipt: FetchReceipt = {
        ...receiptBase,
        final_url: finalUrl,
        status: null,
        status_text: null,
        content_type: null,
        byte_count: null,
        sha256: null,
        title: null,
        raw_text_path: null,
        fetch_outcome: 'network_error',
        fetch_error: `SSRF refused (redirect): ${finalCheck.reason}`,
      };
      return { receipt, rawText: null, rawTextAbsPath: null };
    }
  }

  const contentType = response.headers.get('content-type');

  if (!response.ok) {
    clearTimeout(timeoutHandle);
    const receipt: FetchReceipt = {
      ...receiptBase,
      final_url: finalUrl,
      status: response.status,
      status_text: response.statusText || null,
      content_type: contentType,
      byte_count: null,
      sha256: null,
      title: null,
      raw_text_path: null,
      fetch_outcome: 'http_error',
      fetch_error: `${response.status} ${response.statusText || ''}`.trim(),
    };
    return { receipt, rawText: null, rawTextAbsPath: null };
  }

  let buffer: Buffer;
  let exceeded = false;
  try {
    const body = response.body as ReadableStream<Uint8Array> | null;
    if (body && typeof body.getReader === 'function') {
      const reader = body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > maxBytes) {
            exceeded = true;
            try {
              await reader.cancel();
            } catch {
              /* ignore */
            }
            break;
          }
          chunks.push(value);
        }
      }
      buffer = Buffer.concat(
        chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength)),
      );
    } else {
      const ab = await response.arrayBuffer();
      if (ab.byteLength > maxBytes) {
        exceeded = true;
        buffer = Buffer.alloc(0);
      } else {
        buffer = Buffer.from(ab);
      }
    }
  } catch (err) {
    clearTimeout(timeoutHandle);
    const baseMsg = err instanceof Error ? err.message : String(err);
    const fetchError = timedOut
      ? `timeout after ${timeoutMs} ms${baseMsg ? ` (${baseMsg})` : ''}`
      : baseMsg;
    const receipt: FetchReceipt = {
      ...receiptBase,
      final_url: finalUrl,
      status: response.status,
      status_text: response.statusText || null,
      content_type: contentType,
      byte_count: null,
      sha256: null,
      title: null,
      raw_text_path: null,
      fetch_outcome: 'network_error',
      fetch_error: fetchError,
    };
    return { receipt, rawText: null, rawTextAbsPath: null };
  }
  clearTimeout(timeoutHandle);

  if (exceeded) {
    const receipt: FetchReceipt = {
      ...receiptBase,
      final_url: finalUrl,
      status: response.status,
      status_text: response.statusText || null,
      content_type: contentType,
      byte_count: null,
      sha256: null,
      title: null,
      raw_text_path: null,
      fetch_outcome: 'too_large',
      fetch_error: `response exceeded ${maxBytes} bytes`,
    };
    return { receipt, rawText: null, rawTextAbsPath: null };
  }

  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const byteCount = buffer.byteLength;

  let rawText: string | null = null;
  let rawTextRelPath: string | null = null;
  let rawTextAbsPath: string | null = null;

  if (isTextLike(contentType)) {
    const charset = pickCharset(contentType, buffer);
    rawText = new TextDecoder(charset).decode(
      new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    );
    const ext = pickExtension(contentType, finalUrl);
    const dir = join(options.packPath, 'evidence', 'raw');
    await mkdir(dir, { recursive: true });
    const abs = join(dir, `${sourceId}${ext}`);
    await writeFile(abs, rawText, 'utf8');
    rawTextRelPath = relative(options.packPath, abs).split('\\').join('/');
    rawTextAbsPath = abs;
  }

  let title: string | null = null;
  if (rawText && contentType?.includes('text/html')) {
    const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(rawText);
    if (m && m[1]) title = m[1].trim() || null;
  }

  const receipt: FetchReceipt = {
    ...receiptBase,
    final_url: finalUrl,
    status: response.status,
    status_text: response.statusText || null,
    content_type: contentType,
    byte_count: byteCount,
    sha256,
    title,
    raw_text_path: rawTextRelPath,
    fetch_outcome: 'ok',
    fetch_error: null,
  };

  return { receipt, rawText, rawTextAbsPath };
}
