import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { SourceCardSchema, type FetchReceipt, type SourceCard } from './schema.js';
import type { ExtractionResult, ExtractorName } from './types.js';
import { classifySourceType } from './source-type-classifier.js';
import { getEffectiveSourceType, getEffectivePublisher } from './effective-card.js';
import type { SourceCardOverride } from './source-card-overrides-schema.js';

export function buildCard(args: {
  receipt: FetchReceipt;
  extraction: Extract<ExtractionResult, { ok: true }>;
  extractedBy: ExtractorName;
  /**
   * Override entries loaded from evidence/source-card-overrides.jsonl.
   * Component A (v0.4): when present, effective source_type and publisher are
   * computed via the L1 override layer before the card is persisted.
   * Omit (or pass []) to skip override application — e.g. in test environments
   * that do not supply a pack path.
   */
  overrides?: SourceCardOverride[];
}): SourceCard {
  const { receipt, extraction, extractedBy } = args;
  const overrides = args.overrides ?? [];

  // Run the URL-pattern classifier (Component B, v0.4). When a rule matches
  // (rule_hint !== 'no-rule-match'), the classifier result is authoritative for
  // source_type. When no rule matches, we preserve the extractor's heuristic
  // result (e.g. 'benchmark' for paperswithcode.com, 'primary' for arxiv.org).
  const classification = classifySourceType({ url: receipt.requested_url });
  const classifiedSourceType =
    classification.rule_hint === 'no-rule-match'
      ? extraction.source_type
      : classification.source_type;

  // Apply L1 override layer (Component A, v0.4). Effective values dominate
  // classifier + extractor output. rule_hint and precedence_level are preserved
  // from the classifier — they record evidence, NOT override status.
  const baseForEffective = {
    source_id: receipt.source_id,
    source_type: classifiedSourceType,
    publisher: extraction.publisher,
  };
  const resolvedSourceType = getEffectiveSourceType(baseForEffective, overrides);
  const resolvedPublisher = getEffectivePublisher(baseForEffective, overrides);

  const card = SourceCardSchema.parse({
    source_id: receipt.source_id,
    receipt_id: receipt.receipt_id,
    section_id: receipt.section_id,
    url: receipt.requested_url,
    final_url: receipt.final_url,
    fetched_at: receipt.fetched_at,
    publisher: resolvedPublisher,
    published_at: extraction.published_at,
    title: extraction.title,
    source_type: resolvedSourceType,
    relevance: extraction.relevance,
    key_points: extraction.key_points,
    limitations: extraction.limitations,
    asserts: extraction.asserts,
    scope: extraction.scope,
    not: extraction.not,
    extracted_by: extractedBy,
    extracted_at: new Date().toISOString(),
    rule_hint: classification.rule_hint,
    precedence_level: classification.precedence_level,
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

/**
 * A-008 — batched section-source-id appender.
 *
 * Reads the existing sources.jsonl once on creation; an in-memory Set
 * deduplicates across calls; flush() emits all queued new ids in a single
 * appendFile call. This is the only supported way to append source_ids
 * to a section's sources.jsonl — use it for both single-shot and loop
 * append patterns.
 */
export async function createSectionSourceIdAppender(
  packPath: string,
  sectionId: string,
): Promise<{ add: (id: string) => boolean; flush: () => Promise<void> }> {
  const path = join(packPath, 'sections', sectionId, 'sources.jsonl');
  if (!existsSync(path)) {
    await writeFile(path, '', 'utf8');
  }
  const existing = await readFile(path, 'utf8');
  const seen = new Set(
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
  const queued: string[] = [];
  return {
    add(id: string): boolean {
      if (seen.has(id)) return false;
      seen.add(id);
      queued.push(id);
      return true;
    },
    async flush(): Promise<void> {
      if (queued.length === 0) return;
      const now = new Date().toISOString();
      const payload =
        queued.map((id) => JSON.stringify({ source_id: id, added_at: now })).join('\n') + '\n';
      await appendFile(path, payload, 'utf8');
      queued.length = 0;
    },
  };
}
