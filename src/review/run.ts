import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

import { PackNotFoundError, SectionNotFoundError } from '../errors.js';
import { ResearchYamlSchema, type ResearchYaml, type Section } from '../intake/schema.js';
import { ClaimSchema, type Claim } from '../claims/schema.js';
import { ContradictionSchema, type Contradiction } from '../contradictions/schema.js';
import {
  FetchReceiptSchema,
  SourceCardSchema,
  type FetchReceipt,
  type SourceCard,
} from '../sources/schema.js';
import { SectionGateResultSchema, type SectionGateResult } from '../gates/schema.js';

import {
  defaultReviewers,
  pickReviewer,
} from './reviewers/index.js';
import { deriveClaimReviews } from './decision.js';
import { renderReviewMarkdown } from './markdown.js';
import {
  ClaimReviewSchema,
  ReviewFindingSchema,
  ReviewSnapshotSchema,
  type ClaimReview,
  type ReviewFinding,
  type ReviewSnapshot,
} from './schema.js';
import type {
  DraftFinding,
  FindingSeverity,
  ReviewDecision,
  ReviewerName,
  RunReviewOptions,
  RunReviewSummary,
} from './types.js';

async function readJsonl<T>(
  packPath: string,
  rel: string,
  parse: (raw: unknown) => T,
): Promise<T[]> {
  const path = join(packPath, rel);
  if (!existsSync(path)) return [];
  const text = await readFile(path, 'utf8');
  const out: T[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    out.push(parse(JSON.parse(line)));
  }
  return out;
}

async function readSourceCards(packPath: string): Promise<SourceCard[]> {
  const dir = join(packPath, 'evidence', 'source-cards');
  if (!existsSync(dir)) return [];
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(dir);
  const cards: SourceCard[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const text = await readFile(join(dir, entry), 'utf8');
    cards.push(SourceCardSchema.parse(JSON.parse(text)));
  }
  return cards;
}

async function readGateResult(
  packPath: string,
  sectionId: string,
): Promise<SectionGateResult | null> {
  const path = join(packPath, 'audits', `${sectionId}-gate.json`);
  if (!existsSync(path)) return null;
  const text = await readFile(path, 'utf8');
  return SectionGateResultSchema.parse(JSON.parse(text));
}

async function readBriefText(
  packPath: string,
  sectionId: string,
): Promise<string | null> {
  const path = join(packPath, 'sections', sectionId, 'brief.md');
  if (!existsSync(path)) return null;
  return readFile(path, 'utf8');
}

async function readRawTextBySource(
  packPath: string,
  receipts: FetchReceipt[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const r of receipts) {
    if (r.fetch_outcome !== 'ok' || !r.raw_text_path) continue;
    const path = join(packPath, r.raw_text_path);
    if (!existsSync(path)) continue;
    if (map.has(r.source_id)) continue;
    map.set(r.source_id, await readFile(path, 'utf8'));
  }
  return map;
}

function makeFindingId(args: {
  sectionId: string;
  category: string;
  claimIds: string[];
  reviewer: ReviewerName;
}): string {
  const sortedClaimIds = [...args.claimIds].sort().join(',');
  const hash = createHash('sha256')
    .update(`${args.sectionId}|${args.category}|${sortedClaimIds}|${args.reviewer}`)
    .digest('hex')
    .slice(0, 12);
  return `fnd_${hash}`;
}

function isValidReference(
  draft: DraftFinding,
  knownClaimIds: Set<string>,
  knownSourceIds: Set<string>,
): boolean {
  if (draft.claim_ids.length === 0) return false;
  for (const cid of draft.claim_ids) {
    if (!knownClaimIds.has(cid)) return false;
  }
  for (const sid of draft.source_ids) {
    if (!knownSourceIds.has(sid)) return false;
  }
  return true;
}

function buildFinding(args: {
  draft: DraftFinding;
  sectionId: string;
  reviewer: ReviewerName;
  reviewMethod: string;
}): ReviewFinding {
  const { draft, sectionId, reviewer, reviewMethod } = args;
  return ReviewFindingSchema.parse({
    finding_id: makeFindingId({
      sectionId,
      category: draft.category,
      claimIds: draft.claim_ids,
      reviewer,
    }),
    section_id: sectionId,
    claim_ids: draft.claim_ids,
    source_ids: draft.source_ids,
    category: draft.category,
    severity: draft.severity,
    summary: draft.summary,
    evidence: draft.evidence,
    required_action: draft.required_action,
    reviewer,
    review_method: reviewMethod,
    confidence: draft.confidence,
    created_at: new Date().toISOString(),
  });
}

async function loadResearchYaml(packPath: string): Promise<ResearchYaml> {
  const yamlPath = join(packPath, 'research.yaml');
  if (!existsSync(yamlPath)) throw new PackNotFoundError(packPath);
  const text = await readFile(yamlPath, 'utf8');
  return ResearchYamlSchema.parse(yamlParse(text));
}

async function maybePromoteToReviewed(
  packPath: string,
  sectionId: string,
  allAccepted: boolean,
): Promise<boolean> {
  if (!allAccepted) return false;
  const yamlPath = join(packPath, 'research.yaml');
  const text = await readFile(yamlPath, 'utf8');
  const research = ResearchYamlSchema.parse(yamlParse(text));
  const idx = research.sections.findIndex((s) => s.id === sectionId);
  if (idx < 0) return false;
  const current = research.sections[idx]!;
  if (current.status !== 'gated') return false;
  research.sections[idx] = { ...current, status: 'reviewed' };
  await writeFile(yamlPath, yamlStringify(research, { lineWidth: 0 }), 'utf8');
  return true;
}

export async function review(options: RunReviewOptions): Promise<RunReviewSummary> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  if (!existsSync(join(packPath, 'research.yaml'))) throw new PackNotFoundError(packPath);
  const sectionDir = join(packPath, 'sections', options.sectionId);
  if (!existsSync(sectionDir)) throw new SectionNotFoundError(options.sectionId);

  const research = await loadResearchYaml(packPath);
  const section: Section | undefined = research.sections.find((s) => s.id === options.sectionId);
  if (!section) throw new SectionNotFoundError(options.sectionId);

  const claims = await readJsonl<Claim>(packPath, `sections/${options.sectionId}/claims.jsonl`, (r) => ClaimSchema.parse(r));
  let candidateClaims = claims.filter((c) => c.review_state === 'candidate');
  if (options.triagedOnly) {
    const { readTriagedClaimIds } = await import('../triage/run.js');
    const allowed = await readTriagedClaimIds(packPath, options.sectionId);
    candidateClaims = candidateClaims.filter((c) => allowed.has(c.claim_id));
  }
  const sources = await readSourceCards(packPath);
  const receipts = await readJsonl<FetchReceipt>(packPath, 'evidence/fetch-log.jsonl', (r) => FetchReceiptSchema.parse(r));
  const contradictions = await readJsonl<Contradiction>(packPath, `sections/${options.sectionId}/contradictions.jsonl`, (r) => ContradictionSchema.parse(r));
  const gateResult = await readGateResult(packPath, options.sectionId);
  const rawTextBySourceId = await readRawTextBySource(packPath, receipts);
  const briefText = await readBriefText(packPath, options.sectionId);

  const reviewers = options.reviewers ?? defaultReviewers();
  const reviewer = await pickReviewer(reviewers);

  const result = await reviewer.review({
    research,
    section,
    candidateClaims,
    sources,
    receipts,
    contradictions,
    gateResult,
    rawTextBySourceId,
    briefText,
  });

  if (!result.ok) {
    // Reviewer-level failure (e.g. Ollama HTTP error). Fall back to heuristic if available.
    const heuristic = reviewers.find((r) => r.name === 'heuristic');
    if (!heuristic || heuristic === reviewer) {
      throw new Error(`Reviewer "${reviewer.name}" failed and no fallback available: ${result.error}`);
    }
    return reviewWithSpecificReviewer({
      packPath,
      options,
      reviewer: heuristic,
      research,
      section,
      claims,
      candidateClaims,
      sources,
      receipts,
      contradictions,
      gateResult,
      rawTextBySourceId,
      briefText,
    });
  }

  const knownClaimIds = new Set(claims.map((c) => c.claim_id));
  const knownSourceIds = new Set(sources.map((s) => s.source_id));
  let llmFindingsRejected = 0;
  const acceptedDrafts: DraftFinding[] = [];
  for (const d of result.drafts) {
    if (reviewer.name === 'ollama-intern' && !isValidReference(d, knownClaimIds, knownSourceIds)) {
      llmFindingsRejected += 1;
      continue;
    }
    acceptedDrafts.push(d);
  }

  return finalizeReview({
    packPath,
    sectionId: options.sectionId,
    reviewer: reviewer.name,
    reviewMethod: result.method,
    candidateClaims,
    drafts: acceptedDrafts,
    llmFindingsRejected,
  });
}

interface ReviewWithSpecificReviewerArgs {
  packPath: string;
  options: RunReviewOptions;
  reviewer: ReturnType<typeof pickReviewer> extends Promise<infer T> ? T : never;
  research: ResearchYaml;
  section: Section;
  claims: Claim[];
  candidateClaims: Claim[];
  sources: SourceCard[];
  receipts: FetchReceipt[];
  contradictions: Contradiction[];
  gateResult: SectionGateResult | null;
  rawTextBySourceId: Map<string, string>;
  briefText: string | null;
}

async function reviewWithSpecificReviewer(args: ReviewWithSpecificReviewerArgs): Promise<RunReviewSummary> {
  const result = await args.reviewer.review({
    research: args.research,
    section: args.section,
    candidateClaims: args.candidateClaims,
    sources: args.sources,
    receipts: args.receipts,
    contradictions: args.contradictions,
    gateResult: args.gateResult,
    rawTextBySourceId: args.rawTextBySourceId,
    briefText: args.briefText,
  });
  if (!result.ok) {
    throw new Error(`Fallback reviewer "${args.reviewer.name}" also failed: ${result.error}`);
  }
  return finalizeReview({
    packPath: args.packPath,
    sectionId: args.options.sectionId,
    reviewer: args.reviewer.name,
    reviewMethod: result.method,
    candidateClaims: args.candidateClaims,
    drafts: result.drafts,
    llmFindingsRejected: 0,
  });
}

interface FinalizeArgs {
  packPath: string;
  sectionId: string;
  reviewer: ReviewerName;
  reviewMethod: string;
  candidateClaims: Claim[];
  drafts: DraftFinding[];
  llmFindingsRejected: number;
}

async function finalizeReview(args: FinalizeArgs): Promise<RunReviewSummary> {
  const findings: ReviewFinding[] = args.drafts.map((d) =>
    buildFinding({
      draft: d,
      sectionId: args.sectionId,
      reviewer: args.reviewer,
      reviewMethod: args.reviewMethod,
    }),
  );
  // Dedup by finding_id within this run
  const seen = new Set<string>();
  const dedupedFindings: ReviewFinding[] = [];
  let dedupedCount = 0;
  for (const f of findings) {
    if (seen.has(f.finding_id)) {
      dedupedCount += 1;
      continue;
    }
    seen.add(f.finding_id);
    dedupedFindings.push(f);
  }

  const claimReviews: ClaimReview[] = deriveClaimReviews({
    claims: args.candidateClaims,
    findings: dedupedFindings,
    reviewer: args.reviewer,
    reviewMethod: args.reviewMethod,
  });

  const decisionCounts: Record<ReviewDecision, number> = {
    accepted_for_synthesis: 0,
    rejected: 0,
    needs_scope_repair: 0,
    needs_source_repair: 0,
    needs_contradiction_mapping: 0,
    needs_human_review: 0,
  };
  for (const r of claimReviews) decisionCounts[r.decision] += 1;

  const severityCounts: Record<FindingSeverity, number> = { info: 0, warn: 0, block: 0 };
  for (const f of dedupedFindings) severityCounts[f.severity] += 1;

  const allAccepted =
    args.candidateClaims.length > 0 &&
    claimReviews.every((r) => r.decision === 'accepted_for_synthesis');
  const promoted = await maybePromoteToReviewed(args.packPath, args.sectionId, allAccepted);

  const snapshot: ReviewSnapshot = ReviewSnapshotSchema.parse({
    section_id: args.sectionId,
    reviewer: args.reviewer,
    review_method: args.reviewMethod,
    reviewed_at: new Date().toISOString(),
    candidate_claims: args.candidateClaims.length,
    findings: dedupedFindings,
    claim_reviews: claimReviews,
    decision_counts: decisionCounts,
    severity_counts: severityCounts,
    llm_findings_rejected_ungrounded: args.llmFindingsRejected,
    promoted_to_reviewed: promoted,
  });

  const auditsDir = join(args.packPath, 'audits');
  await mkdir(auditsDir, { recursive: true });
  await writeFile(
    join(auditsDir, `${args.sectionId}-review.json`),
    JSON.stringify(snapshot, null, 2),
    'utf8',
  );
  await writeFile(
    join(auditsDir, `${args.sectionId}-review.md`),
    renderReviewMarkdown(snapshot),
    'utf8',
  );

  // Append-only ledgers
  const findingsPath = join(auditsDir, `${args.sectionId}-findings.jsonl`);
  for (const f of dedupedFindings) {
    await appendFile(findingsPath, JSON.stringify(f) + '\n', 'utf8');
  }
  const reviewsPath = join(args.packPath, 'sections', args.sectionId, 'claim-reviews.jsonl');
  for (const r of claimReviews) {
    await appendFile(reviewsPath, JSON.stringify(ClaimReviewSchema.parse(r)) + '\n', 'utf8');
  }

  return {
    sectionId: args.sectionId,
    reviewer: args.reviewer,
    reviewMethod: args.reviewMethod,
    candidateClaims: args.candidateClaims.length,
    findingsAdded: dedupedFindings.length,
    findingsDeduped: dedupedCount,
    llmFindingsRejected: args.llmFindingsRejected,
    decisions: decisionCounts,
    blockingFindings: dedupedFindings.filter((f) => f.severity === 'block').length,
    promotedToReviewed: promoted,
  };
}
