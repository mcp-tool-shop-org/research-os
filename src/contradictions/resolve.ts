import { appendFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { SectionNotFoundError } from '../errors.js';
import {
  ContradictionResolutionSchema,
  type ContradictionResolution,
  type ResolutionStatus,
} from './resolution-schema.js';

export interface ResolveOptions {
  sectionId: string;
  packPath: string;
  /** Specific contradiction IDs to resolve. Mutually exclusive with `all`. */
  contradictionIds?: string[];
  /** Resolve all currently-unresolved contradictions in the section. */
  all?: boolean;
  /** Target status — cannot be 'unresolved' (use the candidates file for that default). */
  status: Exclude<ResolutionStatus, 'unresolved'>;
  reason: string;
  resolvedBy?: string;
}

export interface ResolveResult {
  sectionId: string;
  applied: number;
  skipped: number;
  ledgerPath: string;
}

function latestEffectiveStatuses(ledgerPath: string, text: string): Map<string, string> {
  const entries: Array<{ contradiction_id: string; status: string; resolved_at: string }> = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      if (
        typeof obj['contradiction_id'] === 'string' &&
        typeof obj['status'] === 'string' &&
        typeof obj['resolved_at'] === 'string'
      ) {
        entries.push({
          contradiction_id: obj['contradiction_id'],
          status: obj['status'],
          resolved_at: obj['resolved_at'],
        });
      }
    } catch {
      // skip malformed
    }
  }
  entries.sort((a, b) => a.resolved_at.localeCompare(b.resolved_at));
  const map = new Map<string, string>();
  for (const e of entries) map.set(e.contradiction_id, e.status);
  return map;
}

export async function resolve(options: ResolveOptions): Promise<ResolveResult> {
  const { sectionId, packPath, contradictionIds, all, status, reason, resolvedBy = 'operator' } = options;

  if (reason.length < 4) {
    throw new Error('reason must be at least 4 characters');
  }

  const sectionDir = join(packPath, 'sections', sectionId);
  if (!existsSync(sectionDir)) {
    throw new SectionNotFoundError(sectionId);
  }

  const candidatesPath = join(sectionDir, 'contradictions.jsonl');
  const ledgerPath = join(sectionDir, 'contradiction-resolutions.jsonl');

  // Load known contradiction IDs and their candidate statuses
  const candidates: Array<{ contradiction_id: string; status: string }> = [];
  if (existsSync(candidatesPath)) {
    const text = await readFile(candidatesPath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        if (typeof obj['contradiction_id'] === 'string') {
          candidates.push({
            contradiction_id: obj['contradiction_id'],
            status: typeof obj['status'] === 'string' ? obj['status'] : 'unresolved',
          });
        }
      } catch {
        // skip malformed
      }
    }
  }

  // Load current effective statuses from ledger (latest-wins)
  const existingResolutions = existsSync(ledgerPath)
    ? latestEffectiveStatuses(ledgerPath, await readFile(ledgerPath, 'utf8'))
    : new Map<string, string>();

  const knownIds = new Set(candidates.map((c) => c.contradiction_id));

  // Determine target IDs
  let targetIds: string[];
  if (all) {
    targetIds = candidates
      .filter((c) => {
        const effective = existingResolutions.get(c.contradiction_id);
        return effective !== undefined ? effective === 'unresolved' : c.status === 'unresolved';
      })
      .map((c) => c.contradiction_id);
  } else {
    targetIds = contradictionIds ?? [];
  }

  const resolvedAt = new Date().toISOString();
  let applied = 0;
  let skipped = 0;
  const lines: string[] = [];

  for (const cid of targetIds) {
    if (!knownIds.has(cid)) {
      skipped++;
      continue;
    }
    const entry: ContradictionResolution = {
      contradiction_id: cid,
      status,
      reason,
      resolved_at: resolvedAt,
      resolved_by: resolvedBy,
    };
    ContradictionResolutionSchema.parse(entry);
    lines.push(JSON.stringify(entry));
    applied++;
  }

  if (lines.length > 0) {
    await appendFile(ledgerPath, lines.join('\n') + '\n', 'utf8');
  }

  return { sectionId, applied, skipped, ledgerPath };
}
