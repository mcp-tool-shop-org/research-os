import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { URL } from 'node:url';

import type { FetchReceipt } from './schema.js';
import { RESEARCH_OS_VERSION } from '../index.js';
import { isUrlSafe } from './url-safety.js';

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

export const GOOGLE_CLIENT_KEY_REDACTED_MARKER = '[REDACTED-THIRD-PARTY-GOOGLE-CLIENT-KEY]';
export const STRIPE_CLIENT_KEY_REDACTED_MARKER = '[REDACTED-THIRD-PARTY-STRIPE-CLIENT-KEY]';

const GOOGLE_CLIENT_KEY_RE = /AIza[0-9A-Za-z_-]{35}/g;
const STRIPE_LIVE_PUBLISHABLE_KEY_RE = /\bpk_live_[0-9A-Za-z]{20,}\b/g;

/**
 * Redacts embedded third-party public client keys (Google API `AIza...` and
 * Stripe live publishable `pk_live_...` keys) from scraped text at ingestion
 * so raw evidence files never trigger secret-scanning alerts while preserving
 * surrounding document structure.
 */
export function redactThirdPartyKeys(rawText: string): {
  text: string;
  redactionCount: number;
} {
  let redactionCount = 0;
  let text = rawText.replace(GOOGLE_CLIENT_KEY_RE, () => {
    redactionCount += 1;
    return GOOGLE_CLIENT_KEY_REDACTED_MARKER;
  });
  text = text.replace(STRIPE_LIVE_PUBLISHABLE_KEY_RE, () => {
    redactionCount += 1;
    return STRIPE_CLIENT_KEY_REDACTED_MARKER;
  });
  return { text, redactionCount };
}

export const PERSONAL_USER_REDACTED_MARKER = '[redacted-user]';
export const PERSONAL_EMAIL_REDACTED_MARKER = '[redacted-email]';

// The account in a home path, as the studio's identity scanner reads it: word
// characters, dots and hyphens, never the shared profiles. A marker begins with
// "[", so none of these patterns can match it again.
const HOME_SEP = String.raw`[\\/]+`;
const HOME_ACCOUNT = String.raw`(?!(?:Public|Default|All Users)\b)[\p{L}\p{N}\p{M}_.-]+`;
const HOME_PATH_RES: RegExp[] = [
  // C:\Users\<account>, C:/Users/<account>, \\host\C$\Users\<account>, C:\\Users\\<account> as JSON writes it
  new RegExp(String.raw`([A-Za-z][:$]${HOME_SEP}Users${HOME_SEP})(${HOME_ACCOUNT})`, 'giu'),
  // /c/Users/<account> (Git Bash, MSYS, Cygwin, WSL), also under /cygdrive or /mnt
  new RegExp(String.raw`((?<![\\/])${HOME_SEP}[A-Za-z]${HOME_SEP}Users${HOME_SEP})(${HOME_ACCOUNT})`, 'giu'),
  // macOS /Users/<account>; case-sensitive, so /users/me routes and <host>/Users/<name> URL paths stay
  new RegExp(String.raw`((?<![\w\\/])${HOME_SEP}Users${HOME_SEP})(${HOME_ACCOUNT})`, 'gu'),
  // the same with the separators percent-encoded (C%3A%5CUsers%5C<account>)
  new RegExp(String.raw`([A-Za-z](?::|%3A)(?:[\\/]|%5C|%2F)+Users(?:[\\/]|%5C|%2F)+)(${HOME_ACCOUNT})`, 'giu'),
];

// Consumer mailbox providers. An address here is one person's. An address on any
// other domain (security@project.example) is an organisation's contact and is
// evidence, so it stays.
const FREE_MAIL_DOMAINS = [
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com', 'pm.me', 'aol.com',
];
// The domain must end there: a full stop closing a sentence is fine, but a longer domain that merely starts with a provider's name is another domain.
const PERSONAL_EMAIL_RE = new RegExp(
  String.raw`\b[A-Za-z0-9._%+-]+@(?:${FREE_MAIL_DOMAINS.map((d) => d.replace('.', String.raw`\.`)).join('|')})(?![\w-]|\.\w)`,
  'gi',
);

interface PersonalSpan {
  start: number;
  end: number;
  kind: 'user' | 'email';
}

/**
 * Redacts two kinds of third-party personal data from scraped text at
 * ingestion: the account name in a home path (C:\Users\<name>\... in a pasted
 * traceback becomes C:\Users\[redacted-user]\..., separators and the rest of
 * the path kept) and a personal mailbox address (becomes [redacted-email]).
 * `redactionCount` counts every account name and address replaced.
 */
export function redactThirdPartyPersonalData(rawText: string): {
  text: string;
  redactionCount: number;
} {
  const spans: PersonalSpan[] = [];
  for (const re of HOME_PATH_RES) {
    for (const m of rawText.matchAll(re)) {
      const start = (m.index ?? 0) + m[1]!.length;
      spans.push({ start, end: start + m[2]!.length, kind: 'user' });
    }
  }
  for (const m of rawText.matchAll(PERSONAL_EMAIL_RE)) {
    const start = m.index ?? 0;
    spans.push({ start, end: start + m[0].length, kind: 'email' });
  }
  if (spans.length === 0) return { text: rawText, redactionCount: 0 };

  // Patterns can find the same account (a drive path is also a macOS-style path to the macOS pattern). One span each.
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: PersonalSpan[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.start < last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }

  let text = '';
  let at = 0;
  for (const span of merged) {
    text += rawText.slice(at, span.start);
    text += span.kind === 'user' ? PERSONAL_USER_REDACTED_MARKER : PERSONAL_EMAIL_REDACTED_MARKER;
    at = span.end;
  }
  text += rawText.slice(at);
  return { text, redactionCount: merged.length };
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

  // v0.10 Slice 3 — capture wall-clock fetch duration for R-003's
  // fast-response signal. Duration spans the fetchImpl call only;
  // body streaming is excluded so the value reflects the CDN/server
  // response time, not the size of the payload. Only the success path
  // populates the field on the receipt; failures leave it absent.
  const fetchStart = Date.now();
  let fetchDurationMs: number;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      redirect: 'follow',
      headers: { 'User-Agent': `research-os/${RESEARCH_OS_VERSION}` },
      signal: controller.signal,
    });
    fetchDurationMs = Date.now() - fetchStart;
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

  let sha256 = createHash('sha256').update(buffer).digest('hex');
  let byteCount = buffer.byteLength;

  let rawText: string | null = null;
  let rawTextRelPath: string | null = null;
  let rawTextAbsPath: string | null = null;
  let redactionCount: number | undefined;
  let fetchedSha256: string | undefined;

  if (isTextLike(contentType)) {
    const charset = pickCharset(contentType, buffer);
    const decodedText = new TextDecoder(charset).decode(
      new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    );
    const keysRedacted = redactThirdPartyKeys(decodedText);
    const personalRedacted = redactThirdPartyPersonalData(keysRedacted.text);
    rawText = personalRedacted.text;
    redactionCount = keysRedacted.redactionCount + personalRedacted.redactionCount;
    if (redactionCount > 0) {
      // sha256 always names the stored file; the hash of the bytes as fetched
      // survives as provenance.
      fetchedSha256 = sha256;
      const redactedBytes = Buffer.from(rawText, 'utf8');
      sha256 = createHash('sha256').update(redactedBytes).digest('hex');
      byteCount = redactedBytes.byteLength;
    }
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
    fetch_duration_ms: fetchDurationMs,
    ...(redactionCount !== undefined ? { redaction_count: redactionCount } : {}),
    ...(fetchedSha256 !== undefined ? { fetched_sha256: fetchedSha256 } : {}),
  };

  return { receipt, rawText, rawTextAbsPath };
}
