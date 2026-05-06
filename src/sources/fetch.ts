import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { URL } from 'node:url';

import type { FetchReceipt } from './schema.js';

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

export interface FetchOptions {
  sectionId: string;
  packPath: string;
  fetchImpl?: typeof fetch;
}

export async function fetchOnce(
  url: string,
  options: FetchOptions,
): Promise<FetchAttemptResult> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
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

  let response: Response;
  try {
    response = await fetchImpl(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'research-os/0.1.0' },
    });
  } catch (err) {
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
      fetch_error: err instanceof Error ? err.message : String(err),
    };
    return { receipt, rawText: null, rawTextAbsPath: null };
  }

  const finalUrl = response.url || url;
  const contentType = response.headers.get('content-type');

  if (!response.ok) {
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

  const buffer = Buffer.from(await response.arrayBuffer());
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const byteCount = buffer.byteLength;

  let rawText: string | null = null;
  let rawTextRelPath: string | null = null;
  let rawTextAbsPath: string | null = null;

  if (isTextLike(contentType)) {
    rawText = buffer.toString('utf8');
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
