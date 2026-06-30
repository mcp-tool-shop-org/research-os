/**
 * R-012 — Frame-rescue ledger reader/writer (v0.12 Slice 1).
 *
 * File: <packPath>/evidence/claim-frame-rescues.jsonl (JSONL, one record
 * per line, append-only). Mirrors scope-repairs.ts (Pattern 2 — Law 15
 * append-only audit-trail).
 *
 * Records every rescue event that mutates a source_content_mismatch
 * claim's rescue_status, plus operator-decline events. Does NOT record
 * ineligibility decisions (which live on the claim's
 * rescue_eligibility_check field directly). Does NOT record claims that
 * remain `not_rescued` after the extraction stage — those are pending
 * operator interaction; only the operator's eventual rescue / decline
 * lands here.
 *
 * "No silent rescue": every claim that goes from frame_excluded=true to
 * frame_excluded=false via R-012 MUST have a corresponding ledger entry
 * with rescued_by={llm,operator}. The integration tests assert this
 * invariant directly.
 *
 * Schema is co-located in this file (not split into a separate
 * rescue-ledger-schema.ts) to keep R-012's file budget tight at 8 source
 * files. The pattern remains discoverable: Zod validation gate at write
 * time, plus reader-side parse-and-validate.
 */
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { z } from 'zod';

import { RESEARCH_OS_VERSION } from '../index.js';
import {
  checkRescueEligibility,
  type FrameRescueStatus,
  type PeerSnapshot,
  type RescueEligibilityResult,
} from './critic/rescue-eligibility.js';
import { ClaimSchema, type Claim } from './schema.js';

const LEDGER_FILE = 'claim-frame-rescues.jsonl';

/**
 * Closed enum of rescue_status values that land in the ledger. Subset of
 * FrameRescueStatus: `not_rescued` and `ineligible_for_rescue` never
 * appear here (they're claim-record states, not events).
 */
const LEDGER_RESCUE_STATUSES = [
  'rescued_by_llm',
  'rescued_by_operator',
  'operator_declined',
] as const;

export const RescueLedgerRecordSchema = z.object({
  claim_id: z
    .string()
    .regex(/^clm_[a-f0-9]{12}_(heuristic|ollama_intern)_\d+$/),
  section_id: z.string().regex(/^[0-9]{2}-[a-z0-9-]+$/),
  original_exclusion_reason: z.literal('source_content_mismatch'),
  eligibility_check: z.object({
    peer_count: z.number().int().nonnegative(),
    threshold: z.number().int().positive(),
    passed: z.boolean(),
  }),
  rescue_status: z.enum([...LEDGER_RESCUE_STATUSES] as [string, ...string[]]),
  // rescue_scope: positive claim about what the rescue admits. Null on
  // operator_declined (operator did not author a scope when declining).
  rescue_scope: z.string().min(1).nullable(),
  // rescue_reason: rationale text — REQUIRED on every ledger entry,
  // including operator_declined (operator must say WHY they declined).
  rescue_reason: z.string().min(1),
  // rescue_boundary: negative constraint downstream synthesis must
  // honor. Null on operator_declined.
  rescue_boundary: z.string().min(1).nullable(),
  rescued_by: z.enum(['llm', 'operator']),
  rescued_at: z.string().refine((v) => Number.isFinite(Date.parse(v)), {
    message: 'rescued_at must be a valid ISO 8601 timestamp',
  }),
  // operator id ONLY when rescued_by=operator. Null on rescued_by=llm.
  operator: z.string().min(1).nullable(),
  research_os_version: z.string().min(1),
});

export type RescueLedgerRecord = z.infer<typeof RescueLedgerRecordSchema>;

export function validateRescueLedgerRecord(input: unknown): RescueLedgerRecord {
  return RescueLedgerRecordSchema.parse(input);
}

export function rescueLedgerPath(packPath: string): string {
  return join(packPath, 'evidence', LEDGER_FILE);
}

export async function readRescueLedger(
  packPath: string,
): Promise<RescueLedgerRecord[]> {
  const filePath = rescueLedgerPath(packPath);
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
        `claim-frame-rescues.jsonl: malformed JSON at line ${lineNum}: ${line.slice(0, 120)}`,
      );
    }
    try {
      return validateRescueLedgerRecord(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `claim-frame-rescues.jsonl: invalid record at line ${lineNum}: ${msg}\n  Content: ${line.slice(0, 120)}`,
        { cause: err },
      );
    }
  });
}

export async function appendRescueLedgerRecord(
  packPath: string,
  record: RescueLedgerRecord,
): Promise<void> {
  validateRescueLedgerRecord(record);
  const filePath = rescueLedgerPath(packPath);
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, JSON.stringify(record) + '\n', 'utf8');
}

/**
 * Latest-event-per-claim. Operators reading the ledger to compute
 * "what's currently on this claim's rescue_status" use this helper
 * instead of paging through the full record list.
 */
export function latestRescueEventPerClaim(
  records: RescueLedgerRecord[],
): Map<string, RescueLedgerRecord> {
  const latest = new Map<string, RescueLedgerRecord>();
  for (const rec of records) {
    const existing = latest.get(rec.claim_id);
    if (!existing || existing.rescued_at < rec.rescued_at) {
      latest.set(rec.claim_id, rec);
    }
  }
  return latest;
}

// ─────────────────────────────────────────────────────────────────────────────
// Operator rescue surface — read claims.jsonl, re-validate eligibility from
// current claim state, write ledger entry, mutate claim record.
//
// The CLI verb `claim rescue` and the would-be `claim rescue --decline` both
// dispatch through these helpers. Co-located with the ledger reader/writer
// (rather than a separate rescue-cli.ts module) to keep R-012's source-file
// budget at exactly 8: the operator surface is a thin orchestration over
// the ledger writer + the pure eligibility gate.
// ─────────────────────────────────────────────────────────────────────────────

function claimsJsonlPath(packPath: string, sectionId: string): string {
  return join(packPath, 'sections', sectionId, 'claims.jsonl');
}

/**
 * Read all claims for a section. Throws if claims.jsonl is missing entirely.
 *
 * A-CLAIMS-002 fix: this reader feeds the rescue/decline paths, which rewrite
 * the WHOLE file from the returned claims. Silently skipping a line that fails
 * JSON.parse or ClaimSchema.parse would mean a forward-incompatible or hand-
 * edited claim line is permanently lost on the next rewrite. So we FAIL LOUD
 * with the line number + content (matching repair-scope.ts:readClaimsJsonl,
 * which does not silently skip) BEFORE any destructive rewrite can run. The
 * operator can fix or remove the offending line deliberately.
 */
async function readClaims(
  packPath: string,
  sectionId: string,
): Promise<Claim[]> {
  const path = claimsJsonlPath(packPath, sectionId);
  if (!existsSync(path)) {
    throw new Error(
      `claims.jsonl not found for section ${sectionId} at ${path}`,
    );
  }
  const text = await readFile(path, 'utf8');
  const claims: Claim[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const lineNum = i + 1;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      throw new Error(
        `claims.jsonl (section ${sectionId}): malformed JSON at line ${lineNum} — refusing to rewrite the file and silently drop it. Content: ${line.slice(0, 120)}`,
      );
    }
    try {
      // B-CLAIMS-003 (Stage B forward-compat) — parse with passthrough so
      // unknown additive keys (written by a NEWER research-os under version
      // skew) survive the read→mutate→rewrite cycle. writeClaims() re-serializes
      // these objects; a strict parse would silently strip any field this
      // version doesn't know, permanently dropping it on the next rescue/decline
      // rewrite. Passthrough keeps them on the runtime object so JSON.stringify
      // preserves them. Validation is unchanged — known fields still enforced.
      claims.push(ClaimSchema.passthrough().parse(obj) as Claim);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `claims.jsonl (section ${sectionId}): invalid claim record at line ${lineNum} — refusing to rewrite the file and silently drop it: ${msg}\n  Content: ${line.slice(0, 120)}`,
        { cause: err },
      );
    }
  }
  return claims;
}

/**
 * Rewrite claims.jsonl with the given list. Atomic on success: writes to
 * .tmp then renames into place. Used to flip frame_excluded false / set
 * rescue_status / set rescue_boundary on a rescued claim.
 */
async function writeClaims(
  packPath: string,
  sectionId: string,
  claims: Claim[],
): Promise<void> {
  const path = claimsJsonlPath(packPath, sectionId);
  const tmp = path + '.r012-tmp';
  const body = claims.map((c) => JSON.stringify(c)).join('\n') + '\n';
  await writeFile(tmp, body, 'utf8');
  // node's rename is atomic on same-filesystem moves.
  const { rename } = await import('node:fs/promises');
  await rename(tmp, path);
}

/**
 * Compute the peer-snapshot list for the eligibility gate from all
 * claims in a section that share the SAME source_id as the target claim.
 * "Same source body" = same source_id (a source_card produces a single
 * source body).
 */
function peersForEligibility(claims: Claim[], target: Claim): PeerSnapshot[] {
  const targetSources = new Set(target.source_ids);
  const peers: PeerSnapshot[] = [];
  for (const c of claims) {
    if (c.claim_id === target.claim_id) continue;
    let shares = false;
    for (const sid of c.source_ids) {
      if (targetSources.has(sid)) {
        shares = true;
        break;
      }
    }
    if (!shares) continue;
    // A-CLAIMS-001 fix: the eligibility gate counts frame-critic SURVIVORS
    // (per rescue-eligibility.ts: "non-excluded on-topic" = claims that
    // PASSED R-011's precheck AND the LLM critic). A claim that earned its
    // frame_excluded=false via a PRIOR rescue is NOT independent topical-
    // relevance proof — counting it would let one rescued claim bootstrap
    // the rescue of another from the same (unproven) source body, defeating
    // the defense floor. Treat already-rescued peers as non-survivors.
    const wasRescued =
      c.rescue_status === 'rescued_by_llm' ||
      c.rescue_status === 'rescued_by_operator';
    const isSurvivor = (c.frame_excluded ?? false) === false && !wasRescued;
    peers.push({ frame_excluded: !isSurvivor });
  }
  return peers;
}

export interface RescueCandidate {
  claim: Claim;
  eligibility: RescueEligibilityResult;
}

/**
 * List claims that are currently rescue-candidates: frame_exclusion_reason
 * = source_content_mismatch AND rescue_status ∈ {undefined, not_rescued}
 * (i.e., not in a terminal rescue state).
 *
 * Recomputes eligibility from current claim state — state may have
 * changed since extraction (e.g., review rejected some peers).
 */
export async function listRescueCandidates(args: {
  packPath: string;
  sectionId: string;
}): Promise<RescueCandidate[]> {
  const claims = await readClaims(args.packPath, args.sectionId);
  const out: RescueCandidate[] = [];
  for (const c of claims) {
    if (c.frame_exclusion_reason !== 'source_content_mismatch') continue;
    if (
      c.rescue_status !== undefined &&
      c.rescue_status !== 'not_rescued'
    ) {
      continue;
    }
    const peers = peersForEligibility(claims, c);
    const eligibility = checkRescueEligibility({ peers });
    out.push({ claim: c, eligibility });
  }
  return out;
}

export type RescueOutcome =
  | { kind: 'rescued'; claim: Claim }
  | { kind: 'declined'; claim: Claim }
  | { kind: 'ineligible'; eligibility: RescueEligibilityResult }
  | { kind: 'not_a_candidate'; reason: string }
  | { kind: 'not_found' };

/**
 * Operator rescue: admit a source_content_mismatch claim with explicit
 * operator-supplied scope, reason, and boundary. Returns the mutated
 * claim. REFUSES (kind=ineligible) when the eligibility gate fails on
 * current state.
 *
 * Defense-floor enforced HERE (in addition to extract-time): the gate
 * is re-checked against current claims, so even if the operator tries
 * to rescue a claim from a source body whose peers have since become
 * excluded, the rescue is blocked. The kickoff's "operator rescue
 * requires eligibility to pass first" is enforced.
 *
 * Audit-trail invariant: ON SUCCESS, a ledger entry is appended AND the
 * claim record is updated. ON ANY GATE FAILURE, neither happens (no
 * silent rescue, no half-applied state).
 */
export async function rescueClaimByOperator(args: {
  packPath: string;
  sectionId: string;
  claimId: string;
  rescueScope: string;
  rescueReason: string;
  rescueBoundary: string;
  operator: string;
  now?: string;
}): Promise<RescueOutcome> {
  const claims = await readClaims(args.packPath, args.sectionId);
  const target = claims.find((c) => c.claim_id === args.claimId);
  if (!target) return { kind: 'not_found' };

  if (target.frame_exclusion_reason !== 'source_content_mismatch') {
    return {
      kind: 'not_a_candidate',
      reason: `claim ${args.claimId} has frame_exclusion_reason=${target.frame_exclusion_reason ?? 'undefined'} (R-012 only rescues source_content_mismatch exclusions)`,
    };
  }
  if (
    target.rescue_status !== undefined &&
    target.rescue_status !== 'not_rescued'
  ) {
    return {
      kind: 'not_a_candidate',
      reason: `claim ${args.claimId} has rescue_status=${target.rescue_status} (already in a terminal rescue state)`,
    };
  }

  const peers = peersForEligibility(claims, target);
  const eligibility = checkRescueEligibility({ peers });
  if (!eligibility.passed) {
    // GATE FAILED — mutate the claim record to record the ineligibility
    // verdict and refuse the rescue. NO ledger entry (per kickoff
    // acceptance test #2: ineligibility leaves the audit trail on the
    // claim record, not in the ledger).
    target.rescue_status = 'ineligible_for_rescue';
    target.rescue_eligibility_check = eligibility;
    await writeClaims(args.packPath, args.sectionId, claims);
    return { kind: 'ineligible', eligibility };
  }

  const now = args.now ?? new Date().toISOString();
  // Apply rescue: flip frame_excluded false, clear original exclusion
  // metadata (the claim is no longer excluded — keeping it would be a
  // silent contradiction), stamp rescue fields. Original scope/not stay
  // intact; rescue_boundary carries the operator-supplied constraint.
  target.frame_excluded = false;
  delete target.frame_exclusion_reason;
  delete target.frame_exclusion_rationale;
  target.rescue_status = 'rescued_by_operator';
  target.rescue_eligibility_check = eligibility;
  target.rescue_boundary = args.rescueBoundary;

  // ATOMIC PERSISTENCE: write the ledger entry FIRST, then mutate
  // claims.jsonl. If ledger-write fails, claims.jsonl is untouched
  // (operator can retry). If claims.jsonl write fails, ledger has a
  // recorded event that didn't materialize — operator can re-run the
  // rescue (idempotent via claim_id; ledger picks up a second entry).
  await appendRescueLedgerRecord(args.packPath, {
    claim_id: target.claim_id,
    section_id: target.section_id,
    original_exclusion_reason: 'source_content_mismatch',
    eligibility_check: eligibility,
    rescue_status: 'rescued_by_operator',
    rescue_scope: args.rescueScope,
    rescue_reason: args.rescueReason,
    rescue_boundary: args.rescueBoundary,
    rescued_by: 'operator',
    rescued_at: now,
    operator: args.operator,
    research_os_version: RESEARCH_OS_VERSION,
  });
  await writeClaims(args.packPath, args.sectionId, claims);
  return { kind: 'rescued', claim: target };
}

/**
 * Operator decline: explicitly mark a rescue-eligible claim as
 * operator_declined. Distinguishable from "operator never saw this
 * claim" (which leaves rescue_status=not_rescued).
 *
 * Like operator rescue, requires eligibility to pass first — declining
 * on an ineligible claim makes no sense (the rescue path was never
 * open). Returns kind=ineligible without writing a ledger entry on gate
 * failure.
 */
export async function declineClaimRescueByOperator(args: {
  packPath: string;
  sectionId: string;
  claimId: string;
  declineReason: string;
  operator: string;
  now?: string;
}): Promise<RescueOutcome> {
  const claims = await readClaims(args.packPath, args.sectionId);
  const target = claims.find((c) => c.claim_id === args.claimId);
  if (!target) return { kind: 'not_found' };

  if (target.frame_exclusion_reason !== 'source_content_mismatch') {
    return {
      kind: 'not_a_candidate',
      reason: `claim ${args.claimId} has frame_exclusion_reason=${target.frame_exclusion_reason ?? 'undefined'} (R-012 only handles source_content_mismatch exclusions)`,
    };
  }
  if (
    target.rescue_status !== undefined &&
    target.rescue_status !== 'not_rescued'
  ) {
    return {
      kind: 'not_a_candidate',
      reason: `claim ${args.claimId} has rescue_status=${target.rescue_status} (already in a terminal rescue state)`,
    };
  }

  const peers = peersForEligibility(claims, target);
  const eligibility = checkRescueEligibility({ peers });
  if (!eligibility.passed) {
    target.rescue_status = 'ineligible_for_rescue';
    target.rescue_eligibility_check = eligibility;
    await writeClaims(args.packPath, args.sectionId, claims);
    return { kind: 'ineligible', eligibility };
  }

  const now = args.now ?? new Date().toISOString();
  target.rescue_status = 'operator_declined';
  target.rescue_eligibility_check = eligibility;

  await appendRescueLedgerRecord(args.packPath, {
    claim_id: target.claim_id,
    section_id: target.section_id,
    original_exclusion_reason: 'source_content_mismatch',
    eligibility_check: eligibility,
    rescue_status: 'operator_declined',
    rescue_scope: null,
    rescue_reason: args.declineReason,
    rescue_boundary: null,
    rescued_by: 'operator',
    rescued_at: now,
    operator: args.operator,
    research_os_version: RESEARCH_OS_VERSION,
  });
  await writeClaims(args.packPath, args.sectionId, claims);
  return { kind: 'declined', claim: target };
}

// Re-export FrameRescueStatus from here for downstream convenience.
export type { FrameRescueStatus };
