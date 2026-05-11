import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';

import { init } from '../src/intake/index.js';
import { add as sectionAdd } from '../src/sections/index.js';
import { gather } from '../src/sources/index.js';
import { HeuristicExtractor } from '../src/sources/extractors/heuristic.js';
import {
  NoUrlsProvidedError,
  PackNotFoundError,
  SectionNotFoundError,
} from '../src/errors.js';
import { FetchReceiptSchema, SourceCardSchema } from '../src/sources/schema.js';

let server: Server;
let baseUrl: string;
let workDir: string;
let packPath: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/article-1') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><head>
<title>Article One</title>
<meta property="og:site_name" content="Pub One" />
<meta name="description" content="Article one argues X under conditions Y." />
</head><body><article><h1>Article One</h1><p>${'A'.repeat(80)}</p><p>${'B'.repeat(80)}</p></article></body></html>`);
      return;
    }
    if (req.url === '/article-2') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><head><title>Article Two</title></head><body><p>${'C'.repeat(80)}</p></body></html>`);
      return;
    }
    if (req.url === '/missing') {
      res.writeHead(404);
      res.end();
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
  workDir = await mkdtemp(join(tmpdir(), 'research-os-gather-'));
  const result = await init({
    topic: 'How should research-os handle gather end-to-end?',
    outDir: workDir,
  });
  packPath = result.packPath;
  await sectionAdd({
    id: '01-landscape',
    purpose: 'Map the existing tools',
    packPath,
  });
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('gather (heuristic-only path)', () => {
  it('fetches, extracts, and writes source cards + receipts', async () => {
    const summary = await gather({
      sectionId: '01-landscape',
      packPath,
      unsafeAllowAllHosts: true,
      urls: [`${baseUrl}/article-1`, `${baseUrl}/article-2`],
      extractors: [new HeuristicExtractor()],
    });

    expect(summary.attempted).toBe(2);
    expect(summary.fetchedOk).toBe(2);
    expect(summary.fetchedFailed).toBe(0);
    expect(summary.cardsWritten).toBe(2);
    expect(summary.sourceIds).toHaveLength(2);

    for (const sid of summary.sourceIds) {
      const card = JSON.parse(
        await readFile(join(packPath, 'evidence', 'source-cards', `${sid}.json`), 'utf8'),
      );
      SourceCardSchema.parse(card);
      expect(card.extracted_by).toBe('heuristic');
    }

    const log = await readFile(join(packPath, 'evidence', 'fetch-log.jsonl'), 'utf8');
    const lines = log.trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      FetchReceiptSchema.parse(JSON.parse(line));
    }

    const sourcesJsonl = await readFile(
      join(packPath, 'sections', '01-landscape', 'sources.jsonl'),
      'utf8',
    );
    expect(sourcesJsonl.trim().split('\n')).toHaveLength(2);
  });

  it('records a receipt for a 404 fetch but writes no source card', async () => {
    const summary = await gather({
      sectionId: '01-landscape',
      packPath,
      unsafeAllowAllHosts: true,
      urls: [`${baseUrl}/missing`],
      extractors: [new HeuristicExtractor()],
    });
    expect(summary.fetchedFailed).toBe(1);
    expect(summary.cardsWritten).toBe(0);
    expect(summary.receiptsAppended).toBe(1);

    const log = (await readFile(join(packPath, 'evidence', 'fetch-log.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean);
    expect(log).toHaveLength(1);
    const receipt = JSON.parse(log[0]);
    FetchReceiptSchema.parse(receipt);
    expect(receipt.fetch_outcome).toBe('http_error');
    expect(receipt.status).toBe(404);

    const cards = await stat(join(packPath, 'evidence', 'source-cards')).catch(() => null);
    if (cards) {
      const { readdir } = await import('node:fs/promises');
      const entries = await readdir(join(packPath, 'evidence', 'source-cards'));
      expect(entries.filter((e) => e.endsWith('.json'))).toHaveLength(0);
    }
  });

  it('records receipt with extraction_outcome=failed when extraction fails', async () => {
    const failingExtractor = {
      name: 'heuristic' as const,
      async available() {
        return true;
      },
      async extract() {
        return { ok: false as const, error: 'forced failure' };
      },
    };
    const summary = await gather({
      sectionId: '01-landscape',
      packPath,
      unsafeAllowAllHosts: true,
      urls: [`${baseUrl}/article-1`],
      extractors: [failingExtractor],
    });
    expect(summary.fetchedOk).toBe(1);
    expect(summary.extractedFailed).toBe(1);
    expect(summary.cardsWritten).toBe(0);

    const log = (await readFile(join(packPath, 'evidence', 'fetch-log.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean);
    const receipt = JSON.parse(log[0]);
    expect(receipt.extraction_outcome).toBe('failed');
    expect(receipt.extraction_error).toBe('forced failure');
  });

  it('falls back from ollama-intern to heuristic when ollama is unavailable', async () => {
    const ollamaUnavail = {
      name: 'ollama-intern' as const,
      async available() {
        return false;
      },
      async extract() {
        throw new Error('should not be called when unavailable');
      },
    };
    const summary = await gather({
      sectionId: '01-landscape',
      packPath,
      unsafeAllowAllHosts: true,
      urls: [`${baseUrl}/article-1`],
      extractors: [ollamaUnavail, new HeuristicExtractor()],
    });
    expect(summary.cardsWritten).toBe(1);
    const card = JSON.parse(
      await readFile(
        join(packPath, 'evidence', 'source-cards', `${summary.sourceIds[0]}.json`),
        'utf8',
      ),
    );
    expect(card.extracted_by).toBe('heuristic');
  });

  it('rejects when no URLs are provided', async () => {
    await expect(
      gather({
        sectionId: '01-landscape',
        packPath,
        extractors: [new HeuristicExtractor()],
      }),
    ).rejects.toBeInstanceOf(NoUrlsProvidedError);
  });

  it('rejects when no research.yaml is present', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'research-os-gather-empty-'));
    try {
      await expect(
        gather({
          sectionId: '01-landscape',
          packPath: empty,
          urls: [`${baseUrl}/article-1`],
          extractors: [new HeuristicExtractor()],
        }),
      ).rejects.toBeInstanceOf(PackNotFoundError);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it('rejects when section does not exist in the pack', async () => {
    await expect(
      gather({
        sectionId: '99-not-real',
        packPath,
        urls: [`${baseUrl}/article-1`],
        extractors: [new HeuristicExtractor()],
      }),
    ).rejects.toBeInstanceOf(SectionNotFoundError);
  });

  it('dedupes duplicate URLs across --url and --urls-file inputs', async () => {
    const summary = await gather({
      sectionId: '01-landscape',
      packPath,
      unsafeAllowAllHosts: true,
      urls: [`${baseUrl}/article-1`, `${baseUrl}/article-1`, `${baseUrl}/article-2`],
      extractors: [new HeuristicExtractor()],
    });
    expect(summary.attempted).toBe(2);
  });
});
