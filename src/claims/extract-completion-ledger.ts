/**
 * R-015 — Per-source extract completion ledger (v0.12 Slice 4).
 *
 * File: <packPath>/evidence/extract-completion.jsonl (JSONL, one record per
 * successful per-source extraction, append-only). Mirrors rescue-ledger.ts
 * and scope-repairs.ts (Pattern 2 — Law 15 append-only audit-trail).
 *
 * Records ONLY successful extractions. Failed extractions (TIER_TIMEOUT, MCP
 * error, validation failure, etc.) do NOT write to this ledger and are
 * re-attempted on `claim extract --resume`. Sources skipped at the per-source
 * pre-extract gates (no card, no excerpts, severity quarantine) also do NOT
 * write to this ledger — they re-evaluate their gate on the next run.
 *
 * The ledger is ALWAYS written when an extraction succeeds, regardless of
 * whether the operator passed --resume or --progress. The flags only change
 * CONSUMPTION of the ledger (--resume) and per-source visibility (--progress).
 *
 * Each record is keyed by (section_id, source_id) — a source can be in
 * multiple sections, and completing extraction in section A must NOT cause
 * resume to skip the same source in section B. extraction_attempt counts the
 * number of prior successful entries for the same (section, source) pair and
 * monotonically increments per successive successful run.
 *
 * Schema co-located in this file (no separate schema module) — same
 * R-012/R-013/R-014 precedent that keeps slice file budgets tight.
 */
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { z } from 'zod';

const LEDGER_FILE = 'extract-completion.jsonl';

export const ExtractCompletionRecordSchema = z.object({
  source_id: z.string().regex(/^src_[a-f0-9]{12}$/),
  section_id: z.string().regex(/^[0-9]{2}-[a-z0-9-]+$/),
  completed_at: z.string().refine((v) => Number.isFinite(Date.parse(v)), {
    message: 'completed_at must be a valid ISO 8601 timestamp',
  }),
  claim_count: z.number().int().nonnegative(),
  extraction_attempt: z.number().int().positive(),
  research_os_version: z.string().min(1),
  duration_ms: z.number().int().nonnegative(),
});

export type ExtractCompletionRecord = z.infer<typeof ExtractCompletionRecordSchema>;

export function validateExtractCompletionRecord(input: unknown): ExtractCompletionRecord {
  return ExtractCompletionRecordSchema.parse(input);
}

export function extractCompletionLedgerPath(packPath: string): string {
  return join(packPath, 'evidence', LEDGER_FILE);
}

/**
 * Read the completion ledger. Returns [] when the file is absent (the common
 * first-run case). Malformed JSON lines are skipped silently (matches
 * fetch-log.jsonl / claims.jsonl reader tolerance — supplementary audit data
 * never aborts the extract pipeline).
 */
export async function readExtractCompletionLedger(
  packPath: string,
): Promise<ExtractCompletionRecord[]> {
  const filePath = extractCompletionLedgerPath(packPath);
  if (!existsSync(filePath)) return [];

  const content = await readFile(filePath, 'utf8');
  const records: ExtractCompletionRecord[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const result = ExtractCompletionRecordSchema.safeParse(parsed);
    if (result.success) records.push(result.data);
  }
  return records;
}

/**
 * Collect the set of source IDs that have at least one successful completion
 * entry for the given section. Used by `--resume` to skip already-extracted
 * sources. Partial-failure recovery: a source attempted-but-failed has no
 * ledger entry and so will NOT appear in this set — it gets re-attempted on
 * the next run, as the kickoff acceptance test R-015.3 mandates.
 */
export function getCompletedSourceIdsForSection(
  records: ExtractCompletionRecord[],
  sectionId: string,
): Set<string> {
  const set = new Set<string>();
  for (const r of records) {
    if (r.section_id === sectionId) set.add(r.source_id);
  }
  return set;
}

/**
 * Compute the extraction_attempt counter for the next ledger entry. Counts
 * prior successful entries for the same (section, source) and returns
 * count + 1. First-time extractions return 1.
 */
export function getNextExtractionAttempt(
  records: ExtractCompletionRecord[],
  sectionId: string,
  sourceId: string,
): number {
  let count = 0;
  for (const r of records) {
    if (r.section_id === sectionId && r.source_id === sourceId) count += 1;
  }
  return count + 1;
}

/**
 * Append a completion record. Validates the record before writing and creates
 * the evidence/ directory on first write. Appends are atomic at the OS level
 * for JSONL records small enough to fit in a single write buffer.
 */
export async function appendExtractCompletionRecord(
  packPath: string,
  record: ExtractCompletionRecord,
): Promise<void> {
  validateExtractCompletionRecord(record);
  const filePath = extractCompletionLedgerPath(packPath);
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, JSON.stringify(record) + '\n', 'utf8');
}

/**
 * Format a per-source progress line for stderr emission. Kept here so the
 * extract orchestrator and tests share one line shape.
 */
export function formatProgressLine(
  phase: 'start' | 'done' | 'fail' | 'skip',
  index: number,
  total: number,
  sourceId: string,
  detail?: string,
): string {
  if (phase === 'skip') {
    return detail ? `[skip] ${sourceId} (${detail})` : `[skip] ${sourceId}`;
  }
  const prefix = `[extract ${index}/${total}]`;
  if (phase === 'start') return `${prefix} ${sourceId} starting...`;
  if (phase === 'done') return `${prefix} ${sourceId} done — ${detail ?? ''}`;
  return `${prefix} ${sourceId} failed — ${detail ?? ''}`;
}
