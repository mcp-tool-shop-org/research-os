import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

import { PackNotFoundError, SectionNotFoundError } from '../errors.js';
import { ResearchYamlSchema, type ResearchYaml } from '../intake/schema.js';
import { ClaimSchema, type Claim } from '../claims/schema.js';
import { ContradictionSchema, type Contradiction } from '../contradictions/schema.js';
import { ContradictionResolutionSchema, type ContradictionResolution } from '../contradictions/resolution-schema.js';
import { FetchReceiptSchema, SourceCardSchema, type FetchReceipt, type SourceCard } from '../sources/schema.js';
import { ClaimReviewSchema, type ClaimReview } from '../review/schema.js';
import { readOverrides } from '../sources/source-card-overrides.js';
import { getEffectivePublisher, getEffectiveSourceType } from '../sources/effective-card.js';

import {
  checkClaimIntegrity,
  checkContradiction,
  checkFreshness,
  checkScopeIntegrity,
  checkSectionBudget,
  checkSourceFloor,
  applyWaivers,
  checkAcceptedClaimFloor,
} from './checks/index.js';
import { renderGateMarkdown } from './markdown.js';
import { SectionGateResultSchema } from './schema.js';
import type {
  ClaimCounts,
  ContradictionCounts,
  FreshnessSummary,
  GateCheckResult,
  GateInput,
  RunGateOptions,
  ScopeIntegritySummary,
  SectionGateResult,
  SourceCounts,
  Verdict,
} from './types.js';

// B-C-005: per-line skip-malformed pattern (mirrors src/audit/run.ts). A
// single malformed JSONL line no longer crashes the entire gate run with an
// opaque ZodError; the gate result instead carries a `warnings[]` array of
// {path, line, reason} records the operator can inspect.
async function readJsonl<T>(
  packPath: string,
  rel: string,
  parse: (raw: unknown) => T,
  warnings: Array<{ path: string; line: number; reason: string }>,
): Promise<T[]> {
  const path = join(packPath, rel);
  if (!existsSync(path)) return [];
  const text = await readFile(path, 'utf8');
  const out: T[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    try {
      out.push(parse(JSON.parse(line)));
    } catch (err) {
      warnings.push({
        path: rel,
        // 1-based line number for operator readability
        line: i + 1,
        reason: err instanceof Error ? err.message : 'parse error',
      });
    }
  }
  return out;
}

// B-GATES-002: every other gate input (claims/fetch-log/contradictions/reviews/
// resolutions) degrades gracefully via readJsonl's skip-with-warning collector,
// but source cards were parsed with no guard — one corrupt .json aborted the
// whole gate run with an opaque ZodError. Feed malformed cards into the same
// `malformed_jsonl_warnings` collector so a bad card is skipped + surfaced,
// consistent with the other readers in this file.
async function readSourceCards(
  packPath: string,
  warnings: Array<{ path: string; line: number; reason: string }>,
): Promise<SourceCard[]> {
  const dir = join(packPath, 'evidence', 'source-cards');
  if (!existsSync(dir)) return [];
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(dir);
  const cards: SourceCard[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    try {
      const text = await readFile(join(dir, entry), 'utf8');
      cards.push(SourceCardSchema.parse(JSON.parse(text)));
    } catch (err) {
      warnings.push({
        // one card per file — `line: 0` signals "whole-file" rather than a
        // specific JSONL line, matching the nonnegative-int schema.
        path: join('evidence', 'source-cards', entry),
        line: 0,
        reason: err instanceof Error ? err.message : 'parse error',
      });
    }
  }
  return cards;
}

function summarizeClaimCounts(input: GateInput): ClaimCounts {
  const c = input.claims;
  const cand = input.candidateClaims;
  const cardIds = new Set(input.sources.map((s) => s.source_id));
  return {
    total: c.length,
    candidate: cand.length,
    with_evidence_excerpt: cand.filter((x) => x.evidence_excerpt.trim().length > 0).length,
    with_source_hashes: cand.filter((x) => x.source_hashes.length > 0).length,
    with_scope: cand.filter((x) => x.scope !== null).length,
    with_not: cand.filter((x) => x.not !== null).length,
    universal_scope_null: cand.filter((x) => x.scope === null).length,
    orphans: cand.filter((x) => x.source_ids.some((sid) => !cardIds.has(sid))).length,
  };
}

function summarizeSourceCounts(input: GateInput): SourceCounts {
  const cards = input.sources;
  const sectionCards = cards.filter((c) => c.section_id === input.section.id);
  const failed = input.receipts.filter((r) => r.fetch_outcome !== 'ok').length;
  const overrides = input.overrides ?? [];
  const publishers = new Set(
    cards
      .map((c) => getEffectivePublisher(c, overrides))
      .filter((p): p is string => typeof p === 'string'),
  );
  const sectionPublishers = new Set(
    sectionCards
      .map((c) => getEffectivePublisher(c, overrides))
      .filter((p): p is string => typeof p === 'string'),
  );
  const effectiveType = (c: SourceCard): string => getEffectiveSourceType(c, overrides);
  return {
    total: cards.length,
    primary: cards.filter((c) => effectiveType(c) === 'primary').length,
    secondary: cards.filter((c) => effectiveType(c) === 'secondary').length,
    forum: cards.filter((c) => effectiveType(c) === 'forum').length,
    benchmark: cards.filter((c) => effectiveType(c) === 'benchmark').length,
    docs: cards.filter((c) => effectiveType(c) === 'docs').length,
    unknown: cards.filter((c) => effectiveType(c) === 'unknown').length,
    independent_publishers: publishers.size,
    failed_fetches: failed,
    section_primary: sectionCards.filter((c) => effectiveType(c) === 'primary').length,
    section_independent_publishers: sectionPublishers.size,
  };
}

function buildEffectiveStatuses(resolutions: ContradictionResolution[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!resolutions || resolutions.length === 0) return map;
  const sorted = [...resolutions].sort((a, b) => a.resolved_at.localeCompare(b.resolved_at));
  for (const r of sorted) map.set(r.contradiction_id, r.status);
  return map;
}

function isEffectivelyUnresolved(contradictionId: string, rawStatus: string, effectiveStatuses: Map<string, string>): boolean {
  const effective = effectiveStatuses.get(contradictionId);
  return effective !== undefined ? effective === 'unresolved' : rawStatus === 'unresolved';
}

function summarizeContradictionCounts(input: GateInput): ContradictionCounts {
  const all = input.contradictions;
  const effectiveStatuses = buildEffectiveStatuses(input.resolutions);
  const unresolved = all.filter((c) => isEffectivelyUnresolved(c.contradiction_id, c.status, effectiveStatuses));
  const blocking = unresolved.filter(
    (c) => c.severity === 'blocking' || c.severity === 'high',
  );
  const byType: Record<string, number> = {};
  for (const c of all) {
    byType[c.type] = (byType[c.type] ?? 0) + 1;
  }
  return {
    total: all.length,
    unresolved: unresolved.length,
    blocking: blocking.length,
    by_type: byType,
  };
}

function summarizeFreshness(input: GateInput): FreshnessSummary {
  const cfg = input.research.gates.freshness;
  const policy = input.research.freshness;
  const cards = input.sources;
  let stale = 0;
  let unknownDate = 0;
  for (const c of cards) {
    if (!c.published_at) {
      unknownDate += 1;
      continue;
    }
    if (policy.max_source_age_months === null) continue;
    const d = Date.parse(c.published_at);
    if (Number.isNaN(d)) {
      unknownDate += 1;
      continue;
    }
    const ageMonths = (Date.now() - d) / (1000 * 60 * 60 * 24 * 30.44);
    if (ageMonths > policy.max_source_age_months) stale += 1;
  }
  return {
    policy_required: policy.required,
    max_source_age_months: policy.max_source_age_months,
    stale_source_policy: cfg.stale_source_policy,
    stale_count: stale,
    unknown_date_count: unknownDate,
  };
}

function summarizeScopeIntegrity(input: GateInput): ScopeIntegritySummary {
  const cand = input.candidateClaims;
  const effectiveStatuses = buildEffectiveStatuses(input.resolutions);
  const overgen = input.contradictions.filter(
    (c) => c.type === 'overgeneralization_risk' && isEffectivelyUnresolved(c.contradiction_id, c.status, effectiveStatuses),
  );
  const blocking = overgen.filter(
    (c) => c.severity === 'blocking' || c.severity === 'high',
  );
  return {
    universal_claims: cand.filter((c) => c.scope === null).length,
    scoped_claims: cand.filter((c) => c.scope !== null).length,
    with_not_constraint: cand.filter((c) => c.not !== null).length,
    overgen_risks_total: overgen.length,
    overgen_risks_blocking: blocking.length,
  };
}

function deriveVerdict(results: GateCheckResult[]): {
  verdict: Verdict;
  synthesis_eligible: boolean;
  blocking_reasons: string[];
} {
  const blocking = results.filter((r) => r.blocks_synthesis && (r.status === 'fail' || r.status === 'warn_with_waiver'));
  const fails = results.filter((r) => r.status === 'fail');
  const warns = results.filter((r) => r.status === 'warn' || r.status === 'warn_with_waiver');
  if (blocking.length > 0) {
    return {
      verdict: 'blocked',
      synthesis_eligible: false,
      blocking_reasons: blocking.map((r) => `${r.family}.${r.check}: ${r.detail}`),
    };
  }
  if (fails.length > 0) {
    return { verdict: 'fail', synthesis_eligible: true, blocking_reasons: [] };
  }
  if (warns.length > 0) {
    return { verdict: 'warn', synthesis_eligible: true, blocking_reasons: [] };
  }
  return { verdict: 'pass', synthesis_eligible: true, blocking_reasons: [] };
}

function buildNextActions(results: GateCheckResult[]): string[] {
  const actions: string[] = [];
  for (const r of results) {
    if (r.status === 'fail') {
      switch (r.family) {
        case 'source_floor':
          if (r.check === 'min_sources') actions.push('Run `research-os gather` with additional URLs to reach the minimum source count.');
          else if (r.check === 'min_independent_publishers') actions.push('Add sources from additional publishers to satisfy publisher diversity.');
          else if (r.check === 'primary_sources_required') actions.push('Add primary sources or grant a primary_source_waiver in research.yaml with a reason and compensating_controls.');
          break;
        case 'claim_integrity':
          if (r.check === 'no_orphan_claims') actions.push('Re-run gather for missing source_ids or remove orphan claims from claims.jsonl.');
          else if (r.check === 'fetch_receipt_anchored') actions.push('Re-run gather to produce fresh fetch receipts for the affected claims.');
          else if (r.check === 'source_hashes_present' || r.check === 'evidence_excerpt_present') actions.push('Re-run claim extract; affected claims are missing fields the schema would reject.');
          break;
        case 'scope_integrity':
          if (r.check === 'no_blocking_overgeneralization') actions.push('Reconcile blocking overgeneralization_risk contradictions, or mark them preserved_deliberately with documented rationale.');
          break;
        case 'contradiction':
          if (r.check === 'unresolved_contradictions_block_synthesis') actions.push('Resolve, preserve, or reject blocking contradictions before synthesis.');
          break;
        case 'freshness':
          if (r.check === 'no_stale_sources') actions.push('Replace stale sources with recent ones, or change pack freshness policy if intentional.');
          break;
        case 'waivers':
          actions.push('Fix the waiver entry in research.yaml.primary_source_waiver (reason + compensating_controls + pack policy must allow it).');
          break;
        case 'accepted_claim_floor':
          actions.push('Gather more sources, extract claims, and promote at least 3 claims from at least 2 distinct sources to accepted_for_synthesis via review. Waivers cannot bypass this floor.');
          break;
        default:
          break;
      }
    }
  }
  return Array.from(new Set(actions));
}

async function loadResearchYaml(packPath: string): Promise<ResearchYaml> {
  const yamlPath = join(packPath, 'research.yaml');
  if (!existsSync(yamlPath)) throw new PackNotFoundError(packPath);
  const text = await readFile(yamlPath, 'utf8');
  return ResearchYamlSchema.parse(yamlParse(text));
}

async function updateSectionStatus(
  packPath: string,
  sectionId: string,
  synthesisEligible: boolean,
): Promise<void> {
  const yamlPath = join(packPath, 'research.yaml');
  const text = await readFile(yamlPath, 'utf8');
  const research = ResearchYamlSchema.parse(yamlParse(text));
  const idx = research.sections.findIndex((s) => s.id === sectionId);
  if (idx < 0) return;
  const current = research.sections[idx]!;
  // Only upgrade to gated when synthesis-eligible and not already past it.
  if (synthesisEligible) {
    const order = ['draft', 'gathering', 'gated', 'reviewed', 'frozen'] as const;
    const currentRank = order.indexOf(current.status);
    const gatedRank = order.indexOf('gated');
    if (currentRank < gatedRank) {
      research.sections[idx] = { ...current, status: 'gated' };
      await writeFile(yamlPath, yamlStringify(research, { lineWidth: 0 }), 'utf8');
    }
  }
}

export async function gate(options: RunGateOptions): Promise<SectionGateResult> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  if (!existsSync(join(packPath, 'research.yaml'))) throw new PackNotFoundError(packPath);
  const sectionDir = join(packPath, 'sections', options.sectionId);
  if (!existsSync(sectionDir)) throw new SectionNotFoundError(options.sectionId);
  const research = await loadResearchYaml(packPath);
  const section = research.sections.find((s) => s.id === options.sectionId);
  if (!section) throw new SectionNotFoundError(options.sectionId);

  // B-C-005: per-line warnings collector — fed to every readJsonl call so
  // one malformed line in any input no longer kills the whole gate run.
  const malformedWarnings: Array<{ path: string; line: number; reason: string }> = [];
  const claims = await readJsonl<Claim>(packPath, `sections/${options.sectionId}/claims.jsonl`, (r) => ClaimSchema.parse(r), malformedWarnings);
  const candidateClaims = claims.filter((c) => c.review_state === 'candidate');
  const sources = await readSourceCards(packPath, malformedWarnings);
  const receipts = await readJsonl<FetchReceipt>(packPath, 'evidence/fetch-log.jsonl', (r) => FetchReceiptSchema.parse(r), malformedWarnings);
  const contradictions = await readJsonl<Contradiction>(packPath, `sections/${options.sectionId}/contradictions.jsonl`, (r) => ContradictionSchema.parse(r), malformedWarnings);
  const claimReviews = await readJsonl<ClaimReview>(packPath, `sections/${options.sectionId}/claim-reviews.jsonl`, (r) => ClaimReviewSchema.parse(r), malformedWarnings);
  const resolutions = await readJsonl<ContradictionResolution>(packPath, `sections/${options.sectionId}/contradiction-resolutions.jsonl`, (r) => ContradictionResolutionSchema.parse(r), malformedWarnings);
  // Source-card override ledger — applied at read time via the effective-card
  // helpers (getEffectivePublisher / getEffectiveSourceType). Missing ledger
  // file is fine; readOverrides returns [].
  const overrides = await readOverrides(packPath);

  const input: GateInput = {
    research,
    section,
    claims,
    candidateClaims,
    sources,
    receipts,
    contradictions,
    claimReviews,
    resolutions,
    overrides,
  };

  const rawResults: GateCheckResult[] = [
    ...checkSourceFloor(input),
    ...checkClaimIntegrity(input),
    ...checkScopeIntegrity(input),
    ...checkFreshness(input),
    ...checkContradiction(input),
    ...checkSectionBudget(input),
    ...checkAcceptedClaimFloor(input),
  ];

  const { updatedResults, waivers_applied, waiver_validation_failures } = applyWaivers(input, rawResults);
  const finalResults = [...updatedResults, ...waiver_validation_failures];

  const failures = finalResults.filter((r) => r.status === 'fail');
  const warnings = finalResults.filter((r) => r.status === 'warn' || r.status === 'warn_with_waiver');
  const { verdict, synthesis_eligible, blocking_reasons } = deriveVerdict(finalResults);

  const result: SectionGateResult = SectionGateResultSchema.parse({
    section_id: options.sectionId,
    verdict,
    summary: buildSummary(verdict, synthesis_eligible, failures.length, warnings.length, waivers_applied.length),
    checked_at: new Date().toISOString(),
    synthesis_eligible,
    gate_results: finalResults,
    failures,
    warnings,
    waivers_applied,
    blocking_reasons,
    claim_counts: summarizeClaimCounts(input),
    source_counts: summarizeSourceCounts(input),
    contradiction_counts: summarizeContradictionCounts(input),
    freshness_summary: summarizeFreshness(input),
    scope_integrity_summary: summarizeScopeIntegrity(input),
    next_actions: buildNextActions(finalResults),
    // B-C-005: surface skip-malformed warnings on the gate result. Named
    // `malformed_jsonl_warnings` to avoid colliding with the existing
    // `warnings` field that lists warn-status GateCheckResults.
    malformed_jsonl_warnings: malformedWarnings,
  });

  const auditsDir = join(packPath, 'audits');
  await mkdir(auditsDir, { recursive: true });
  await writeFile(
    join(auditsDir, `${options.sectionId}-gate.json`),
    JSON.stringify(result, null, 2),
    'utf8',
  );
  await writeFile(
    join(auditsDir, `${options.sectionId}-gate.md`),
    renderGateMarkdown(result),
    'utf8',
  );

  await updateSectionStatus(packPath, options.sectionId, synthesis_eligible);

  return result;
}

function buildSummary(
  verdict: Verdict,
  eligible: boolean,
  failureCount: number,
  warningCount: number,
  waiverCount: number,
): string {
  const eligibility = eligible ? 'synthesis-eligible' : 'NOT synthesis-eligible';
  const failurePart = failureCount > 0 ? `${failureCount} failure(s)` : 'no failures';
  const warningPart = warningCount > 0 ? `${warningCount} warning(s)` : 'no warnings';
  const waiverPart = waiverCount > 0 ? `${waiverCount} waiver(s) applied` : 'no waivers';
  return `Verdict: ${verdict}. ${eligibility}. ${failurePart}; ${warningPart}; ${waiverPart}.`;
}
