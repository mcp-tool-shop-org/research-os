import { createHash } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import {
  fetchOnce,
  gather,
  redactThirdPartyKeys,
  GOOGLE_CLIENT_KEY_REDACTED_MARKER,
  STRIPE_CLIENT_KEY_REDACTED_MARKER,
  FetchReceiptSchema,
  SourceCardSchema,
  HeuristicExtractor,
} from '../../src/sources/index.js';

// Construct synthetic keys at runtime so no literal scanner-matching prefix+body
// exists in source control.
const SYNTH_GOOGLE_KEY_1 = 'AIza' + 'SyB1c2D3e4F5g6H7i8J9k0L1m2N3o4P5q6R';
const SYNTH_GOOGLE_KEY_2 = 'AIza' + 'SyZ9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J';
const SYNTH_STRIPE_KEY = 'pk_live_' + '51AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';

let server: Server;
let baseUrl: string;
let workDir: string;
let packPath: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/page-with-keys') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<html><head><title>Page With Keys</title>` +
          `<meta property="og:site_name" content="Example Docs" />` +
          `<script>window.firebaseConfig = { apiKey: "${SYNTH_GOOGLE_KEY_1}", backupKey: "${SYNTH_GOOGLE_KEY_2}" };</script>` +
          `<script>window.stripeKey = "${SYNTH_STRIPE_KEY}";</script>` +
          `</head><body><article><h1>Page With Keys</h1>` +
          `<p>${'Durable export runtime verification details for mobile and web targets. '.repeat(4)}</p>` +
          `</article></body></html>`,
      );
      return;
    }
    if (req.url === '/page-without-keys') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<html><head><title>Clean Page</title>` +
          `<meta property="og:site_name" content="Example Docs" />` +
          `</head><body><article><h1>Clean Page</h1>` +
          `<p>${'Clean documentation paragraph without any embedded third-party client keys. '.repeat(4)}</p>` +
          `</article></body></html>`,
      );
      return;
    }
    res.writeHead(404);
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
  workDir = await mkdtemp(join(tmpdir(), 'research-os-redact-'));
  const result = await init({
    topic: 'How does ingestion redaction strip third-party client keys?',
    outDir: workDir,
  });
  packPath = result.packPath;
  await sectionAdd({
    id: '01-landscape',
    purpose: 'Verify key redaction at ingestion',
    packPath,
  });
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('redactThirdPartyKeys', () => {
  it('replaces Google client keys and Stripe live publishable keys with non-prefix markers', () => {
    const input = `key1=${SYNTH_GOOGLE_KEY_1} key2=${SYNTH_GOOGLE_KEY_2} stripe=${SYNTH_STRIPE_KEY}`;
    const { text, redactionCount } = redactThirdPartyKeys(input);

    expect(redactionCount).toBe(3);
    expect(text).toBe(
      `key1=${GOOGLE_CLIENT_KEY_REDACTED_MARKER} key2=${GOOGLE_CLIENT_KEY_REDACTED_MARKER} stripe=${STRIPE_CLIENT_KEY_REDACTED_MARKER}`,
    );
    expect(text).not.toContain('AIza');
    expect(text).not.toContain('pk_live_');
  });

  it('leaves text without keys untouched and reports redactionCount = 0', () => {
    const input = '<html><body><p>No client keys here.</p></body></html>';
    const { text, redactionCount } = redactThirdPartyKeys(input);

    expect(redactionCount).toBe(0);
    expect(text).toBe(input);
  });
});

describe('ingestion redaction in fetchOnce and gather', () => {
  it('redacts embedded keys on a page with keys and records redaction_count in receipt and card', async () => {
    const summary = await gather({
      sectionId: '01-landscape',
      packPath,
      unsafeAllowAllHosts: true,
      urls: [`${baseUrl}/page-with-keys`],
      extractors: [new HeuristicExtractor()],
    });

    expect(summary.fetchedOk).toBe(1);
    expect(summary.cardsWritten).toBe(1);
    const sid = summary.sourceIds[0]!;

    const rawDisk = await readFile(join(packPath, 'evidence', 'raw', `${sid}.html`), 'utf8');
    expect(rawDisk).not.toContain('AIza');
    expect(rawDisk).not.toContain('pk_live_');
    expect(rawDisk).toContain(GOOGLE_CLIENT_KEY_REDACTED_MARKER);
    expect(rawDisk).toContain(STRIPE_CLIENT_KEY_REDACTED_MARKER);

    const logLines = (await readFile(join(packPath, 'evidence', 'fetch-log.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean);
    expect(logLines).toHaveLength(1);
    const receipt = FetchReceiptSchema.parse(JSON.parse(logLines[0]!));
    expect(receipt.redaction_count).toBe(3);
    expect(receipt.sha256).toBe(
      createHash('sha256').update(Buffer.from(rawDisk, 'utf8')).digest('hex'),
    );
    expect(receipt.byte_count).toBe(Buffer.byteLength(rawDisk, 'utf8'));

    const card = SourceCardSchema.parse(
      JSON.parse(await readFile(join(packPath, 'evidence', 'source-cards', `${sid}.json`), 'utf8')),
    );
    expect(card.redaction_count).toBe(3);
  });

  it('preserves content on a page without keys and records redaction_count = 0 in receipt and card', async () => {
    const { receipt: directReceipt, rawText } = await fetchOnce(`${baseUrl}/page-without-keys`, {
      sectionId: '01-landscape',
      packPath,
      unsafeAllowAllHosts: true,
    });
    expect(directReceipt.redaction_count).toBe(0);
    expect(rawText).toContain('Clean Page');

    const summary = await gather({
      sectionId: '01-landscape',
      packPath,
      unsafeAllowAllHosts: true,
      urls: [`${baseUrl}/page-without-keys`],
      extractors: [new HeuristicExtractor()],
    });

    expect(summary.fetchedOk).toBe(1);
    expect(summary.cardsWritten).toBe(1);
    const sid = summary.sourceIds[0]!;

    const card = SourceCardSchema.parse(
      JSON.parse(await readFile(join(packPath, 'evidence', 'source-cards', `${sid}.json`), 'utf8')),
    );
    expect(card.redaction_count).toBe(0);
  });
});
