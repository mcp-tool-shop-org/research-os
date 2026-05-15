/**
 * v0.10 Slice 2 — R-001: claim-scope-repairs ledger reader/writer.
 *
 * File: <packPath>/evidence/claim-scope-repairs.jsonl (JSONL, one record per line).
 * Mirrors source-card-overrides.ts (Pattern 2 — Law 15 append-only audit-trail).
 *
 * readScopeRepairs returns [] for missing files (frozen-pack-compatible).
 * appendScopeRepair validates before writing; creates the parent directory
 * on first write. Bad lines fail visibly with line-number + content context
 * — same discipline as the source-card-overrides reader.
 */
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

import {
  validateScopeRepair,
  type ScopeRepair,
} from './scope-repairs-schema.js';

export type { ScopeRepair };

const LEDGER_FILE = 'claim-scope-repairs.jsonl';

export function scopeRepairsLedgerPath(packPath: string): string {
  return join(packPath, 'evidence', LEDGER_FILE);
}

export async function readScopeRepairs(packPath: string): Promise<ScopeRepair[]> {
  const filePath = scopeRepairsLedgerPath(packPath);
  if (!existsSync(filePath)) return [];

  const content = await readFile(filePath, 'utf8');
  const lines = content.split(/\r?\n/).filter(Boolean);

  return lines.map((line, idx) => {
    const lineNum = idx + 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(
        `claim-scope-repairs.jsonl: malformed JSON at line ${lineNum}: ${line.slice(0, 120)}`,
      );
    }
    try {
      return validateScopeRepair(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `claim-scope-repairs.jsonl: invalid record at line ${lineNum}: ${msg}\n  Content: ${line.slice(0, 120)}`,
        { cause: err },
      );
    }
  });
}

export async function appendScopeRepair(
  packPath: string,
  record: ScopeRepair,
): Promise<void> {
  validateScopeRepair(record);
  const filePath = scopeRepairsLedgerPath(packPath);
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, JSON.stringify(record) + '\n', 'utf8');
}

/**
 * Latest-applied-scope wins per claim_id. Returns a Map keyed by claim_id
 * whose value is the most recent (by repaired_at) ScopeRepair record.
 * Operators reading the ledger to compute "what's currently on this claim"
 * use this helper instead of paging through the full record list.
 */
export function latestScopeRepairPerClaim(
  records: ScopeRepair[],
): Map<string, ScopeRepair> {
  const latest = new Map<string, ScopeRepair>();
  for (const rec of records) {
    const existing = latest.get(rec.claim_id);
    if (!existing || existing.repaired_at < rec.repaired_at) {
      latest.set(rec.claim_id, rec);
    }
  }
  return latest;
}
