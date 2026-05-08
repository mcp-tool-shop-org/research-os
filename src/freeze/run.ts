import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

import { PackNotFoundError } from '../errors.js';
import { ResearchYamlSchema, type ResearchYaml } from '../intake/schema.js';
import {
  PackAuditPayloadSchema,
  type PackAuditPayload,
} from '../audit/schema.js';
import {
  CoworkHandoffPayloadSchema,
  type CoworkHandoffPayload,
} from '../cowork/schema.js';
import { CrossSectionMapSchema } from '../synth/schema.js';
import { ClaimSchema } from '../claims/schema.js';
import { ClaimReviewSchema, type ClaimReview } from '../review/schema.js';

import { hashArtifact, pass, fail, type CheckContext } from './checks.js';
import {
  extractClaimCitations,
  extractContradictionDisclosures,
  extractWaiverDisclosures,
  isWellFormedClaimId,
} from './citations.js';
import { renderFreezeReceiptMarkdown, renderFreezeRefusalMarkdown } from './markdown.js';
import {
  FreezeReceiptPayloadSchema,
  FreezeRefusalPayloadSchema,
} from './schema.js';
import type {
  ArtifactHash,
  FreezeOptions,
  FreezeReceiptPayload,
  FreezeRefusalPayload,
  FreezeSummary,
  IntegrityCheck,
} from './types.js';

const REQUIRED_PACK_ARTIFACTS = ['research.yaml', 'audits/pack-audit.json', 'handoffs/cowork-handoff.json'];
const SYNTHESIS_FILES = [
  'synthesis/cross-section-map.json',
  'synthesis/cross-section-map.md',
  'synthesis/decision-brief.md',
  'synthesis/working-report.md',
  'synthesis/final-report.md',
];

function packId(research: ResearchYaml): string {
  const fingerprint = `${research.topic}|${research.created_at}`;
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i += 1) {
    hash = Math.imul(31, hash) + fingerprint.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(12, '0').slice(-12);
}

function fileSha256Of(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

interface RefusalContext {
  reasons: string[];
  blockingReasons: string[];
  missingArtifacts: string[];
  invalidArtifacts: Array<{ path: string; error: string }>;
}

function noteRefusal(ctx: RefusalContext, reason: string, blocking = true): void {
  ctx.reasons.push(reason);
  if (blocking) ctx.blockingReasons.push(reason);
}

async function tryReadJson<T>(
  packPath: string,
  rel: string,
  parse: (raw: unknown) => T,
  invalid: Array<{ path: string; error: string }>,
): Promise<T | null> {
  const abs = join(packPath, rel);
  if (!existsSync(abs)) return null;
  try {
    return parse(JSON.parse(await readFile(abs, 'utf8')));
  } catch (err) {
    invalid.push({ path: rel, error: err instanceof Error ? err.message : 'parse error' });
    return null;
  }
}

export async function freeze(options: FreezeOptions): Promise<FreezeSummary> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  const yamlPath = join(packPath, 'research.yaml');
  if (!existsSync(yamlPath)) throw new PackNotFoundError(packPath);

  const refusal: RefusalContext = {
    reasons: [],
    blockingReasons: [],
    missingArtifacts: [],
    invalidArtifacts: [],
  };
  let research: ResearchYaml;
  try {
    research = ResearchYamlSchema.parse(yamlParse(await readFile(yamlPath, 'utf8')));
  } catch (err) {
    refusal.invalidArtifacts.push({ path: 'research.yaml', error: err instanceof Error ? err.message : 'parse error' });
    return writeRefusal({
      packPath,
      pid: 'unknown',
      topic: 'unknown',
      refusal,
    });
  }

  const pid = packId(research);

  // Required artifacts presence
  for (const rel of REQUIRED_PACK_ARTIFACTS) {
    if (!existsSync(join(packPath, rel))) {
      refusal.missingArtifacts.push(rel);
      noteRefusal(refusal, `Required artifact missing: ${rel}.`);
    }
  }
  for (const rel of SYNTHESIS_FILES) {
    if (!existsSync(join(packPath, rel))) {
      refusal.missingArtifacts.push(rel);
      noteRefusal(refusal, `Synthesis artifact missing: ${rel}. Run \`research-os synth workspace\` after the pack reaches synthesis_ready.`);
    }
  }

  const packAudit = await tryReadJson<PackAuditPayload>(
    packPath,
    'audits/pack-audit.json',
    (r) => PackAuditPayloadSchema.parse(r),
    refusal.invalidArtifacts,
  );
  const handoff = await tryReadJson<CoworkHandoffPayload>(
    packPath,
    'handoffs/cowork-handoff.json',
    (r) => CoworkHandoffPayloadSchema.parse(r),
    refusal.invalidArtifacts,
  );
  const crossSectionMap = await tryReadJson(
    packPath,
    'synthesis/cross-section-map.json',
    (r) => CrossSectionMapSchema.parse(r),
    refusal.invalidArtifacts,
  );

  if (refusal.invalidArtifacts.length > 0) {
    for (const ia of refusal.invalidArtifacts) {
      noteRefusal(refusal, `Canonical artifact failed to parse: ${ia.path}: ${ia.error}`);
    }
  }

  if (packAudit && packAudit.verdict !== 'ready_for_synthesis') {
    noteRefusal(refusal, `Pack audit verdict is "${packAudit.verdict}", not "ready_for_synthesis".`);
  }
  if (handoff && handoff.mode !== 'synthesis_ready') {
    noteRefusal(refusal, `Cowork handoff mode is "${handoff.mode}", not "synthesis_ready".`);
  }

  // Citation analysis
  const finalReportAbs = join(packPath, 'synthesis/final-report.md');
  const decisionBriefAbs = join(packPath, 'synthesis/decision-brief.md');
  const workingReportAbs = join(packPath, 'synthesis/working-report.md');
  let finalReportText = '';
  let decisionBriefText = '';
  let workingReportText = '';
  if (existsSync(finalReportAbs)) finalReportText = await readFile(finalReportAbs, 'utf8');
  if (existsSync(decisionBriefAbs)) decisionBriefText = await readFile(decisionBriefAbs, 'utf8');
  if (existsSync(workingReportAbs)) workingReportText = await readFile(workingReportAbs, 'utf8');

  // Defense in depth: read live claims + claim-reviews directly rather than
  // trusting the cross-section-map snapshot. If reviews changed after synth
  // workspace ran, we want to catch it at freeze.
  const livePackClaimIds = new Set<string>();
  const liveLatestDecisionByClaim = new Map<string, string>();
  const liveLatestCreatedAtByClaim = new Map<string, string>();
  for (const section of research.sections) {
    const claimsFile = join(packPath, 'sections', section.id, 'claims.jsonl');
    if (existsSync(claimsFile)) {
      const text = await readFile(claimsFile, 'utf8');
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const c = ClaimSchema.parse(JSON.parse(line));
          livePackClaimIds.add(c.claim_id);
        } catch (err) {
          refusal.invalidArtifacts.push({
            path: `sections/${section.id}/claims.jsonl`,
            error: err instanceof Error ? err.message : 'parse error',
          });
        }
      }
    }
    const reviewsFile = join(packPath, 'sections', section.id, 'claim-reviews.jsonl');
    if (existsSync(reviewsFile)) {
      const text = await readFile(reviewsFile, 'utf8');
      const reviews: ClaimReview[] = [];
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          reviews.push(ClaimReviewSchema.parse(JSON.parse(line)));
        } catch (err) {
          refusal.invalidArtifacts.push({
            path: `sections/${section.id}/claim-reviews.jsonl`,
            error: err instanceof Error ? err.message : 'parse error',
          });
        }
      }
      // Latest by created_at wins
      for (const r of reviews) {
        const existingCreatedAt = liveLatestCreatedAtByClaim.get(r.claim_id);
        if (!existingCreatedAt || r.created_at > existingCreatedAt) {
          liveLatestCreatedAtByClaim.set(r.claim_id, r.created_at);
          liveLatestDecisionByClaim.set(r.claim_id, r.decision);
        }
      }
    }
  }

  const acceptedClaimIds: string[] = [];
  for (const [cid, decision] of liveLatestDecisionByClaim) {
    if (decision === 'accepted_for_synthesis') acceptedClaimIds.push(cid);
  }
  acceptedClaimIds.sort();

  const allClaimIds = livePackClaimIds;
  const repairOrRejected = new Set<string>();
  for (const [cid, decision] of liveLatestDecisionByClaim) {
    if (decision === 'rejected' || decision.startsWith('needs_')) {
      repairOrRejected.add(cid);
    }
  }

  const citationsInFinal = extractClaimCitations(finalReportText);
  const citationsInBrief = extractClaimCitations(decisionBriefText);
  const citationsInWorking = extractClaimCitations(workingReportText);
  const allCitedSet = new Set<string>([...citationsInFinal, ...citationsInBrief, ...citationsInWorking]);
  const allCited = Array.from(allCitedSet);

  const unknownCitations = allCited.filter((c) => isWellFormedClaimId(c) && !allClaimIds.has(c));
  const repairCitations = allCited.filter((c) => repairOrRejected.has(c));
  const uncitedAccepted = acceptedClaimIds.filter((c) => !allCitedSet.has(c));

  if (existsSync(finalReportAbs) && finalReportText.trim().length > 0) {
    if (citationsInFinal.length === 0 && acceptedClaimIds.length > 0) {
      noteRefusal(refusal, 'final-report.md contains no [claim:...] citations even though accepted claims exist.');
    }
  }
  if (unknownCitations.length > 0) {
    noteRefusal(refusal, `Synthesis cites unknown claim_id(s) not present in the pack: ${unknownCitations.join(', ')}.`);
  }
  if (repairCitations.length > 0) {
    noteRefusal(refusal, `Synthesis cites claim(s) that are in repair or rejected state: ${repairCitations.join(', ')}.`);
  }

  // Disclosure check: every unresolved contradiction must appear in decision-brief.md OR final-report.md
  const unresolvedContradictionRefs: FreezeReceiptPayload['unresolved_contradictions'] = [];
  if (crossSectionMap) {
    for (const c of crossSectionMap.cross_section_contradictions) {
      if (c.status !== 'unresolved') continue;
      const disclosedIn: string[] = [];
      if (decisionBriefText.includes(c.contradiction_id)) disclosedIn.push('synthesis/decision-brief.md');
      if (finalReportText.includes(c.contradiction_id)) disclosedIn.push('synthesis/final-report.md');
      if (disclosedIn.length === 0) {
        noteRefusal(refusal, `Unresolved contradiction ${c.contradiction_id} not disclosed in decision-brief.md or final-report.md.`);
      }
      unresolvedContradictionRefs.push({
        contradiction_id: c.contradiction_id,
        section_id: c.sections.join(','),
        type: c.type,
        severity: c.severity,
        status: c.status,
        disclosed_in: disclosedIn,
      });
    }
  }

  // Waiver disclosure
  const waiversDisclosed: FreezeReceiptPayload['waivers_disclosed'] = [];
  if (handoff) {
    for (const w of handoff.waivers) {
      const disclosedInBrief = extractWaiverDisclosures(decisionBriefText, [w]);
      const disclosedInFinal = extractWaiverDisclosures(finalReportText, [w]);
      const disclosedIn: string[] = [];
      if (disclosedInBrief.length > 0) disclosedIn.push('synthesis/decision-brief.md');
      if (disclosedInFinal.length > 0) disclosedIn.push('synthesis/final-report.md');
      if (disclosedIn.length === 0) {
        noteRefusal(refusal, `Waiver "${w.family}.${w.applied_to}" is not disclosed in decision-brief.md or final-report.md.`);
      }
      waiversDisclosed.push({
        family: w.family,
        applied_to: w.applied_to,
        reason: w.reason,
        compensating_controls: w.compensating_controls,
        disclosed_in: disclosedIn,
      });
    }
  }

  // Section status — every section must have a gate audit on file
  for (const section of research.sections) {
    if (!existsSync(join(packPath, 'audits', `${section.id}-gate.json`))) {
      noteRefusal(refusal, `Section ${section.id} has no gate result on file.`);
      refusal.missingArtifacts.push(`audits/${section.id}-gate.json`);
    }
  }

  // If we have refusal reasons, write the refusal artifact and return
  if (refusal.reasons.length > 0) {
    return writeRefusal({
      packPath,
      pid,
      topic: research.topic,
      refusal,
    });
  }

  // PASS PATH
  // Compute integrity checks
  const checks: IntegrityCheck[] = [];
  const ctx: CheckContext = {
    packPath,
    invalidArtifacts: [],
    missingArtifacts: [],
  };

  const synthesisHashes: ArtifactHash[] = [];
  for (const rel of SYNTHESIS_FILES) {
    const h = await hashArtifact(ctx, rel);
    if (h) synthesisHashes.push(h);
  }

  const canonicalPaths: string[] = [];
  canonicalPaths.push('research.yaml');
  for (const section of research.sections) {
    canonicalPaths.push(
      `sections/${section.id}/claims.jsonl`,
      `sections/${section.id}/sources.jsonl`,
      `sections/${section.id}/contradictions.jsonl`,
      `sections/${section.id}/claim-reviews.jsonl`,
      `sections/${section.id}/gates.yaml`,
      `audits/${section.id}-gate.json`,
      `audits/${section.id}-review.json`,
      `audits/${section.id}-findings.jsonl`,
    );
  }
  canonicalPaths.push('evidence/fetch-log.jsonl');
  canonicalPaths.push('evidence/citation-ledger.jsonl');
  if (existsSync(join(packPath, 'evidence', 'source-cards'))) {
    const entries = await readdir(join(packPath, 'evidence', 'source-cards'));
    for (const e of entries) {
      if (e.endsWith('.json')) canonicalPaths.push(`evidence/source-cards/${e}`);
    }
  }

  const canonicalHashes: ArtifactHash[] = [];
  for (const rel of canonicalPaths) {
    const abs = join(packPath, rel);
    if (!existsSync(abs)) continue;
    const h = await hashArtifact(ctx, rel);
    if (h) canonicalHashes.push(h);
  }

  checks.push(pass('pack_audit_ready', `pack-audit verdict=${packAudit?.verdict}`));
  checks.push(pass('handoff_synthesis_ready', `cowork-handoff mode=${handoff?.mode}`));
  checks.push(pass('synthesis_workspace_present', `${synthesisHashes.length}/${SYNTHESIS_FILES.length} synthesis files hashed`));
  checks.push(
    pass(
      'final_report_cites_accepted_claims_only',
      `${citationsInFinal.length} citation(s); 0 unknown, 0 repair/rejected`,
    ),
  );
  checks.push(
    pass(
      'unresolved_contradictions_disclosed',
      `${unresolvedContradictionRefs.length} contradiction(s) checked`,
    ),
  );
  checks.push(pass('waivers_disclosed', `${waiversDisclosed.length} waiver(s) checked`));
  checks.push(pass('canonical_artifacts_fingerprinted', `${canonicalHashes.length} artifact(s) hashed`));

  const packAuditHash = packAudit ? fileSha256Of(JSON.stringify(packAudit)) : '0'.repeat(64);
  const handoffHash = handoff ? fileSha256Of(JSON.stringify(handoff)) : '0'.repeat(64);

  // Section summaries
  const sections = research.sections.map((s) => {
    const handoffSection = handoff?.sections.find((hs) => hs.section_id === s.id);
    return {
      section_id: s.id,
      status: 'frozen',
      accepted_claims: handoffSection?.accepted_claim_ids.length ?? 0,
      sources: 0, // populated below if cross-section-map has data
      contradictions: handoffSection?.unresolved_contradiction_ids.length ?? 0,
    };
  });

  const frozenAt = new Date().toISOString();
  const receipt: FreezeReceiptPayload = FreezeReceiptPayloadSchema.parse({
    pack_id: pid,
    pack_topic: research.topic,
    frozen_at: frozenAt,
    verdict: 'frozen',
    pack_audit_hash: packAuditHash,
    handoff_hash: handoffHash,
    synthesis_hashes: synthesisHashes,
    canonical_artifact_hashes: canonicalHashes,
    accepted_claim_ids: acceptedClaimIds,
    cited_claim_ids: allCited,
    uncited_accepted_claim_ids: uncitedAccepted,
    unresolved_contradictions: unresolvedContradictionRefs,
    waivers_disclosed: waiversDisclosed,
    sections,
    source_count: canonicalHashes.filter((h) => h.path.includes('source-cards/')).length,
    claim_count: acceptedClaimIds.length,
    contradiction_count: unresolvedContradictionRefs.length,
    review_finding_count: 0,
    gate_result_count: research.sections.filter((s) => existsSync(join(packPath, 'audits', `${s.id}-gate.json`))).length,
    integrity_checks: checks,
  });

  // Update research.yaml: frozen_at + bump section statuses to 'frozen'
  const frozenResearch: ResearchYaml = {
    ...research,
    frozen_at: frozenAt,
    sections: research.sections.map((s) => ({ ...s, status: 'frozen' as const })),
  };
  await writeFile(yamlPath, yamlStringify(frozenResearch, { lineWidth: 0 }), 'utf8');

  const auditsDir = join(packPath, 'audits');
  await mkdir(auditsDir, { recursive: true });
  // Remove any stale refusal from a previous run
  for (const stale of ['freeze-refusal.json', 'freeze-refusal.md']) {
    const p = join(auditsDir, stale);
    if (existsSync(p)) await unlink(p);
  }
  const jsonPath = join(auditsDir, 'freeze-receipt.json');
  const mdPath = join(auditsDir, 'freeze-receipt.md');
  await writeFile(jsonPath, JSON.stringify(receipt, null, 2), 'utf8');
  await writeFile(mdPath, renderFreezeReceiptMarkdown(receipt), 'utf8');

  return {
    packPath,
    verdict: 'frozen',
    jsonPath,
    markdownPath: mdPath,
    receiptPayload: receipt,
    refusalPayload: null,
    reasonsCount: 0,
    citedClaimCount: allCited.length,
    uncitedAcceptedClaimCount: uncitedAccepted.length,
  };
}

async function writeRefusal(args: {
  packPath: string;
  pid: string;
  topic: string;
  refusal: RefusalContext;
}): Promise<FreezeSummary> {
  const checkedAt = new Date().toISOString();
  const nextActions = buildRefusalNextActions(args.refusal);
  const payload: FreezeRefusalPayload = FreezeRefusalPayloadSchema.parse({
    pack_id: args.pid,
    pack_topic: args.topic,
    checked_at: checkedAt,
    verdict: 'refused',
    reasons: args.refusal.reasons,
    blocking_reasons: args.refusal.blockingReasons,
    missing_artifacts: args.refusal.missingArtifacts,
    invalid_artifacts: args.refusal.invalidArtifacts,
    next_actions: nextActions,
    would_freeze: false,
  });

  const auditsDir = join(args.packPath, 'audits');
  await mkdir(auditsDir, { recursive: true });
  // Remove any stale receipt from a previous successful freeze that has now regressed
  for (const stale of ['freeze-receipt.json', 'freeze-receipt.md']) {
    const p = join(auditsDir, stale);
    if (existsSync(p)) await unlink(p);
  }
  const jsonPath = join(auditsDir, 'freeze-refusal.json');
  const mdPath = join(auditsDir, 'freeze-refusal.md');
  await writeFile(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
  await writeFile(mdPath, renderFreezeRefusalMarkdown(payload), 'utf8');

  return {
    packPath: args.packPath,
    verdict: 'refused',
    jsonPath,
    markdownPath: mdPath,
    receiptPayload: null,
    refusalPayload: payload,
    reasonsCount: payload.reasons.length,
    citedClaimCount: 0,
    uncitedAcceptedClaimCount: 0,
  };
}

function buildRefusalNextActions(refusal: RefusalContext): string[] {
  const actions = new Set<string>();
  for (const r of refusal.reasons) {
    if (r.includes('pack-audit') || r.includes('Pack audit')) {
      actions.add('Run `research-os audit` after addressing repair items; freeze requires verdict=ready_for_synthesis.');
    }
    if (r.includes('handoff') || r.includes('Cowork handoff')) {
      actions.add('Run `research-os cowork handoff` after the pack reaches synthesis_ready.');
    }
    if (r.includes('synth') || r.includes('Synthesis')) {
      actions.add('Run `research-os synth workspace` to lay out the synthesis area (it refuses unless mode=synthesis_ready).');
    }
    if (r.includes('final-report')) {
      actions.add('Edit synthesis/final-report.md to cite accepted claims via [claim:clm_...] references.');
    }
    if (r.includes('unknown claim_id')) {
      actions.add('Replace any [claim:...] citation in synthesis with a claim_id that exists in the pack.');
    }
    if (r.includes('repair or rejected')) {
      actions.add('Remove citations to repair/rejected claims from synthesis or repair them via review.');
    }
    if (r.includes('contradiction') && r.includes('not disclosed')) {
      actions.add('Disclose every unresolved contradiction by id in decision-brief.md or final-report.md.');
    }
    if (r.includes('Waiver') && r.includes('not disclosed')) {
      actions.add('Disclose each active waiver by family.applied_to in decision-brief.md or final-report.md.');
    }
    if (r.includes('gate result on file')) {
      actions.add('Run `research-os gate <section>` for any section without a gate audit.');
    }
    if (r.includes('failed to parse')) {
      actions.add('Repair the malformed canonical artifact reported above (zod will not parse a corrupt file).');
    }
  }
  if (actions.size === 0) {
    actions.add('Re-run `research-os audit` to surface a fresh next-actions list.');
  }
  return Array.from(actions);
}
