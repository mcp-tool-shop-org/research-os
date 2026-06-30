import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { chunkKeyPoints, chunkRawText } from './chunk.js';
import { ExcerptSchema, type Excerpt, type ExcerptOrigin } from './schema.js';
import type { SourceCard } from '../schema.js';

export function ledgerPathFor(packPath: string, sourceId: string): string {
  return join(packPath, 'evidence', 'excerpts', `${sourceId}.jsonl`);
}

function makeExcerptId(sourceId: string, index: number): string {
  // 1-indexed, zero-padded to at least 3 digits.
  const idx = String(index).padStart(3, '0');
  // Source IDs are always src_<12 hex>; strip the prefix so excerpts mirror the hex.
  const hex = sourceId.replace(/^src_/, '');
  return `ex_${hex}_${idx}`;
}

async function readLedger(path: string): Promise<Excerpt[]> {
  const text = await readFile(path, 'utf8');
  const out: Excerpt[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(ExcerptSchema.parse(JSON.parse(line)));
    } catch {
      /* skip malformed line — append-only ledgers tolerate corrupt tails */
    }
  }
  return out;
}

async function writeLedger(path: string, excerpts: Excerpt[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const body = excerpts.map((e) => JSON.stringify(e)).join('\n') + (excerpts.length > 0 ? '\n' : '');
  await writeFile(path, body, 'utf8');
}

export interface LoadOrBuildArgs {
  packPath: string;
  sourceCard: SourceCard;
  sourceHash: string | null;
  rawText: string | null;
  now?: () => string;
}

export interface LoadOrBuildResult {
  excerpts: Excerpt[];
  origin: ExcerptOrigin | 'mixed';
  built: boolean;
}

// Returns the excerpt ledger for a source. If it already exists on disk, load
// it (deterministic input → already-deterministic ledger). Otherwise build it
// from raw text when available, falling back to source card key_points.
export async function loadOrBuildLedger(args: LoadOrBuildArgs): Promise<LoadOrBuildResult> {
  const { packPath, sourceCard, sourceHash, rawText } = args;
  const now = args.now ?? (() => new Date().toISOString());
  const path = ledgerPathFor(packPath, sourceCard.source_id);

  if (existsSync(path)) {
    const excerpts = await readLedger(path);
    if (excerpts.length > 0) {
      // B-SOURCES-001/003 — integrity guard. The on-disk ledger is reused only
      // when its stored source_hash still matches the incoming sourceHash
      // (current receipt.sha256). On a content-changed re-gather of the same
      // URL, the claims will cite the NEW source_hash but the cached excerpts
      // were derived from OLD content — silently weakening tamper-detection.
      // When the incoming hash is non-null and ANY loaded excerpt carries a
      // differing source_hash, treat the ledger as STALE and fall through to
      // rebuild from current rawText/key_points. (Excerpts with a null stored
      // hash predate hashing and are not treated as a mismatch.)
      // B-SOURCES-001/003 — integrity guard. The on-disk ledger is reused only
      // when its stored source_hash still matches the incoming sourceHash
      // (current receipt.sha256). On a content-changed re-gather of the same
      // URL, the claims will cite the NEW source_hash but the cached excerpts
      // were derived from OLD content — silently weakening tamper-detection.
      // When the incoming hash is non-null and ANY loaded excerpt carries a
      // differing source_hash, treat the ledger as STALE and fall through to
      // rebuild from current rawText/key_points. (Excerpts with a null stored
      // hash predate hashing and are not treated as a mismatch.)
      const stale =
        sourceHash !== null &&
        excerpts.some((e) => e.source_hash !== null && e.source_hash !== sourceHash);
      if (!stale) {
        const origins = new Set(excerpts.map((e) => e.origin));
        const origin: ExcerptOrigin | 'mixed' = origins.size === 1 ? (excerpts[0]!.origin) : 'mixed';
        return { excerpts, origin, built: false };
      }
    }
  }

  let drafts;
  let origin: ExcerptOrigin;
  if (rawText && rawText.trim().length > 0) {
    drafts = chunkRawText(rawText).drafts;
    origin = 'raw_text';
  }
  if (!drafts || drafts.length === 0) {
    drafts = chunkKeyPoints(sourceCard.key_points);
    origin = 'key_point';
  }

  const createdAt = now();
  const excerpts: Excerpt[] = drafts.map((d, i) => ({
    excerpt_id: makeExcerptId(sourceCard.source_id, i + 1),
    source_id: sourceCard.source_id,
    source_hash: sourceHash,
    text: d.text,
    location_hint: d.location_hint,
    char_start: d.char_start,
    char_end: d.char_end,
    origin: origin!,
    created_at: createdAt,
  }));

  await writeLedger(path, excerpts);

  return { excerpts, origin: origin!, built: true };
}

// Render excerpts in the order the model will see them.
export function renderLedgerForPrompt(excerpts: Excerpt[]): string {
  return excerpts
    .map((e) => `${e.excerpt_id}${e.location_hint ? ` (${e.location_hint})` : ''}: ${e.text}`)
    .join('\n');
}

export function buildExcerptIndex(excerpts: Excerpt[]): Map<string, Excerpt> {
  const index = new Map<string, Excerpt>();
  for (const e of excerpts) index.set(e.excerpt_id, e);
  return index;
}
