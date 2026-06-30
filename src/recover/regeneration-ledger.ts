/**
 * R-014 — Recovery action-graph regeneration: state-hash + append-only ledger
 * + history archive helpers (v0.12 Slice 3).
 *
 * Closes the C4 trap surfaced by the operator-aloneness DST gate v0.3 run:
 *
 *   C4: recover advisor deterministic-fallback action_id misaligned —
 *       recommended `repair_claim_scope` when scope was already populated
 *       because the action graph's `accepted_claim_floor` heuristic OR'd
 *       `needs_scope_repair` with `needs_source_repair`, AND the existing
 *       `recovery/blocked-section-recovery.{json,md}` output stayed on
 *       disk reflecting pre-repair state with no operator-facing
 *       regenerate verb.
 *
 * Part 1 (in `action-graph.ts`) distinguishes the two repair shapes so the
 * recommendation routes by which shape dominates. This module covers
 * Part 2 (the operator-facing regenerate surface) + Part 3 (the
 * `input_state_hash` discriminator that detects when on-disk recovery
 * output has gone stale relative to current pack state).
 *
 *   Behaviour law (load-bearing, do not relax):
 *   R-014 does not change which recovery actions exist (closed
 *   RECOVERY_ACTIONS enum unchanged), the AI advisor prompt, or the
 *   verifier rules. It corrects the heuristic that recommends WHICH
 *   action by distinguishing repair shapes, and adds an operator-invocable
 *   surface (`recover pack --regenerate-action-graph`) to regenerate the
 *   recovery action graph against current pack state when the existing
 *   recommendation has become stale. Previous recovery records are
 *   preserved as history; the regenerate path is opt-in.
 *
 * Co-located state-hash + archive + ledger follow the rescue-ledger.ts
 * (R-012, Slice 1) / rebuild-ledger.ts (R-013, Slice 2) precedent — three
 * concerns that share the same audit-trail file path and the same
 * regenerate-or-skip discriminator pattern cohere as one module.
 */
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readdir, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

import { z } from 'zod';

import { RESEARCH_OS_VERSION } from '../index.js';
import {
  REGENERATION_REASONS,
  type HealthySectionResult,
  type RegenerationReason,
  type SectionDiagnosis,
} from './types.js';
import { RecoveryArtifactSchema } from './schema.js';
import type { RecoveryArtifact } from './types.js';

const LEDGER_FILE = 'regeneration-history.jsonl';
const HISTORY_SUBDIR = 'history';
const RECOVERY_DIR = 'recovery';
const RECOVERY_JSON = 'blocked-section-recovery.json';
const RECOVERY_MD = 'blocked-section-recovery.md';

// ─── State-hash (pure helper) ────────────────────────────────────────────────
//
// SHA-256 over a canonicalized projection of the per-section diagnoses. The
// hash changes if and only if the load-bearing recovery inputs change
// (failure shape, evidence_state counts, gate stage, blocking/waiveable
// flags). Wording-only fields (`section_purpose`, `detail`) are excluded so
// minor copy edits in diagnose.ts don't trip false "state changed"
// detections.

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    if (obj[key] === undefined) continue;
    out[key] = canonicalize(obj[key]);
  }
  return out;
}

export function computeInputStateHash(
  diagnoses: ReadonlyArray<SectionDiagnosis | HealthySectionResult>,
): string {
  const projection = diagnoses
    .slice()
    .sort((a, b) => a.section_id.localeCompare(b.section_id))
    .map((d) => {
      if ('status' in d && d.status === 'healthy') {
        return { section_id: d.section_id, status: 'healthy' as const };
      }
      const sd = d as SectionDiagnosis;
      return {
        section_id: sd.section_id,
        failure_shape: sd.failure_shape,
        blocking: sd.blocking,
        waiveable: sd.waiveable,
        stage: sd.stage,
        evidence_state: sd.evidence_state,
      };
    });
  const canonical = JSON.stringify(canonicalize(projection));
  return createHash('sha256').update(canonical).digest('hex');
}

// ─── Ledger schema + types ───────────────────────────────────────────────────

const SectionRecommendationDiffSchema = z.object({
  section_id: z.string().min(1),
  previous_action_id: z.string().nullable(),
  new_action_id: z.string().nullable(),
  changed: z.boolean(),
});

export const RegenerationLedgerRecordSchema = z.object({
  regeneration_id: z.string().regex(/^rgn_[a-f0-9]+_\d+$/),
  timestamp: z.string().refine((v) => Number.isFinite(Date.parse(v)), {
    message: 'timestamp must be a valid ISO 8601 timestamp',
  }),
  previous_state_hash: z.string().nullable(),
  new_state_hash: z.string().min(1),
  regeneration_reason: z.enum(REGENERATION_REASONS),
  advisor_paths: z.record(z.string(), z.number().int().nonnegative()),
  section_diffs: z.array(SectionRecommendationDiffSchema),
  archived_json_path: z.string().nullable(),
  archived_markdown_path: z.string().nullable(),
  research_os_version: z.string().min(1),
});

export type RegenerationLedgerRecord = z.infer<typeof RegenerationLedgerRecordSchema>;

export function validateRegenerationLedgerRecord(input: unknown): RegenerationLedgerRecord {
  return RegenerationLedgerRecordSchema.parse(input);
}

export function regenerationLedgerPath(packPath: string): string {
  return join(packPath, RECOVERY_DIR, LEDGER_FILE);
}

// ─── Ledger r/w ──────────────────────────────────────────────────────────────

export async function readRegenerationLedger(
  packPath: string,
): Promise<RegenerationLedgerRecord[]> {
  const filePath = regenerationLedgerPath(packPath);
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
      return validateRegenerationLedgerRecord(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `${LEDGER_FILE}: invalid record at line ${lineNum}: ${msg}\n  Content: ${line.slice(0, 120)}`,
        { cause: err },
      );
    }
  });
}

export async function appendRegenerationLedgerRecord(
  packPath: string,
  record: RegenerationLedgerRecord,
): Promise<void> {
  validateRegenerationLedgerRecord(record);
  const filePath = regenerationLedgerPath(packPath);
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, JSON.stringify(record) + '\n', 'utf8');
}

// ─── Existing-artifact reader ────────────────────────────────────────────────

/**
 * Load the prior recovery artifact (if any) from
 * `recovery/blocked-section-recovery.json`. Returns null when the file is
 * absent or unparseable — both cases are treated as "no usable prior
 * artifact" by the regenerate path. The regenerate-reason for unparseable
 * files is still `missing_input_hash` (best-effort recovery; the regenerate
 * path doesn't need to surface corruption beyond the staleness signal).
 */
export async function readExistingRecoveryArtifact(
  packPath: string,
): Promise<RecoveryArtifact | null> {
  const jsonPath = join(packPath, RECOVERY_DIR, RECOVERY_JSON);
  if (!existsSync(jsonPath)) return null;
  try {
    const raw = JSON.parse(await readFile(jsonPath, 'utf8'));
    return RecoveryArtifactSchema.parse(raw);
  } catch {
    return null;
  }
}

// ─── History archive ─────────────────────────────────────────────────────────

function safeTimestamp(now: Date): string {
  // ISO-8601 with ":" replaced by "-" so the result is a legal filename
  // segment on Windows + POSIX. We also drop the fractional-second part
  // for readability — collisions inside a single millisecond are protected
  // by the random regeneration_id, not the archive filename.
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
}

function hashPrefix(hash: string | null | undefined): string {
  if (!hash) return 'noprehash';
  return hash.slice(0, 8);
}

export interface ArchiveResult {
  archivedJsonPath: string | null;
  archivedMarkdownPath: string | null;
}

/**
 * Move the existing recovery/blocked-section-recovery.{json,md} files to
 * recovery/history/blocked-section-recovery-<timestamp>-<prefix>.{json,md}.
 * Both files are archived as a pair when present; either may be absent
 * (returns null for the absent one). The OLD state hash's first 8 chars
 * form the filename suffix so operators can correlate archived files with
 * the regeneration-history.jsonl entries.
 */
export async function archiveExistingRecoveryFiles(
  packPath: string,
  previousHash: string | null,
  now: Date = new Date(),
): Promise<ArchiveResult> {
  const recoverDir = join(packPath, RECOVERY_DIR);
  const historyDir = join(recoverDir, HISTORY_SUBDIR);
  await mkdir(historyDir, { recursive: true });

  const ts = safeTimestamp(now);
  const prefix = hashPrefix(previousHash);
  const archivedBase = `blocked-section-recovery-${ts}-${prefix}`;

  const oldJson = join(recoverDir, RECOVERY_JSON);
  const oldMd = join(recoverDir, RECOVERY_MD);
  const archivedJson = join(historyDir, `${archivedBase}.json`);
  const archivedMd = join(historyDir, `${archivedBase}.md`);

  let archivedJsonPath: string | null = null;
  let archivedMarkdownPath: string | null = null;

  if (existsSync(oldJson)) {
    await rename(oldJson, archivedJson);
    archivedJsonPath = archivedJson;
  }
  if (existsSync(oldMd)) {
    await rename(oldMd, archivedMd);
    archivedMarkdownPath = archivedMd;
  }

  return { archivedJsonPath, archivedMarkdownPath };
}

/**
 * NAMED COMPENSATOR for `archiveExistingRecoveryFiles`.
 *
 * The archive step is an irreversible rename of the canonical recovery files
 * into `recovery/history/`. If a later step in the regenerate path throws
 * AFTER the archive (e.g. write or ledger append fails), the canonical files
 * would otherwise be stranded in history with no replacement at their
 * canonical path and no ledger entry. This restores them: it renames the
 * archived files back to their canonical `recovery/blocked-section-recovery.{json,md}`
 * locations.
 *
 * Best-effort + idempotent: it restores an archived file (back to its canonical
 * path) whenever the archived source still exists. Crucially it OVERWRITES the
 * canonical path if a partial new artifact was already written there — a
 * post-archive failure (verifier follow-up: a throw DURING the ledger append,
 * after writeRecoveryArtifact already overwrote the canonical files) means the
 * regeneration did NOT complete (its ledger record was never written), so the
 * pre-regeneration original is the correct on-disk state. Either path may be
 * null (the corresponding file was absent at archive time) — those are skipped.
 * Idempotent because the archived source is renamed away on success, so a second
 * invocation finds nothing to restore. Restore failures are swallowed so the
 * original error propagates unmasked.
 *
 * Post-rollback state: the canonical recovery artifact is back at its path
 * exactly as it was before the failed regeneration; no orphaned history file
 * remains without a ledger entry.
 *
 * Owner: recover/run.ts recoverPack() regenerate path (A-RECOVER-001).
 */
export async function restoreArchivedRecoveryFiles(
  packPath: string,
  archive: ArchiveResult,
): Promise<void> {
  const recoverDir = join(packPath, RECOVERY_DIR);
  const canonicalJson = join(recoverDir, RECOVERY_JSON);
  const canonicalMd = join(recoverDir, RECOVERY_MD);

  const restore = async (
    archived: string | null,
    canonical: string,
  ): Promise<void> => {
    if (!archived) return;
    if (!existsSync(archived)) return;
    try {
      // Overwrite any partial new artifact at the canonical path: on a
      // post-archive failure the regeneration is incomplete (no ledger entry),
      // so the archived original must win. rm-then-rename is robust across
      // platforms where rename-over-existing is not guaranteed atomic.
      if (existsSync(canonical)) await rm(canonical, { force: true });
      await rename(archived, canonical);
    } catch {
      /* swallow — restore is best-effort; do not mask the original error */
    }
  };

  await restore(archive.archivedJsonPath, canonicalJson);
  await restore(archive.archivedMarkdownPath, canonicalMd);
}

// ─── Ledger record construction ──────────────────────────────────────────────

function makeRegenerationId(now: Date): string {
  // Format mirrors rebuild_id / rescue_id: rgn_<rand>_<ms>. randomBytes(6) →
  // 12 lowercase hex chars; ms makes IDs sortable and unique enough for
  // append-only audit-trail use.
  const rand = randomBytes(6).toString('hex');
  const ms = now.getTime();
  return `rgn_${rand}_${ms}`;
}

function recommendedActionId(artifact: RecoveryArtifact, section_id: string): string | null {
  const section = artifact.sections.find((s) => s.section_id === section_id);
  if (!section || !section.advice) return null;
  return section.advice.recommended_action.action_id;
}

function computeSectionDiffs(
  previous: RecoveryArtifact | null,
  current: RecoveryArtifact,
): Array<z.infer<typeof SectionRecommendationDiffSchema>> {
  const sectionIds = new Set<string>();
  for (const s of current.sections) sectionIds.add(s.section_id);
  if (previous) {
    for (const s of previous.sections) sectionIds.add(s.section_id);
  }
  const sorted = Array.from(sectionIds).sort();
  return sorted.map((section_id) => {
    const prevAction = previous ? recommendedActionId(previous, section_id) : null;
    const newAction = recommendedActionId(current, section_id);
    return {
      section_id,
      previous_action_id: prevAction,
      new_action_id: newAction,
      changed: prevAction !== newAction,
    };
  });
}

function computeAdvisorPathCounts(artifact: RecoveryArtifact): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const section of artifact.sections) {
    if (!section.advisor_path) continue;
    counts[section.advisor_path] = (counts[section.advisor_path] ?? 0) + 1;
  }
  return counts;
}

export interface BuildRegenerationLedgerInput {
  previousArtifact: RecoveryArtifact | null;
  currentArtifact: RecoveryArtifact;
  previousStateHash: string | null;
  newStateHash: string;
  regenerationReason: RegenerationReason;
  archive: ArchiveResult;
  now?: Date;
}

export function buildRegenerationLedgerRecord(
  input: BuildRegenerationLedgerInput,
): RegenerationLedgerRecord {
  const now = input.now ?? new Date();
  return validateRegenerationLedgerRecord({
    regeneration_id: makeRegenerationId(now),
    timestamp: now.toISOString(),
    previous_state_hash: input.previousStateHash,
    new_state_hash: input.newStateHash,
    regeneration_reason: input.regenerationReason,
    advisor_paths: computeAdvisorPathCounts(input.currentArtifact),
    section_diffs: computeSectionDiffs(input.previousArtifact, input.currentArtifact),
    archived_json_path: input.archive.archivedJsonPath,
    archived_markdown_path: input.archive.archivedMarkdownPath,
    research_os_version: RESEARCH_OS_VERSION,
  });
}

// ─── History directory enumeration (test + observability helper) ─────────────

/**
 * List archived recovery files under `recovery/history/`. Each entry is a
 * pair of (json, markdown) keyed by their shared base filename. Used by
 * R-014 tests to assert archive accumulation across multiple regenerations.
 */
export async function listRecoveryHistory(packPath: string): Promise<string[]> {
  const historyDir = join(packPath, RECOVERY_DIR, HISTORY_SUBDIR);
  if (!existsSync(historyDir)) return [];
  const entries = await readdir(historyDir);
  return entries.slice().sort();
}

// ─── Reason classifier ───────────────────────────────────────────────────────

/**
 * Pure classifier — given the prior artifact (or null) and current hash,
 * return the regeneration_reason that explains why a regenerate run should
 * (or shouldn't) write new files. Returns null when the existing artifact's
 * hash matches the current hash, signalling the "no regeneration needed"
 * clean-exit path.
 */
export function classifyRegenerationReason(args: {
  previousArtifact: RecoveryArtifact | null;
  currentStateHash: string;
}): RegenerationReason | null {
  const { previousArtifact, currentStateHash } = args;
  if (!previousArtifact) return 'no_prior_artifact';
  if (!previousArtifact.input_state_hash) return 'missing_input_hash';
  if (previousArtifact.input_state_hash === currentStateHash) return null;
  return 'state_changed';
}
