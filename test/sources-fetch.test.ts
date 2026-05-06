import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';

import { fetchOnce, makeSourceId, makeReceiptId } from '../src/sources/fetch.js';
import { FetchReceiptSchema } from '../src/sources/schema.js';

let server: Server;
let baseUrl: string;
let workDir: string;
let packPath: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/ok-html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><head><title>Hello</title></head><body><p>${'a'.repeat(60)}</p></body></html>`);
      return;
    }
    if (req.url === '/ok-text') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('plain content');
      return;
    }
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/ok-html' });
      res.end();
      return;
    }
    if (req.url === '/notfound') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('nope');
      return;
    }
    if (req.url === '/binary') {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(Buffer.from([0, 1, 2, 3]));
      return;
    }
    res.writeHead(500);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-fetch-'));
  packPath = join(workDir, 'pack');
  await mkdir(packPath, { recursive: true });
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('makeSourceId', () => {
  it('is deterministic for the same URL', () => {
    expect(makeSourceId('https://example.com/a')).toBe(makeSourceId('https://example.com/a'));
  });

  it('uses src_ prefix and 12 hex chars', () => {
    expect(makeSourceId('https://example.com/a')).toMatch(/^src_[a-f0-9]{12}$/);
  });
});

describe('makeReceiptId', () => {
  it('uses rcpt_ prefix and includes the source hash + timestamp', () => {
    const sid = 'src_abcdef012345';
    expect(makeReceiptId(sid, new Date(0))).toBe('rcpt_abcdef012345_0');
  });
});

describe('fetchOnce', () => {
  it('records a successful HTML fetch with sha256, raw text, and title', async () => {
    const { receipt, rawText } = await fetchOnce(`${baseUrl}/ok-html`, {
      sectionId: '01-landscape',
      packPath,
    });
    FetchReceiptSchema.parse(receipt);
    expect(receipt.fetch_outcome).toBe('ok');
    expect(receipt.status).toBe(200);
    expect(receipt.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.title).toBe('Hello');
    expect(receipt.raw_text_path).toBe(`evidence/raw/${receipt.source_id}.html`);
    expect(rawText).toContain('Hello');
    const onDisk = await readFile(join(packPath, receipt.raw_text_path!), 'utf8');
    expect(onDisk).toContain('Hello');
  });

  it('records http_error for 404 and writes no raw text', async () => {
    const { receipt, rawText } = await fetchOnce(`${baseUrl}/notfound`, {
      sectionId: '01-landscape',
      packPath,
    });
    FetchReceiptSchema.parse(receipt);
    expect(receipt.fetch_outcome).toBe('http_error');
    expect(receipt.status).toBe(404);
    expect(receipt.raw_text_path).toBeNull();
    expect(rawText).toBeNull();
  });

  it('records network_error when host is unreachable', async () => {
    const { receipt } = await fetchOnce('http://127.0.0.1:1/nope', {
      sectionId: '01-landscape',
      packPath,
    });
    FetchReceiptSchema.parse(receipt);
    expect(receipt.fetch_outcome).toBe('network_error');
    expect(receipt.status).toBeNull();
    expect(receipt.fetch_error).not.toBeNull();
  });

  it('follows redirects and reports final_url', async () => {
    const { receipt } = await fetchOnce(`${baseUrl}/redirect`, {
      sectionId: '01-landscape',
      packPath,
    });
    expect(receipt.fetch_outcome).toBe('ok');
    expect(receipt.final_url).toBe(`${baseUrl}/ok-html`);
  });

  it('records sha256 and byte_count for binary content but no raw text', async () => {
    const { receipt, rawText } = await fetchOnce(`${baseUrl}/binary`, {
      sectionId: '01-landscape',
      packPath,
    });
    FetchReceiptSchema.parse(receipt);
    expect(receipt.fetch_outcome).toBe('ok');
    expect(receipt.byte_count).toBe(4);
    expect(receipt.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.raw_text_path).toBeNull();
    expect(rawText).toBeNull();
  });
});
