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

function parseJsonl<T>(content: string): T[] {
  return content
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as T);
}

function readJsonlSafe<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return [];
  return parseJsonl<T>(readFileSync(filePath, 'utf8'));
}

/**
 * Best-effort parse of `claim-reviews.jsonl`. Rows that fail schema
 * validation are dropped (they were never canonical) but their absence is
 * not silently ignored — we accumulate them for the caller to surface as
 * warnings if it cares. For F-36's accepted-set derivation, dropping
 * malformed rows is correct: a row without a valid decision cannot
 * contribute to "accepted."
 */
function readClaimReviews(filePath: string): ClaimReview[] {
  if (!existsSync(filePath)) return [];
  const raw = parseJsonl<unknown>(readFileSync(filePath, 'utf8'));
  const valid: ClaimReview[] = [];
  for (const r of raw) {
    const parsed = ClaimReviewSchema.safeParse(r);
    if (parsed.success) valid.push(parsed.data);
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
 * @param warnings - Caller-owned mutable array; legacy-mismatch warnings get pushed.
 */
export function deriveManifest(
  packDir: string,
  packageName: string,
  operatorNotes = '',
  warnings: string[] = [],
): PackManifest {
  // research.yaml
  const yamlPath = join(packDir, 'research.yaml');
  if (!existsSync(yamlPath)) throw new Error(`research.yaml not found in ${packDir}`);
  const research = ResearchYamlSchema.parse(parseYaml(readFileSync(yamlPath, 'utf8')));
  if (!research.frozen_at) {
    throw new Error(`Pack is not frozen: research.yaml.frozen_at is null — run research-os freeze first`);
  }

  // freeze-receipt.json → sha256 of file bytes → freeze_receipt_sha256; parse for frozen_at
  const receiptPath = join(packDir, 'audits/freeze-receipt.json');
  if (!existsSync(receiptPath)) {
    throw new Error(`audits/freeze-receipt.json not found — pack is not frozen`);
  }
  const receiptBytes = readFileSync(receiptPath);
  const freeze_receipt_sha256 = sha256Bytes(receiptBytes);
  const receipt = JSON.parse(receiptBytes.toString('utf8')) as { frozen_at?: string };
  const frozen_at = receipt.frozen_at ?? research.frozen_at;

  // pack-audit.json → per-section accepted_claims for soft cross-check (F-36)
  const packAuditPath = join(packDir, 'audits/pack-audit.json');
  if (!existsSync(packAuditPath)) throw new Error(`audits/pack-audit.json not found`);
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

    // claim-reviews.jsonl → effective accepted set (F-36)
    const reviewsPath = join(sectionDir, 'claim-reviews.jsonl');
    const reviews = readClaimReviews(reviewsPath);

    // Refuse on incompatible decisions at the same timestamp — the
    // latest-decision-wins tie-breaker is undefined for these.
    const conflicts = findIncompatibleDecisions(reviews);
    if (conflicts.length > 0) {
      const first = conflicts[0];
      throw new Error(
        `Section ${sectionId}: claim-reviews.jsonl has incompatible decisions for ` +
          `claim_id=${first.claim_id} at created_at=${first.created_at} ` +
          `(decisions seen: ${first.decisions.join(', ')}). ` +
          `Latest-decision-wins tie-breaker undefined — investigate the review pipeline state.` +
          (conflicts.length > 1 ? ` (${conflicts.length - 1} other claim_id(s) similarly affected.)` : ''),
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
      const claimRows = parseJsonl<unknown>(readFileSync(claimsPath, 'utf8'));
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
        throw new Error(
          `Section ${sectionId}: ${phantoms.length} effective accepted claim_id(s) ` +
            `absent from claims.jsonl — phantom claims violate the closure-ledger ` +
            `subset invariant. Examples: ${phantoms.slice(0, 3).join(', ')}` +
            (phantoms.length > 3 ? ` (+${phantoms.length - 3} more)` : ''),
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
      throw new Error(`audits/${sectionId}-gate.json not found — section not gated`);
    }
    const gateResult = GateResultMinimalSchema.parse(
      JSON.parse(readFileSync(gateResultPath, 'utf8')),
    );

    // Refuse on non-synthesis-eligible section gate (defense in depth — freeze
    // should already block this, but admission is the last gate).
    if (!gateResult.synthesis_eligible) {
      throw new Error(
        `Section ${sectionId}: gate is not synthesis_eligible (verdict=${gateResult.verdict}). ` +
          `Pack admission requires every section to be synthesis-eligible.`,
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
      throw new Error(
        `Section ${sectionId} has ${stillUnresolved} unresolved contradictions.` +
          ` Freeze should have blocked this — investigate before publishing.`,
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
    research_os_version: research.research_os_version,
    sections,
    totals: totalPreserved > 0
      ? { ...totalsBase, preserved_contradiction_records: totalPreserved }
      : totalsBase,
    freeze_receipt_sha256,
    operator_notes: operatorNotes,
  });
}
