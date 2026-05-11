import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { ResearchYamlSchema } from '../../intake/schema.js';
import { ClaimReviewSchema, type ClaimReview } from '../../review/schema.js';
import {
  findIncompatibleDecisions,
  getEffectiveAcceptedClaimIds,
} from '../../closure-ledger/effective-accepted.js';
import { PackManifestSchema } from './schema.js';
import type { PackManifest } from './schema.js';
import { RESEARCH_OS_VERSION } from '../../index.js';
import { ResearchOSError } from '../../errors.js';

// Minimal schema for gate-result.json — only the fields manifest derivation needs.
const GateResultMinimalSchema = z.object({
  verdict: z.enum(['pass', 'warn', 'fail', 'blocked']),
  synthesis_eligible: z.boolean(),
});

// Minimal claim-record schema for the phantom-claim-id integrity check.
// We only need `claim_id`; full ClaimSchema validation is gate-time work.
const ClaimIdOnlySchema = z.object({ claim_id: z.string() });

interface ResolutionLine {
  contradiction_id: string;
  status: string;
  resolved_at: string;
}

interface DispositionLine {
  claim_id: string;
  created_at: string;
}

interface AuditSectionSummary {
  section_id: string;
  accepted_claims: number;
}

function sha256Bytes(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * D-002: parse newline-delimited JSON. Each non-blank line must parse
 * independently; on failure we throw a {@link ResearchOSError} with
 * `PACK_PARSE_ERROR`, the offending file path (`label`), and the 1-based
 * line number. Preserves the original parse-error message as the cause so
 * callers can still inspect it.
 *
 * `label` is typically the absolute or pack-relative file path so operators
 * can locate the bad row quickly.
 */
function parseJsonl<T>(content: string, label: string): T[] {
  const out: T[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch (err) {
      const cause = err instanceof Error ? err : new Error(String(err));
      throw new ResearchOSError(
        `Malformed JSON on line ${i + 1} of ${label}: ${cause.message}`,
        'PACK_PARSE_ERROR',
        `Inspect line ${i + 1} of ${label} for malformed JSON. Use \`research-os\` to repair or remove the bad row.`,
        cause,
      );
    }
  }
  return out;
}

function readJsonlSafe<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return [];
  return parseJsonl<T>(readFileSync(filePath, 'utf8'), filePath);
}

/**
 * D-003: best-effort parse of `claim-reviews.jsonl`. Rows that fail schema
 * validation are dropped (they were never canonical) but their absence is
 * not silently ignored — they are pushed onto `warnings` (when provided)
 * as structured strings tagged `malformed_claim_review_row`. The caller can
 * grep / summarize on that tag. For F-36's accepted-set derivation, dropping
 * malformed rows is correct: a row without a valid decision cannot contribute
 * to "accepted."
 *
 * After the loop, if N>0 rows were malformed, a CRITICAL summary line is
 * appended so a downstream reader who only scans for `CRITICAL` still sees
 * the count.
 *
 * @param filePath - Absolute path to claim-reviews.jsonl.
 * @param sectionId - Owning section id (recorded in warning lines).
 * @param warnings - Optional caller-owned mutable warning array.
 */
function readClaimReviews(
  filePath: string,
  sectionId: string,
  warnings?: string[],
): ClaimReview[] {
  if (!existsSync(filePath)) return [];
  const raw = parseJsonl<unknown>(readFileSync(filePath, 'utf8'), filePath);
  const valid: ClaimReview[] = [];
  let malformed = 0;
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const parsed = ClaimReviewSchema.safeParse(r);
    if (parsed.success) {
      valid.push(parsed.data);
    } else {
      malformed++;
      if (warnings) {
        const issue = parsed.error.issues
          .map((x) => `${x.path.join('.') || '<root>'}: ${x.message}`)
          .join('; ');
        warnings.push(
          `malformed_claim_review_row section=${sectionId} file=${filePath} line=${i + 1}: ${issue}`,
        );
      }
    }
  }
  if (malformed > 0 && warnings) {
    warnings.push(
      `CRITICAL section ${sectionId}: ${malformed} malformed claim-review row(s) dropped from ${filePath}. ` +
        `Dropped rows cannot contribute to accepted-set derivation; investigate the review pipeline state.`,
    );
  }
  return valid;
}

function latestContradictionStatuses(resolutions: ResolutionLine[]): Map<string, string> {
  const m = new Map<string, string>();
  const sorted = [...resolutions].sort((a, b) => a.resolved_at.localeCompare(b.resolved_at));
  for (const r of sorted) m.set(r.contradiction_id, r.status);
  return m;
}

function latestDispositionStatuses(dispositions: DispositionLine[]): Map<string, string> {
  const m = new Map<string, string>();
  const sorted = [...dispositions].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const d of sorted) m.set(d.claim_id, 'dispositioned');
  return m;
}

export interface ManifestRefusal {
  reason: string;
}

/**
 * Derive a {@link PackManifest} from a frozen pack directory.
 *
 * **F-36 admission discipline** (Session L, v0.3.2):
 *
 * - Per-section `accepted_claims` is the **effective** count: unique
 *   `claim_id`s whose latest review decision is `accepted_for_synthesis`
 *   (latest-decision-wins per closure-ledger semantics). Computed via
 *   {@link getEffectiveAcceptedClaimIds}.
 * - Legacy disagreement with `pack-audit.json::accepted_claims` is **soft**:
 *   pushed to `warnings` but does not refuse admission. The legacy count
 *   stays preserved in the frozen pack (Law 15 immutability).
 * - Refuses on **real integrity problems**:
 *   - Effective accepted `claim_id` absent from `claims.jsonl` (phantom).
 *   - Duplicate review rows with incompatible decisions at the same
 *     `created_at` (latest-decision-wins tie-breaker undefined).
 *   - Section gate not `synthesis_eligible`.
 *
 * @param packDir - Source frozen pack directory.
 * @param packageName - Target package name.
 * @param operatorNotes - Operator-supplied notes recorded in the manifest.
 * @param warnings - Caller-owned mutable array; legacy-mismatch and D-003
 *                   malformed-row warnings get pushed here.
 */
export function deriveManifest(
  packDir: string,
  packageName: string,
  operatorNotes = '',
  warnings: string[] = [],
): PackManifest {
  // research.yaml
  // C1-008: 4 frozen-pack preconditions. We use the closest existing codes
  // (PACK_NOT_FOUND for missing pack-required artifacts, SYNTHESIS_NOT_READY
  // for pack-not-frozen). See closeout escalation note: a dedicated
  // `PACK_NOT_FROZEN` code would programmatically distinguish "pack absent"
  // from "pack present but never frozen" — not introduced in this wave.
  const yamlPath = join(packDir, 'research.yaml');
  if (!existsSync(yamlPath))
    throw new ResearchOSError(
      `research.yaml not found in ${packDir}`,
      'PACK_NOT_FOUND',
      `Run \`research-os init\` to create a pack, or supply the correct --from <dir>. See handbook/pack-publish.md.`,
    );
  const research = ResearchYamlSchema.parse(parseYaml(readFileSync(yamlPath, 'utf8')));
  if (!research.frozen_at) {
    throw new ResearchOSError(
      `Pack is not frozen: research.yaml.frozen_at is null`,
      'SYNTHESIS_NOT_READY',
      `Run \`research-os freeze\` to produce audits/freeze-receipt.json and stamp research.yaml.frozen_at. See handbook/pack-publish.md.`,
    );
  }

  // freeze-receipt.json → sha256 of file bytes → freeze_receipt_sha256; parse for frozen_at
  const receiptPath = join(packDir, 'audits/freeze-receipt.json');
  if (!existsSync(receiptPath)) {
    throw new ResearchOSError(
      `audits/freeze-receipt.json not found — pack is not frozen`,
      'SYNTHESIS_NOT_READY',
      `Run \`research-os freeze\` to produce the freeze receipt. See handbook/pack-publish.md.`,
    );
  }
  const receiptBytes = readFileSync(receiptPath);
  const freeze_receipt_sha256 = sha256Bytes(receiptBytes);
  const receipt = JSON.parse(receiptBytes.toString('utf8')) as { frozen_at?: string };
  const frozen_at = receipt.frozen_at ?? research.frozen_at;

  // pack-audit.json → per-section accepted_claims for soft cross-check (F-36)
  const packAuditPath = join(packDir, 'audits/pack-audit.json');
  if (!existsSync(packAuditPath))
    throw new ResearchOSError(
      `audits/pack-audit.json not found`,
      'PACK_NOT_FOUND',
      `Run \`research-os audit\` before \`research-os freeze\` to produce audits/pack-audit.json. See handbook/pack-publish.md.`,
    );
  const packAudit = JSON.parse(readFileSync(packAuditPath, 'utf8')) as {
    section_summaries?: AuditSectionSummary[];
  };
  const auditSectionMap = new Map<string, number>(
    (packAudit.section_summaries ?? []).map((s) => [s.section_id, s.accepted_claims]),
  );

  // Per-section derivation
  const sectionIds = research.sections.map((s) => s.id);
  const sections: PackManifest['sections'] = [];
  let totalAccepted = 0;
  let totalDispositioned = 0;
  let totalPreserved = 0;

  for (const sectionId of sectionIds) {
    const sectionDir = join(packDir, 'sections', sectionId);

    // claim-reviews.jsonl → effective accepted set (F-36); malformed rows
    // dropped with D-003 structured warnings.
    const reviewsPath = join(sectionDir, 'claim-reviews.jsonl');
    const reviews = readClaimReviews(reviewsPath, sectionId, warnings);

    // Refuse on incompatible decisions at the same timestamp — the
    // latest-decision-wins tie-breaker is undefined for these.
    // C1-009: translate the internal "tie-breaker undefined" phrasing into an
    // operator-actionable hint. INTAKE_VALIDATION is the closest existing
    // code for "admission-contract refusal: input data violates an invariant".
    const conflicts = findIncompatibleDecisions(reviews);
    if (conflicts.length > 0) {
      const first = conflicts[0];
      const others = conflicts.length > 1 ? ` (${conflicts.length - 1} other claim_id(s) similarly affected)` : '';
      throw new ResearchOSError(
        `Section ${sectionId}: claim-reviews.jsonl has incompatible review decisions for claim_id=${first.claim_id} recorded at the same timestamp ${first.created_at} (decisions: ${first.decisions.join(', ')})${others}.`,
        'INTAKE_VALIDATION',
        `Inspect sections/${sectionId}/claim-reviews.jsonl rows with created_at=${first.created_at} — multiple rows for the same claim_id at the same timestamp prevent a deterministic latest-decision-wins resolution. Remove the duplicate row or re-run \`research-os review\` to overwrite with a fresh decision. See handbook/recovery.md.`,
      );
    }

    const effectiveAccepted = getEffectiveAcceptedClaimIds(reviews);
    const acceptedCount = effectiveAccepted.size;

    // Refuse on phantom claim_ids — every effective accepted claim_id must
    // exist in claims.jsonl (the claim ledger). If claims.jsonl is absent,
    // we can't run this check; that's not a refusal (some legitimate fixtures
    // don't ship claims.jsonl), so we soft-warn instead.
    const claimsPath = join(sectionDir, 'claims.jsonl');
    if (existsSync(claimsPath)) {
      const claimRows = parseJsonl<unknown>(readFileSync(claimsPath, 'utf8'), claimsPath);
      const claimIds = new Set<string>();
      for (const c of claimRows) {
        const parsed = ClaimIdOnlySchema.safeParse(c);
        if (parsed.success) claimIds.add(parsed.data.claim_id);
      }
      const phantoms: string[] = [];
      for (const cid of effectiveAccepted) {
        if (!claimIds.has(cid)) phantoms.push(cid);
      }
      if (phantoms.length > 0) {
        // C1-009: operator-actionable translation of "phantom claim_ids".
        const examples = phantoms.slice(0, 3).join(', ');
        const more = phantoms.length > 3 ? ` (+${phantoms.length - 3} more)` : '';
        throw new ResearchOSError(
          `Section ${sectionId}: ${phantoms.length} accepted claim_id(s) reference a claim that does not exist in sections/${sectionId}/claims.jsonl (examples: ${examples}${more}).`,
          'INTAKE_VALIDATION',
          `Each accepted claim_id must exist in claims.jsonl. Either restore the missing claim row(s), or invalidate the review state via \`research-os invalidate review ${sectionId}\` and re-run review. See handbook/recovery.md.`,
        );
      }
    } else {
      warnings.push(
        `section ${sectionId}: claims.jsonl absent — phantom-claim integrity check skipped`,
      );
    }

    // Soft cross-check against pack-audit.json (F-36):
    // legacy disagreement is acceptable; effective count is canonical.
    const auditAccepted = auditSectionMap.get(sectionId);
    if (auditAccepted !== undefined && auditAccepted !== acceptedCount) {
      warnings.push(
        `section ${sectionId}: legacy pack-audit.json accepted_claims (${auditAccepted}) ` +
          `differs from effective accepted set (${acceptedCount}). ` +
          `Using effective count (${acceptedCount}) in manifest. ` +
          `Legacy audit count preserved in pack/audits/pack-audit.json (immutable per Law 15).`,
      );
    }

    // audits/<section-id>-gate.json → verdict + synthesis_eligible
    const gateResultPath = join(packDir, 'audits', `${sectionId}-gate.json`);
    if (!existsSync(gateResultPath)) {
      // C1-008: missing gate result is a pack-not-frozen-cleanly signal.
      throw new ResearchOSError(
        `audits/${sectionId}-gate.json not found — section not gated`,
        'PACK_NOT_FOUND',
        `Run \`research-os gate ${sectionId}\` (then \`research-os freeze\`) to produce the gate result. See handbook/pack-publish.md.`,
      );
    }
    const gateResult = GateResultMinimalSchema.parse(
      JSON.parse(readFileSync(gateResultPath, 'utf8')),
    );

    // Refuse on non-synthesis-eligible section gate (defense in depth — freeze
    // should already block this, but admission is the last gate).
    // C1-009: operator-actionable phrasing.
    if (!gateResult.synthesis_eligible) {
      throw new ResearchOSError(
        `Section ${sectionId}: gate verdict is ${gateResult.verdict} and synthesis_eligible=false; pack admission requires every section to be synthesis-eligible.`,
        'INTAKE_VALIDATION',
        `Re-run \`research-os gate ${sectionId}\` after resolving the gate's blocking reasons (see audits/${sectionId}-gate.{json,md}). Then re-freeze and re-publish. See handbook/recovery.md.`,
      );
    }

    // claim-synthesis-dispositions.jsonl → latest-status-wins count
    const dispositions = readJsonlSafe<DispositionLine>(
      join(sectionDir, 'claim-synthesis-dispositions.jsonl'),
    );
    const dispositionMap = latestDispositionStatuses(dispositions);
    totalDispositioned += dispositionMap.size;

    // contradiction-resolutions.jsonl → latest-status-wins; assert none unresolved
    const resolutions = readJsonlSafe<ResolutionLine>(
      join(sectionDir, 'contradiction-resolutions.jsonl'),
    );
    const resolutionMap = latestContradictionStatuses(resolutions);
    const stillUnresolved = [...resolutionMap.values()].filter((s) => s === 'unresolved').length;
    if (stillUnresolved > 0) {
      // C1-009: operator-actionable phrasing. Unresolved contradictions can be
      // closed via `research-os contradict resolve`.
      throw new ResearchOSError(
        `Section ${sectionId} has ${stillUnresolved} unresolved contradiction(s); freeze should have blocked this.`,
        'INTAKE_VALIDATION',
        `Run \`research-os contradict resolve ${sectionId} --id <id> --status resolved --reason "..."\` (or --all) to close them, then re-freeze. See handbook/recovery.md.`,
      );
    }
    totalPreserved += [...resolutionMap.values()].filter((s) => s !== 'unresolved').length;

    totalAccepted += acceptedCount;
    sections.push({
      id: sectionId,
      accepted_claims: acceptedCount,
      gate: gateResult.verdict,
      synthesis_eligible: gateResult.synthesis_eligible,
    });
  }

  const totalsBase = {
    sections: sections.length,
    accepted_claims: totalAccepted,
    dispositioned: totalDispositioned,
    unresolved_contradictions: 0,
  };

  return PackManifestSchema.parse({
    name: packageName,
    topic: research.topic,
    frozen_at,
    research_os_version: RESEARCH_OS_VERSION,
    sections,
    totals: totalPreserved > 0
      ? { ...totalsBase, preserved_contradiction_records: totalPreserved }
      : totalsBase,
    freeze_receipt_sha256,
    operator_notes: operatorNotes,
  });
}
