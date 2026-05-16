/**
 * R-013 — Source-card rebuild orchestrator + append-only ledger (v0.12 Slice 2).
 *
 * Closes the C2 + C3 architectural-trap pair surfaced by the
 * operator-aloneness DST gate v0.3 run:
 *
 *   C2: buildCard() bakes overrides during gather only; post-audit
 *       override-apply requires manual re-gather to materialize the
 *       override into the persisted card JSON.
 *
 *   C3: heuristic reviewer reads raw card.source_type (not
 *       getEffectiveSourceType()) so unbaked overrides still penalize
 *       the claim until the operator does a full re-gather.
 *
 * R-013 fixes the producer side of the trap: re-route persisted cards
 * through the SAME `buildCard()` function `gather` uses, with current
 * ledger overrides applied, on the cached body — NO re-fetch. The
 * reviewer's raw-read pattern stays unchanged; what changes is that
 * the raw fields the reviewer reads are now consistent with the
 * override state.
 *
 *   Behaviour law (load-bearing, do not relax):
 *   R-013 does not weaken any source-card defense. It propagates
 *   effective source-card fields into the persisted card raw JSON
 *   by re-running the same buildCard() function gather uses, with
 *   current overrides applied, without re-fetching the source body.
 *   Reviewer behaviour is unchanged; what changes is that the raw
 *   fields the reviewer reads are now consistent with the override
 *   state.
 *
 * Defense-floor invariant: rebuild MUST NOT silently strip
 * severities. R-003 / R-005 / R-009 still fire on the cached body
 * during rebuild; only explicit `clear_severities[]` in an override
 * removes a severity at audit-time consumption (via
 * getEffectiveSeverities). The rebuild ledger's `before` and `after`
 * severity arrays are the RAW detectSeverities output — that's the
 * audit-trail evidence that the body still signals what it signals.
 *
 * Co-located schema + read/write + orchestrator follow the
 * rescue-ledger.ts precedent (R-012, v0.12 Slice 1) — three concerns
 * that all share the same ledger file path and the same
 * eligibility-recheck pattern cohere as one module.
 */
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

import { z } from 'zod';

import { ResearchOSError } from '../errors.js';
import { RESEARCH_OS_VERSION } from '../index.js';
import { buildCard } from './cards.js';
import {
  loadLatestReceipts,
  loadRawText,
  loadSeverityThresholds,
} from './source-card-audit.js';
import { readOverrides } from './source-card-overrides.js';
import type { SourceCardOverride } from './source-card-overrides-schema.js';
import { SourceCardSchema, SourceTypeSchema, type SourceCard } from './schema.js';
import {
  detectSeverities,
  SOURCE_SEVERITIES,
  type SeverityFinding,
} from './severities.js';
import type { ExtractionResult } from './types.js';

const LEDGER_FILE = 'source-card-rebuilds.jsonl';

// ─── Schema ──────────────────────────────────────────────────────────────────

const SeverityFindingSchema = z.object({
  severity: z.enum([...SOURCE_SEVERITIES] as [string, ...string[]]),
  reasons: z.array(z.string()),
});

const OverrideSummarySchema = z.object({
  source_id: z.string().min(1),
  new_source_type: SourceTypeSchema.nullable().optional(),
  new_publisher: z.string().nullable().optional(),
  clear_severities: z.array(z.string()).optional(),
  created_at: z.string(),
});

const CardSnapshotSchema = z.object({
  source_type: SourceTypeSchema,
  publisher: z.string().nullable(),
  severities: z.array(SeverityFindingSchema),
});

export const RebuildLedgerRecordSchema = z.object({
  rebuild_id: z.string().regex(/^rbld_[a-z0-9]+_\d+$/),
  card_id: z.string().regex(/^src_[a-f0-9]{12}$/),
  overrides_applied: z.array(OverrideSummarySchema),
  before: CardSnapshotSchema,
  after: CardSnapshotSchema,
  changed_fields: z.array(z.enum(['source_type', 'publisher', 'severities'])),
  rebuilt_by: z.enum(['operator', 'system']),
  rebuilt_at: z.string().refine((v) => Number.isFinite(Date.parse(v)), {
    message: 'rebuilt_at must be a valid ISO 8601 timestamp',
  }),
  research_os_version: z.string().min(1),
});

export type RebuildLedgerRecord = z.infer<typeof RebuildLedgerRecordSchema>;

export function validateRebuildLedgerRecord(input: unknown): RebuildLedgerRecord {
  return RebuildLedgerRecordSchema.parse(input);
}

export function rebuildLedgerPath(packPath: string): string {
  return join(packPath, 'evidence', LEDGER_FILE);
}

// ─── Ledger r/w ──────────────────────────────────────────────────────────────

export async function readRebuildLedger(
  packPath: string,
): Promise<RebuildLedgerRecord[]> {
  const filePath = rebuildLedgerPath(packPath);
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
        `${LEDGER_FILE}: malformed JSON at line ${lineNum}: ${line.slice(0, 120)}`,
      );
    }
    try {
      return validateRebuildLedgerRecord(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `${LEDGER_FILE}: invalid record at line ${lineNum}: ${msg}\n  Content: ${line.slice(0, 120)}`,
        { cause: err },
      );
    }
  });
}

export async function appendRebuildLedgerRecord(
  packPath: string,
  record: RebuildLedgerRecord,
): Promise<void> {
  validateRebuildLedgerRecord(record);
  const filePath = rebuildLedgerPath(packPath);
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, JSON.stringify(record) + '\n', 'utf8');
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function buildExtractionFromCard(
  card: SourceCard,
): Extract<ExtractionResult, { ok: true }> {
  // Reconstruct the extractor's view from the persisted card. The persisted
  // card has the override-baked source_type / publisher; buildCard's override
  // layer is idempotent (latest-wins per field), so feeding the baked value
  // back is correct — the layer re-resolves against current overrides and
  // produces the freshly-effective values.
  return {
    ok: true,
    publisher: card.publisher,
    published_at: card.published_at,
    title: card.title,
    source_type: card.source_type,
    relevance: card.relevance,
    key_points: card.key_points,
    limitations: card.limitations,
    asserts: card.asserts,
    scope: card.scope,
    not: card.not,
  };
}

function makeRebuildId(now: Date): string {
  // Format mirrors receipt_id (rcpt_<rand>_<seq>): rbld_<rand>_<ms>.
  // randomBytes(6) → 12 lowercase hex chars; rebuilt_at ms makes IDs
  // sortable and unique enough for append-only audit-trail use.
  const rand = randomBytes(6).toString('hex');
  const ms = now.getTime();
  return `rbld_${rand}_${ms}`;
}

function summariseOverride(o: SourceCardOverride): z.infer<typeof OverrideSummarySchema> {
  const out: z.infer<typeof OverrideSummarySchema> = {
    source_id: o.source_id,
    created_at: o.created_at,
  };
  if (Object.prototype.hasOwnProperty.call(o, 'new_source_type')) {
    out.new_source_type = o.new_source_type ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(o, 'new_publisher')) {
    out.new_publisher = o.new_publisher ?? null;
  }
  if (Array.isArray(o.clear_severities) && o.clear_severities.length > 0) {
    out.clear_severities = [...o.clear_severities];
  }
  return out;
}

function sameSeverityList(a: SeverityFinding[], b: SeverityFinding[]): boolean {
  if (a.length !== b.length) return false;
  // Compare as ordered list — detectSeverities emits a stable order per
  // input. If the rebuild produces a different order, that's still a change
  // worth recording.
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.severity !== b[i]!.severity) return false;
    const ar = a[i]!.reasons;
    const br = b[i]!.reasons;
    if (ar.length !== br.length) return false;
    for (let j = 0; j < ar.length; j++) {
      if (ar[j] !== br[j]) return false;
    }
  }
  return true;
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

export interface RebuildResult {
  /** Total cards considered (cards directory enumeration). */
  rebuilt: number;
  /** Cards whose raw on-disk JSON changed during rebuild. */
  changed: number;
  /** Cards rebuilt with changed_fields=[] (idempotent runs). */
  unchanged: number;
  /** Cards without a fetch-log receipt (cannot rebuild without cached metadata). */
  skipped: number;
  /** Ledger entries written this run. */
  events: RebuildLedgerRecord[];
}

/**
 * Rebuild source cards in a pack: re-route each card through buildCard()
 * with the CURRENT override ledger applied, on the CACHED body (no
 * HTTP). Persist any card whose raw source_type / publisher changed.
 * Append one ledger entry per card considered (changed or not — every
 * rebuild is auditable).
 *
 * Refuses frozen packs (mirrors applySourceCardOverrides) and packs
 * missing the source-cards directory.
 *
 * The rebuild is OPT-IN — callers must explicitly invoke this function
 * (or pass --rebuild-cards on the CLI). The existing
 * applySourceCardOverrides path is unchanged: it only writes to the
 * override ledger and never mutates the persisted card JSON. The C2 +
 * C3 trap is still POSSIBLE if the operator does not opt in; R-013
 * provides the operator-facing surface to close it.
 */
export async function rebuildSourceCards(args: {
  packPath: string;
  /** Defaults to 'operator' (CLI invocation). */
  rebuiltBy?: 'operator' | 'system';
  /** Inject for deterministic tests. Defaults to new Date(). */
  now?: Date;
}): Promise<RebuildResult> {
  const { packPath } = args;
  const rebuiltBy = args.rebuiltBy ?? 'operator';
  const nowDate = args.now ?? new Date();

  // ── Refuse frozen packs ────────────────────────────────────────────────
  const freezeReceipt = join(packPath, 'audits', 'freeze-receipt.json');
  if (existsSync(freezeReceipt)) {
    throw new ResearchOSError(
      `Cannot rebuild source cards on a frozen pack. audits/freeze-receipt.json is present (pack: ${packPath}).`,
      'SYNTHESIS_NOT_READY',
      `Use a fresh (non-frozen) copy of the pack for operator rebuilds, or run \`research-os invalidate extraction --reason "..."\` to clear frozen_at before rebuilding. See handbook/recovery.md.`,
    );
  }

  // ── Load cards ─────────────────────────────────────────────────────────
  const cardsDir = join(packPath, 'evidence', 'source-cards');
  if (!existsSync(cardsDir)) {
    throw new ResearchOSError(
      `Pack directory does not contain evidence/source-cards/: ${packPath}`,
      'PACK_NOT_FOUND',
      `Run \`research-os gather <section>\` to produce source cards before rebuilding. See handbook/recovery.md.`,
    );
  }

  const entries = await readdir(cardsDir);
  const cardFiles = entries.filter((f) => f.endsWith('.json'));

  const cards: SourceCard[] = [];
  for (const file of cardFiles) {
    const raw = await readFile(join(cardsDir, file), 'utf8');
    cards.push(SourceCardSchema.parse(JSON.parse(raw)));
  }

  // ── Load ledger / receipts / thresholds ────────────────────────────────
  const overrides = await readOverrides(packPath);
  const receipts = await loadLatestReceipts(packPath);
  const thresholds = await loadSeverityThresholds(packPath);

  let changedCount = 0;
  let unchangedCount = 0;
  let skippedCount = 0;
  const events: RebuildLedgerRecord[] = [];

  for (const card of cards) {
    const receipt = receipts.get(card.source_id) ?? null;
    if (!receipt) {
      // Without a fetch-log receipt we lack cached body + metadata
      // (byte_count / content_type / fetch_duration_ms) for severity
      // detection. Skip rather than synthesize — the rebuild's
      // promise is "use cached fetch metadata," not "fabricate it."
      skippedCount++;
      continue;
    }

    const rawText = await loadRawText(packPath, receipt);

    // BEFORE — raw detectSeverities output on the current persisted card.
    const beforeSeverities = detectSeverities({
      card,
      rawText,
      byteCount: receipt.byte_count,
      contentType: receipt.content_type,
      fetchDurationMs: receipt.fetch_duration_ms ?? null,
      thresholds,
    });

    // Re-invoke buildCard via the SAME function gather uses. The override
    // layer is applied INSIDE buildCard via getEffectiveSourceType /
    // getEffectivePublisher — no manual card-JSON mutation here.
    const extraction = buildExtractionFromCard(card);
    const newCard = buildCard({
      receipt,
      extraction,
      extractedBy: card.extracted_by,
      overrides,
    });

    // AFTER — raw detectSeverities output on the rebuilt card. The card
    // content fields (title / asserts / key_points / etc.) come straight
    // through extraction unchanged, so R-005 / R-009 signals should be
    // stable across rebuild; capturing both before AND after is the
    // audit-trail evidence that no silent strip occurred.
    const afterSeverities = detectSeverities({
      card: newCard,
      rawText,
      byteCount: receipt.byte_count,
      contentType: receipt.content_type,
      fetchDurationMs: receipt.fetch_duration_ms ?? null,
      thresholds,
    });

    const changedFields: Array<'source_type' | 'publisher' | 'severities'> = [];
    if (newCard.source_type !== card.source_type) changedFields.push('source_type');
    if (newCard.publisher !== card.publisher) changedFields.push('publisher');
    if (!sameSeverityList(beforeSeverities, afterSeverities)) {
      changedFields.push('severities');
    }

    // Persist the new card only when raw fields changed. This is what
    // makes the second + third invocations of rebuild byte-identical:
    // the no-change branch never writes to disk.
    if (changedFields.length > 0) {
      const cardPath = join(cardsDir, `${card.source_id}.json`);
      await writeFile(cardPath, JSON.stringify(newCard, null, 2), 'utf8');
      changedCount++;
    } else {
      unchangedCount++;
    }

    const matchingOverrides = overrides
      .filter((o) => o.source_id === card.source_id)
      .map(summariseOverride);

    const record: RebuildLedgerRecord = {
      rebuild_id: makeRebuildId(nowDate),
      card_id: card.source_id,
      overrides_applied: matchingOverrides,
      before: {
        source_type: card.source_type,
        publisher: card.publisher,
        severities: beforeSeverities,
      },
      after: {
        source_type: newCard.source_type,
        publisher: newCard.publisher,
        severities: afterSeverities,
      },
      changed_fields: changedFields,
      rebuilt_by: rebuiltBy,
      rebuilt_at: nowDate.toISOString(),
      research_os_version: RESEARCH_OS_VERSION,
    };
    await appendRebuildLedgerRecord(packPath, record);
    events.push(record);
  }

  return {
    rebuilt: cards.length,
    changed: changedCount,
    unchanged: unchangedCount,
    skipped: skippedCount,
    events,
  };
}
