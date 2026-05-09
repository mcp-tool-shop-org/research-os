import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { ResearchYamlSchema } from '../../intake/schema.js';
import { PackManifestSchema } from './schema.js';
import type { PackManifest } from './schema.js';

// Minimal schema for gate-result.json — only the fields manifest derivation needs.
const GateResultMinimalSchema = z.object({
  verdict: z.enum(['pass', 'warn', 'fail', 'blocked']),
  synthesis_eligible: z.boolean(),
});

interface ClaimReviewLine {
  claim_id: string;
  decision: string;
  created_at: string;
}

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

function latestClaimDecisions(reviews: ClaimReviewLine[]): Map<string, string> {
  const m = new Map<string, string>();
  const sorted = [...reviews].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const r of sorted) m.set(r.claim_id, r.decision);
  return m;
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

export function deriveManifest(
  packDir: string,
  packageName: string,
  operatorNotes = '',
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

  // pack-audit.json → per-section accepted_claims for cross-check
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

    // claim-reviews.jsonl → latest-decision-wins → count accepted_for_synthesis
    const reviews = readJsonlSafe<ClaimReviewLine>(join(sectionDir, 'claim-reviews.jsonl'));
    const decisionMap = latestClaimDecisions(reviews);
    const acceptedCount = [...decisionMap.values()].filter(
      (d) => d === 'accepted_for_synthesis',
    ).length;

    // Cross-check against pack-audit.json section summaries (Pattern 2 — same predicate)
    const auditAccepted = auditSectionMap.get(sectionId);
    if (auditAccepted !== undefined && auditAccepted !== acceptedCount) {
      throw new Error(
        `Section ${sectionId}: accepted_claims mismatch between claim-reviews.jsonl (${acceptedCount})` +
          ` and pack-audit.json (${auditAccepted}). Closure-ledger seam disagreement — investigate before publishing.`,
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
