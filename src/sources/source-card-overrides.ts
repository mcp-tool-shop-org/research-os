/**
 * Source-card override ledger reader/writer — v0.4 Component A.
 *
 * File: <packPath>/evidence/source-card-overrides.jsonl (JSONL, one record per line).
 * readOverrides returns [] for missing files (frozen-pack-compatible).
 * appendOverride validates before writing; creates parent directory on first write.
 * Bad lines fail visibly with line-number + content context (no quarantine convention
 * found in src/closure-ledger/ — throw is the project standard there too).
 *
 * Mirrors appendFetchLog / writeSourceCard conventions in cards.ts.
 */
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

import {
  validateSourceCardOverride,
  type SourceCardOverride,
} from './source-card-overrides-schema.js';

export type { SourceCardOverride };

const OVERRIDES_FILE = 'source-card-overrides.jsonl';

function overridesPath(packPath: string): string {
  return join(packPath, 'evidence', OVERRIDES_FILE);
}

export async function readOverrides(packPath: string): Promise<SourceCardOverride[]> {
  const filePath = overridesPath(packPath);
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
        `source-card-overrides.jsonl: malformed JSON at line ${lineNum}: ${line.slice(0, 120)}`,
      );
    }
    try {
      return validateSourceCardOverride(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `source-card-overrides.jsonl: invalid override at line ${lineNum}: ${msg}\n  Content: ${line.slice(0, 120)}`,
        { cause: err },
      );
    }
  });
}

export async function appendOverride(
  packPath: string,
  override: SourceCardOverride,
): Promise<void> {
  validateSourceCardOverride(override);
  const filePath = overridesPath(packPath);
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, JSON.stringify(override) + '\n', 'utf8');
}
