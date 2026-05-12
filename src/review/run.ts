import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

import {
  PackNotFoundError,
  ReviewerCascadeFailedError,
  SectionNotFoundError,
} from '../errors.js';
import { ResearchYamlSchema, type ResearchYaml, type Section } from '../intake/schema.js';
import { ClaimSchema, type Claim } from '../claims/schema.js';
import { ContradictionSchema, type Contradiction } from '../contradictions/schema.js';
import { ContradictionResolutionSchema, type ContradictionResolution } from '../contradictions/resolution-schema.js';
import {
  FetchReceiptSchema,
  SourceCardSchema,
  type FetchReceipt,
  type SourceCard,
} from '../sources/schema.js';
import { ExcerptSchema, type Excerpt } from '../sources/excerpts/schema.js';
import { ledgerPathFor } from '../sources/excerpts/ledger.js';
import { SectionGateResultSchema, type SectionGateResult } from '../gates/schema.js';

import {
  DEFAULT_PROFILE,
  profileDir,
  readActiveProfile,
} from './profiles.js';
import type { ReviewerOptions } from './reviewer-options-schema.js';

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

// Load span-first excerpt ledgers for every source cited by the section's
// claims. Reviewers use this for structural grounding checks instead of
// re-normalising raw text.
async function readExcerptsBySource(
  packPath: string,
  claims: Claim[],
): Promise<Map<string, Map<string, Excerpt>>> {
  const out = new Map<string, Map<string, Excerpt>>();
  const sourceIds = new Set<string>();
  for (const c of claims) for (const sid of c.source_ids) sourceIds.add(sid);
  for (const sid of sourceIds) {
    const path = ledgerPathFor(packPath, sid);
    if (!existsSync(path)) continue;
    const text = await readFile(path, 'utf8');
    const index = new Map<string, Excerpt>();
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const e = ExcerptSchema.parse(JSON.parse(line));
        index.set(e.excerpt_id, e);
      } catch {
        /* skip malformed line */
      }
    }
    if (index.size > 0) out.set(sid, index);
  }
  return out;
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
  // Phase 1b-b (v0.8.0): claims the extract-time critic already excluded never
  // reach the review LLM. They get a synthetic ClaimReview with
  // decision='frame_excluded' carrying the critic's rationale. The reviewer
  // sees only the non-excluded candidates, so no LLM tokens are spent
  // re-judging admissibility — the topicality call lives at extract time.
  const frameExcludedClaims = candidateClaims.filter((c) => c.frame_excluded === true);
  candidateClaims = candidateClaims.filter((c) => c.frame_excluded !== true);
  const sources = await readSourceCards(packPath);
  const receipts = await readJsonl<FetchReceipt>(packPath, 'evidence/fetch-log.jsonl', (r) => FetchReceiptSchema.parse(r));
  const contradictions = await readJsonl<Contradiction>(packPath, `sections/${options.sectionId}/contradictions.jsonl`, (r) => ContradictionSchema.parse(r));
  const resolutions = await readJsonl<ContradictionResolution>(packPath, `sections/${options.sectionId}/contradiction-resolutions.jsonl`, (r) => ContradictionResolutionSchema.parse(r));
  const gateResult = await readGateResult(packPath, options.sectionId);
  const rawTextBySourceId = await readRawTextBySource(packPath, receipts);
  const excerptsBySourceId = await readExcerptsBySource(packPath, claims);
  const briefText = await readBriefText(packPath, options.sectionId);

  const reviewers = options.reviewers ?? defaultReviewers();

  // Multi-pass: run every available reviewer and merge findings. The classic
  // shape is general LLM + narrow-critic LLM + heuristic — each catches a
  // different failure mode, and the merger is append-only with dedup.
  if (options.multiPass) {
    return runMultiPassReview({
      packPath,
      options,
      reviewers,
      research,
      section,
      claims,
      candidateClaims,
      frameExcludedClaims,
      sources,
      receipts,
      contradictions,
      resolutions,
      gateResult,
      rawTextBySourceId,
      excerptsBySourceId,
      briefText,
    });
  }

  const reviewer = await pickReviewer(reviewers);

  const result = await reviewer.review({
    research,
    section,
    candidateClaims,
    sources,
    receipts,
    contradictions,
    resolutions,
    excerptsBySourceId,
    gateResult,
    rawTextBySourceId,
    briefText,
  });

  if (!result.ok) {
    // Reviewer-level failure (e.g. Ollama HTTP error). Fall back to heuristic if available.
    const heuristic = reviewers.find((r) => r.name === 'heuristic');
    if (!heuristic || heuristic === reviewer) {
      // B-C-002: structured cascade-failed error. Includes the failing
      // reviewer name + error so callers can distinguish from generic errors.
      // C2-002: pass window-progress through the ReviewerCascadeFailedError
      // constructor so the hint can report "Completed N/M window(s) before
      // failure." The constructor signature is owned by src/errors.ts (C1's
      // lane); both fields are optional there.
      throw new ReviewerCascadeFailedError(
        [`${reviewer.name}:${result.error}`],
        {
          completedWindows: result.completedWindows,
          totalWindows: result.totalWindows,
        },
      );
    }
    return reviewWithSpecificReviewer({
      packPath,
      options,
      reviewer: heuristic,
      research,
      section,
      claims,
      candidateClaims,
      frameExcludedClaims,
      sources,
      receipts,
      contradictions,
      resolutions,
      gateResult,
      rawTextBySourceId,
      excerptsBySourceId,
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
    frameExcludedClaims,
    drafts: acceptedDrafts,
    llmFindingsRejected,
    profile: options.profile ?? DEFAULT_PROFILE,
    research,
    reviewer_options: options.reviewer_options,
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
  // Phase 1b-b: claims the extract-time critic excluded. The reviewer does
  // NOT see them; finalizeReview emits synthetic ClaimReview records with
  // decision='frame_excluded'.
  frameExcludedClaims: Claim[];
  sources: SourceCard[];
  receipts: FetchReceipt[];
  contradictions: Contradiction[];
  resolutions?: ContradictionResolution[];
  gateResult: SectionGateResult | null;
  rawTextBySourceId: Map<string, string>;
  excerptsBySourceId: Map<string, Map<string, Excerpt>>;
  briefText: string | null;
}

interface MultiPassArgs extends Omit<ReviewWithSpecificReviewerArgs, 'reviewer'> {
  reviewers: ReadonlyArray<
    ReturnType<typeof pickReviewer> extends Promise<infer T> ? T : never
  >;
}

// Run every available reviewer in sequence, merging findings into one
// append-only ledger. Dedup by (claim_ids sorted, category, summary prefix).
// The merged "method" tag concatenates each reviewer's reported method so
// downstream consumers can see exactly which passes contributed.
async function runMultiPassReview(args: MultiPassArgs): Promise<RunReviewSummary> {
  const knownClaimIds = new Set(args.claims.map((c) => c.claim_id));
  const knownSourceIds = new Set(args.sources.map((s) => s.source_id));

  const allDrafts: DraftFinding[] = [];
  const methods: string[] = [];
  const failedReviewers: string[] = [];
  let llmFindingsRejected = 0;
  let pickedReviewerName: ReviewerName = 'heuristic';

  for (const reviewer of args.reviewers) {
    if (!(await reviewer.available())) continue;
    const result = await reviewer.review({
      research: args.research,
      section: args.section,
      candidateClaims: args.candidateClaims,
      sources: args.sources,
      receipts: args.receipts,
      contradictions: args.contradictions,
      resolutions: args.resolutions,
      excerptsBySourceId: args.excerptsBySourceId,
      gateResult: args.gateResult,
      rawTextBySourceId: args.rawTextBySourceId,
      briefText: args.briefText,
    });
    if (!result.ok) {
      failedReviewers.push(`${reviewer.name}:${result.error}`);
      continue;
    }
    methods.push(result.method);
    if (result.rejected_ungrounded) llmFindingsRejected += result.rejected_ungrounded;
    // The reviewer "name" recorded on the section is the one that contributed
    // the most findings — used for the snapshot's reviewer field. Default to
    // heuristic; let any LLM pass override.
    if (reviewer.name === 'ollama-intern') pickedReviewerName = 'ollama-intern';
    for (const d of result.drafts) {
      if (
        reviewer.name === 'ollama-intern' &&
        !isValidReference(d, knownClaimIds, knownSourceIds)
      ) {
        llmFindingsRejected += 1;
        continue;
      }
      allDrafts.push(d);
    }
  }

  if (allDrafts.length === 0 && failedReviewers.length === args.reviewers.length) {
    // B-C-002: every reviewer failed in multi-pass mode.
    // C2-002: multi-pass cascade has no single window-count to report (each
    // reviewer paged independently). Both fields stay undefined; the hint
    // falls back to the generic "Inspect each error and re-run" form.
    throw new ReviewerCascadeFailedError(failedReviewers);
  }

  // Dedup findings by (sorted claim_ids, category, summary prefix). Two
  // reviewers can flag the same problem; the section ledger should record it
  // once, not twice.
  const seen = new Set<string>();
  const merged: DraftFinding[] = [];
  for (const d of allDrafts) {
    const key = `${d.category}|${[...d.claim_ids].sort().join(',')}|${d.summary.toLowerCase().slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(d);
  }

  return finalizeReview({
    packPath: args.packPath,
    sectionId: args.options.sectionId,
    reviewer: pickedReviewerName,
    reviewMethod: methods.length > 0 ? `multi_pass(${methods.join(' + ')})` : 'multi_pass(empty)',
    candidateClaims: args.candidateClaims,
    frameExcludedClaims: args.frameExcludedClaims,
    drafts: merged,
    llmFindingsRejected,
    profile: args.options.profile ?? DEFAULT_PROFILE,
    research: args.research,
    reviewer_options: args.options.reviewer_options,
  });
}

async function reviewWithSpecificReviewer(args: ReviewWithSpecificReviewerArgs): Promise<RunReviewSummary> {
  const result = await args.reviewer.review({
    research: args.research,
    section: args.section,
    candidateClaims: args.candidateClaims,
    sources: args.sources,
    receipts: args.receipts,
    contradictions: args.contradictions,
    resolutions: args.resolutions,
    gateResult: args.gateResult,
    rawTextBySourceId: args.rawTextBySourceId,
    excerptsBySourceId: args.excerptsBySourceId,
    briefText: args.briefText,
  });
  if (!result.ok) {
    // B-C-002: structured cascade-failed error from the fallback reviewer path.
    // C2-002: forward window-progress through the constructor when the
    // failing reviewer had a paged window concept. Heuristic fallback has
    // no windows — both fields stay undefined and the hint falls back to
    // the simpler cascade message.
    throw new ReviewerCascadeFailedError(
      [`${args.reviewer.name}:${result.error}`],
      {
        completedWindows: result.completedWindows,
        totalWindows: result.totalWindows,
      },
    );
  }
  return finalizeReview({
    packPath: args.packPath,
    sectionId: args.options.sectionId,
    reviewer: args.reviewer.name,
    reviewMethod: result.method,
    candidateClaims: args.candidateClaims,
    frameExcludedClaims: args.frameExcludedClaims,
    drafts: result.drafts,
    llmFindingsRejected: 0,
    profile: args.options.profile ?? DEFAULT_PROFILE,
    research: args.research,
    reviewer_options: args.options.reviewer_options,
  });
}

interface FinalizeArgs {
  packPath: string;
  sectionId: string;
  reviewer: ReviewerName;
  reviewMethod: string;
  candidateClaims: Claim[];
  // Phase 1b-b: claims the extract-time critic excluded. They DID NOT reach
  // the reviewer; we synthesize one ClaimReview per excluded claim with
  // decision='frame_excluded' so downstream gates / cowork see them.
  frameExcludedClaims: Claim[];
  drafts: DraftFinding[];
  llmFindingsRejected: number;
  profile: string;
  // v0.3.1+: research context for resolving active section-scoped waivers.
  // Filtered against args.sectionId before passing to deriveClaimReviews.
  research: ResearchYaml;
  // v0.5+: sampling options from the active preset; stamped onto review.json.
  reviewer_options?: ReviewerOptions;
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

  const activeSectionWaivers = args.research.primary_source_waiver.section_waivers.filter(
    (w) => w.section_id === args.sectionId,
  );

  const reviewerClaimReviews: ClaimReview[] = deriveClaimReviews({
    claims: args.candidateClaims,
    findings: dedupedFindings,
    reviewer: args.reviewer,
    reviewMethod: args.reviewMethod,
    activeSectionWaivers,
    profile: args.profile !== DEFAULT_PROFILE ? args.profile : undefined,
  });

  // Phase 1b-b (v0.8.0): synthesize ClaimReview records for the
  // frame_excluded claims. They never reached the reviewer (no LLM call,
  // no findings); the critic already decided at extract time. The record
  // carries the critic's rationale forward into review.json + claim-reviews
  // so downstream gates and cowork see them as one bucket.
  const nowIso = new Date().toISOString();
  const frameExcludedReviews: ClaimReview[] = args.frameExcludedClaims.map((claim) => {
    const rationale = claim.frame_exclusion_rationale ?? null;
    const reasonLabel = claim.frame_exclusion_reason ?? null;
    const reasonPrefix = reasonLabel ? `${reasonLabel}: ` : '';
    const reason = rationale
      ? `Frame-excluded before review: ${reasonPrefix}${rationale}`
      : `Frame-excluded before review: ${reasonLabel ?? 'no rationale recorded'}`;
    return ClaimReviewSchema.parse({
      claim_id: claim.claim_id,
      decision: 'frame_excluded',
      reason,
      finding_ids: [],
      reviewer: args.reviewer,
      review_method: args.reviewMethod,
      created_at: nowIso,
      ...(args.profile !== DEFAULT_PROFILE ? { profile: args.profile } : {}),
    });
  });
  const claimReviews: ClaimReview[] = [...reviewerClaimReviews, ...frameExcludedReviews];

  const decisionCounts: Record<ReviewDecision, number> = {
    accepted_for_synthesis: 0,
    rejected: 0,
    frame_excluded: 0,
    needs_scope_repair: 0,
    needs_source_repair: 0,
    needs_contradiction_mapping: 0,
    needs_human_review: 0,
  };
  for (const r of claimReviews) decisionCounts[r.decision] += 1;

  const severityCounts: Record<FindingSeverity, number> = { info: 0, warn: 0, block: 0 };
  for (const f of dedupedFindings) severityCounts[f.severity] += 1;

  // Phase 1b-b (v0.8.0) — corrected: section is promoted to 'reviewed' only
  // when every REVIEWER-SET claim_review is accepted_for_synthesis. The
  // frame_excluded synthetic reviews are filtered OUT of this check because
  // they represent topicality filtering at extract time, NOT an outstanding
  // review concern. They are filter-don't-reject; gating promotion on them
  // would defeat the purpose of frame_excluded (any single off-topic chrome
  // claim would block an otherwise-clean section forever).
  //
  // The accepted_claim_floor gate is the binding evidence-existence guard
  // (proven by scenarios A/B/C in test/gate-frame-excluded.test.ts) — a
  // section with 0 accepted + N frame_excluded fails the floor naturally,
  // because frame_excluded does not substitute for accepted.
  const reviewerSetReviews = claimReviews.filter(
    (r) => r.decision !== 'frame_excluded',
  );
  const allAccepted =
    reviewerSetReviews.length > 0 &&
    reviewerSetReviews.every((r) => r.decision === 'accepted_for_synthesis');
  // Only promote section status when this run is on the active profile —
  // calibration / A/B runs must never touch section state.
  const activeProfileForPromote = await readActiveProfile(args.packPath, args.sectionId);
  const promoteEligible =
    args.profile === activeProfileForPromote ||
    (activeProfileForPromote === DEFAULT_PROFILE && args.profile === DEFAULT_PROFILE);
  const promoted = promoteEligible
    ? await maybePromoteToReviewed(args.packPath, args.sectionId, allAccepted)
    : false;

  const snapshot: ReviewSnapshot = ReviewSnapshotSchema.parse({
    section_id: args.sectionId,
    reviewer: args.reviewer,
    review_method: args.reviewMethod,
    reviewed_at: new Date().toISOString(),
    // Phase 1b-b: candidate_claims is the TOTAL candidate set the operator
    // started with — including frame_excluded claims. claim_reviews carries
    // the per-claim disposition (accepted / rejected / frame_excluded / ...).
    candidate_claims: args.candidateClaims.length + args.frameExcludedClaims.length,
    findings: dedupedFindings,
    claim_reviews: claimReviews,
    decision_counts: decisionCounts,
    severity_counts: severityCounts,
    llm_findings_rejected_ungrounded: args.llmFindingsRejected,
    promoted_to_reviewed: promoted,
    reviewer_options: args.reviewer_options,
    // B-C-004: stamp the profile that produced this snapshot. Omit when the
    // implicit DEFAULT_PROFILE is in play so default-profile snapshots stay
    // byte-identical to legacy (preserves frozen-pack byte stability).
    profile: args.profile !== DEFAULT_PROFILE ? args.profile : undefined,
  });

  // ALWAYS write the profile-scoped artifacts: even non-active runs leave a
  // full record under sections/<id>/reviews/<profile>/ for calibration.
  const profDir = profileDir(args.packPath, args.sectionId, args.profile);
  await mkdir(profDir, { recursive: true });
  await writeFile(join(profDir, 'review.json'), JSON.stringify(snapshot, null, 2), 'utf8');
  await writeFile(join(profDir, 'review.md'), renderReviewMarkdown(snapshot), 'utf8');
  const profileFindingsPath = join(profDir, 'findings.jsonl');
  for (const f of dedupedFindings) {
    await appendFile(profileFindingsPath, JSON.stringify(f) + '\n', 'utf8');
  }
  const profileReviewsPath = join(profDir, 'claim-reviews.jsonl');
  for (const r of claimReviews) {
    await appendFile(profileReviewsPath, JSON.stringify(ClaimReviewSchema.parse(r)) + '\n', 'utf8');
  }

  // Mirror to canonical paths ONLY when this profile is the active one (or
  // there is no active profile and we are running the implicit default).
  // This is what stops A/B experiments from corrupting the section's
  // effective review state.
  const activeProfile = await readActiveProfile(args.packPath, args.sectionId);
  const isActive = args.profile === activeProfile || (activeProfile === DEFAULT_PROFILE && args.profile === DEFAULT_PROFILE);
  if (isActive) {
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
    const findingsPath = join(auditsDir, `${args.sectionId}-findings.jsonl`);
    for (const f of dedupedFindings) {
      await appendFile(findingsPath, JSON.stringify(f) + '\n', 'utf8');
    }
    const reviewsPath = join(args.packPath, 'sections', args.sectionId, 'claim-reviews.jsonl');
    for (const r of claimReviews) {
      await appendFile(reviewsPath, JSON.stringify(ClaimReviewSchema.parse(r)) + '\n', 'utf8');
    }
  }

  return {
    sectionId: args.sectionId,
    reviewer: args.reviewer,
    reviewMethod: args.reviewMethod,
    // Phase 1b-b: total candidate set (including frame_excluded) so the
    // summary number matches the snapshot.
    candidateClaims: args.candidateClaims.length + args.frameExcludedClaims.length,
    findingsAdded: dedupedFindings.length,
    findingsDeduped: dedupedCount,
    llmFindingsRejected: args.llmFindingsRejected,
    decisions: decisionCounts,
    blockingFindings: dedupedFindings.filter((f) => f.severity === 'block').length,
    promotedToReviewed: promoted,
  };
}
