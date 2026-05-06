import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { SourceCardSchema, type FetchReceipt, type SourceCard } from './schema.js';
import type { ExtractionResult, ExtractorName } from './types.js';

export function buildCard(args: {
  receipt: FetchReceipt;
  extraction: Extract<ExtractionResult, { ok: true }>;
  extractedBy: ExtractorName;
}): SourceCard {
  const { receipt, extraction, extractedBy } = args;
  const card = SourceCardSchema.parse({
    source_id: receipt.source_id,
    receipt_id: receipt.receipt_id,
    section_id: receipt.section_id,
    url: receipt.requested_url,
    final_url: receipt.final_url,
    fetched_at: receipt.fetched_at,
    publisher: extraction.publisher,
    published_at: extraction.published_at,
    title: extraction.title,
    source_type: extraction.source_type,
    relevance: extraction.relevance,
    key_points: extraction.key_points,
    limitations: extraction.limitations,
    asserts: extraction.asserts,
    scope: extraction.scope,
    not: extraction.not,
    extracted_by: extractedBy,
    extracted_at: new Date().toISOString(),
  });
  return card;
}

export async function writeSourceCard(packPath: string, card: SourceCard): Promise<string> {
  const dir = join(packPath, 'evidence', 'source-cards');
  await mkdir(dir, { recursive: true });
  const cardPath = join(dir, `${card.source_id}.json`);
  await writeFile(cardPath, JSON.stringify(card, null, 2), 'utf8');
  return cardPath;
}

export async function appendFetchLog(packPath: string, receipt: FetchReceipt): Promise<void> {
  const path = join(packPath, 'evidence', 'fetch-log.jsonl');
  await appendFile(path, JSON.stringify(receipt) + '\n', 'utf8');
}

export async function appendSectionSourceId(
  packPath: string,
  sectionId: string,
  sourceId: string,
): Promise<void> {
  const path = join(packPath, 'sections', sectionId, 'sources.jsonl');
  if (!existsSync(path)) {
    await writeFile(path, '', 'utf8');
  }
  const existing = await readFile(path, 'utf8');
  const ids = new Set(
    existing
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return (JSON.parse(line) as { source_id: string }).source_id;
        } catch {
          return null;
        }
      })
      .filter((x): x is string => x !== null),
  );
  if (ids.has(sourceId)) return;
  await appendFile(path, JSON.stringify({ source_id: sourceId, added_at: new Date().toISOString() }) + '\n', 'utf8');
}
