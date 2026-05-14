// Layer 1 — Deterministic diagnosis.
//
// Pure function over pack state. No LLM calls.
//
// Classifies a section into one of the 9 closed failure shapes based on:
//   - cowork handoff section state (gate_verdict, synthesis_eligible, blocking_reasons)
//   - gate audit JSON (failures + waivers + counts + the actual failed checks)
//   - section-synthesis.json if present (proseError shape)
//   - claims.jsonl + claim-reviews.jsonl (claim counts + review states)
//   - source cards (count + publishers + classifications)
//   - research.yaml (section purpose + expected counts)
//
// The classifier returns the FIRST matching failure shape per a fixed priority
// order. Priority is deterministic — it does NOT depend on LLM judgment.
//
// Priority order (high → low) — see comments at each switch:
//   1. unrun (no gate run, no review run)
//   2. reviewer_needs_human_review (review records flag operator escalation)
//   3. prose_error_no_answer_cluster (gate passed; synthesis failed with this code)
//   4. prose_error_cross_section_missing (gate passed; partial-pack synthesis failed)
//   5. accepted_claim_floor (gate-blocked on this specific check)
//   6. min_independent_publishers (gate-blocked on diversity)
//   7. primary_sources_required (gate-blocked on primary count)
//   8. source_card_classification_gap (source cards have missing/unknown classifications)
//   9. high_frame_excluded_rate (claims extracted but mostly frame-excluded)
//
// The priority order is what makes the classification deterministic in the
// presence of multiple co-occurring failures (e.g., a section both has zero
// accepted claims AND has source-card classification issues — it gets
// `accepted_claim_floor` because that's the binding constraint for synthesis).

import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { CoworkHandoffPayload } from '../cowork/schema.js';
import { ClaimSchema, type Claim } from '../claims/schema.js';
import { ClaimReviewSchema, type ClaimReview } from '../review/schema.js';
import { SourceCardSchema, type SourceCard } from '../sources/schema.js';
import { SectionSynthesisProsePartSchema } from '../synth/partial-pack/index.js';

import type {
  EvidenceState,
  FailureShape,
  HealthySectionResult,
  PipelineStage,
  SectionDiagnosis,
} from './types.js';

// High frame-exclusion threshold: ≥50% of extracted claims being frame_excluded
// indicates a purpose-evidence mismatch. Threshold is conservative; a more
// aggressive (e.g., 70%) value would miss borderline cases where a fix is
// still warranted.
const HIGH_FRAME_EXCLUDED_RATIO_THRESHOLD = 0.5;

export interface DiagnoseSectionInput {
  packPath: string;
  sectionId: string;
  sectionPurpose: string;
  handoff: CoworkHandoffPayload;
}

async function readJsonl<T>(path: string, parse: (raw: unknown) => T): Promise<T[]> {
  if (!existsSync(path)) return [];
  const text = await readFile(path, 'utf8');
  const out: T[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    out.push(parse(JSON.parse(line)));
  }
  return out;
}

async function readSectionSourceCards(
  packPath: string,
  sectionId: string,
): Promise<SourceCard[]> {
  const dir = join(packPath, 'evidence', 'source-cards');
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const cards: SourceCard[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    try {
      const text = await readFile(join(dir, entry), 'utf8');
      const card = SourceCardSchema.parse(JSON.parse(text));
      if (card.section_id === sectionId) cards.push(card);
    } catch {
      // Malformed source card — ignored at diagnosis stage. The classifier
      // can still produce useful output even with a few unreadable cards.
    }
  }
  return cards;
}

async function readGateAudit(packPath: string, sectionId: string): Promise<Record<string, unknown> | null> {
  const path = join(packPath, 'audits', `${sectionId}-gate.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readSectionSynthesis(
  packPath: string,
  sectionId: string,
): Promise<ReturnType<typeof SectionSynthesisProsePartSchema.parse> | null> {
  const path = join(packPath, 'sections', sectionId, 'synthesis', 'section-synthesis.json');
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, 'utf8');
    return SectionSynthesisProsePartSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

function gateFailureFamilies(gate: Record<string, unknown> | null): Set<string> {
  if (!gate) return new Set();
  const failures = Array.isArray(gate.failures) ? gate.failures : [];
  const families = new Set<string>();
  for (const f of failures) {
    if (f && typeof f === 'object' && typeof (f as Record<string, unknown>).family === 'string') {
      families.add((f as Record<string, unknown>).family as string);
    }
  }
  return families;
}

function gateFailureChecks(gate: Record<string, unknown> | null): Set<string> {
  if (!gate) return new Set();
  const failures = Array.isArray(gate.failures) ? gate.failures : [];
  const checks = new Set<string>();
  for (const f of failures) {
    if (f && typeof f === 'object' && typeof (f as Record<string, unknown>).check === 'string') {
      checks.add((f as Record<string, unknown>).check as string);
    }
  }
  return checks;
}

function classificationGap(cards: SourceCard[]): boolean {
  // A "classification gap" means at least one card has a missing/unknown
  // publisher or unknown source_type. Either is enough — these are the
  // typed fields the gate engine reads to score diversity.
  for (const c of cards) {
    if (!c.publisher || c.publisher === 'unknown' || c.publisher.trim().length === 0) return true;
    if (c.source_type === 'unknown') return true;
  }
  return false;
}

function buildEvidenceState(
  claims: Claim[],
  reviews: ClaimReview[],
  cards: SourceCard[],
): EvidenceState {
  const acceptedIds = new Set(
    reviews.filter((r) => r.decision === 'accepted_for_synthesis').map((r) => r.claim_id),
  );
  const frameExcludedIds = new Set(
    reviews.filter((r) => r.decision === 'frame_excluded').map((r) => r.claim_id),
  );
  // The review schema splits "needs repair" across three decisions
  // (needs_scope_repair / needs_source_repair / needs_contradiction_mapping);
  // collapse them for the recovery evidence_state since the recovery advisor
  // treats them as a single class of "claim needs fixing before synthesis."
  const needsRepairIds = new Set(
    reviews
      .filter((r) =>
        r.decision === 'needs_scope_repair' ||
        r.decision === 'needs_source_repair' ||
        r.decision === 'needs_contradiction_mapping',
      )
      .map((r) => r.claim_id),
  );

  const publishers = new Set<string>();
  const primaryPublishers = new Set<string>();
  for (const c of cards) {
    if (c.publisher) publishers.add(c.publisher);
    if (c.source_type === 'primary' && c.publisher) primaryPublishers.add(c.publisher);
  }

  return {
    extracted_claims: claims.length,
    accepted_claims: acceptedIds.size,
    frame_excluded_claims: frameExcludedIds.size,
    needs_repair_claims: needsRepairIds.size,
    sources: cards.length,
    distinct_publishers: publishers.size,
    distinct_primary_publishers: primaryPublishers.size,
  };
}

function reviewsNeedHumanReview(reviews: ClaimReview[]): boolean {
  return reviews.some((r) => r.decision === 'needs_human_review');
}

/**
 * Classify the failure shape of a section. Returns null if the section is
 * healthy (no failure shape applies).
 */
export async function diagnoseSection(
  input: DiagnoseSectionInput,
): Promise<SectionDiagnosis | HealthySectionResult> {
  const { packPath, sectionId, sectionPurpose, handoff } = input;
  const handoffSection = handoff.sections.find((s) => s.section_id === sectionId);

  // Read raw inputs.
  const claims = await readJsonl<Claim>(
    join(packPath, 'sections', sectionId, 'claims.jsonl'),
    (r) => ClaimSchema.parse(r),
  );
  const reviews = await readJsonl<ClaimReview>(
    join(packPath, 'sections', sectionId, 'claim-reviews.jsonl'),
    (r) => ClaimReviewSchema.parse(r),
  );
  const cards = await readSectionSourceCards(packPath, sectionId);
  const gate = await readGateAudit(packPath, sectionId);
  const synth = await readSectionSynthesis(packPath, sectionId);

  const evidenceState = buildEvidenceState(claims, reviews, cards);

  // Healthy check: section has accepted claims, gate passed, synthesis has
  // faithful prose paragraphs (if synthesis was run).
  const synthEligible = handoffSection?.synthesis_eligible === true;
  const noBlockers = (handoffSection?.blocking_reasons.length ?? 0) === 0;
  const hasFaithfulProse =
    synth?.prose?.paragraphs?.some((p) => p.verifier_decision === 'faithful') ?? false;
  const noProseError = !synth?.proseError;

  if (
    synthEligible &&
    noBlockers &&
    evidenceState.accepted_claims > 0 &&
    (synth === null || (hasFaithfulProse && noProseError))
  ) {
    return {
      section_id: sectionId,
      section_purpose: sectionPurpose,
      status: 'healthy',
    };
  }

  // ── Classification priority order (LOCKED) ────────────────────────────────

  const makeDiagnosis = (
    failure_shape: FailureShape,
    blocking: boolean,
    waiveable: boolean,
    stage: PipelineStage,
    detail: string,
  ): SectionDiagnosis => ({
    section_id: sectionId,
    section_purpose: sectionPurpose,
    failure_shape,
    blocking,
    waiveable,
    stage,
    evidence_state: evidenceState,
    detail,
  });

  // 1. UNRUN: section in research.yaml but no handoff entry, OR handoff entry
  //    with no gate run AND no review run.
  if (!handoffSection || (!handoffSection.has_gate_run && !handoffSection.has_review_run)) {
    return makeDiagnosis(
      'unrun',
      true,
      false,
      'gather',
      !handoffSection
        ? 'Section is declared in research.yaml but has no cowork handoff entry — gather/extract/review/gate have not run.'
        : 'Section has neither a gate run nor a review run recorded in the handoff; the pipeline has not been started.',
    );
  }

  // 2. REVIEWER_NEEDS_HUMAN_REVIEW.
  if (reviewsNeedHumanReview(reviews)) {
    return makeDiagnosis(
      'reviewer_needs_human_review',
      true,
      false,
      'review',
      'One or more claims have review decision needs_human_review; the reviewer cannot resolve automatically.',
    );
  }

  // 3. PROSE_ERROR_NO_ANSWER_CLUSTER: gate passed, but synthesis emitted
  //    no_answer_cluster proseError.
  if (synth?.proseError?.code === 'no_answer_cluster') {
    return makeDiagnosis(
      'prose_error_no_answer_cluster',
      true,
      false,
      'synthesis',
      'Section gate passed, but section synthesis returned no_answer_cluster: no accepted claim was assigned the answer role for this section purpose.',
    );
  }

  // 4. PROSE_ERROR_CROSS_SECTION_MISSING: Slice 2c failure shape, observed at
  //    pack-level. We classify it here as a section-level failure even though
  //    it surfaces at the pack-level — partial-pack synthesis cannot combine
  //    this section's prose with another's. The fix involves inspecting this
  //    section's prose, hence the section-scope diagnosis.
  if (synth?.proseError?.code === 'cross_section_answer_support_missing') {
    return makeDiagnosis(
      'prose_error_cross_section_missing',
      true,
      false,
      'synthesis',
      'Partial-pack synthesis failed to combine this section with another included section after one retry.',
    );
  }

  // 5. ACCEPTED_CLAIM_FLOOR.
  const failedChecks = gateFailureChecks(gate);
  if (failedChecks.has('min_accepted_claims')) {
    return makeDiagnosis(
      'accepted_claim_floor',
      true,
      false, // accepted_claim_floor is UNWAIVEABLE — pack law
      'gate',
      `Gate failed on min_accepted_claims: ${evidenceState.accepted_claims} accepted claim(s) — minimum is 3.`,
    );
  }

  // 6. MIN_INDEPENDENT_PUBLISHERS.
  if (failedChecks.has('independent_publishers')) {
    return makeDiagnosis(
      'min_independent_publishers',
      true,
      true, // waiveable with compensating control (source_floor waiver)
      'gate',
      `Gate failed on independent_publishers: ${evidenceState.distinct_publishers} distinct publisher(s) across ${evidenceState.sources} source(s).`,
    );
  }

  // 7. PRIMARY_SOURCES_REQUIRED.
  if (failedChecks.has('primary_sources_required')) {
    return makeDiagnosis(
      'primary_sources_required',
      true,
      true, // waiveable with compensating control
      'gate',
      `Gate failed on primary_sources_required: ${evidenceState.distinct_primary_publishers} distinct primary publisher(s).`,
    );
  }

  // 8. SOURCE_CARD_CLASSIFICATION_GAP: any card has missing/unknown publisher
  //    or unknown source_type. This often co-occurs with min_independent_publishers
  //    but we only flag it when the gate didn't already classify a different
  //    failure shape (priority handled above).
  if (classificationGap(cards)) {
    return makeDiagnosis(
      'source_card_classification_gap',
      handoffSection.gate_verdict === 'blocked' || handoffSection.gate_verdict === 'fail',
      false, // misclassification is correctable; waiver is the wrong tool
      'gather',
      'One or more source cards have a missing or unknown publisher / source_type. The gate cannot score diversity correctly.',
    );
  }

  // 9. HIGH_FRAME_EXCLUDED_RATE.
  if (
    evidenceState.extracted_claims > 0 &&
    evidenceState.frame_excluded_claims / evidenceState.extracted_claims >=
      HIGH_FRAME_EXCLUDED_RATIO_THRESHOLD
  ) {
    return makeDiagnosis(
      'high_frame_excluded_rate',
      true,
      false, // purpose mismatch is a structural failure; not waiveable
      'review',
      `${evidenceState.frame_excluded_claims} of ${evidenceState.extracted_claims} extracted claim(s) were frame_excluded — likely purpose-evidence mismatch.`,
    );
  }

  // Defensive fallback: if a section is declared excluded by the handoff but
  // doesn't match any of the above shapes, classify as unrun with a detail
  // noting the unexpected state. This shouldn't happen in production but
  // keeps the diagnosis layer total over inputs.
  return makeDiagnosis(
    'unrun',
    true,
    false,
    'gather',
    'Section is not synthesis-eligible per the cowork handoff but no specific failure shape was detected; defaulting to unrun.',
  );
}

/**
 * Type guard distinguishing healthy section results from full diagnoses.
 */
export function isHealthy(
  result: SectionDiagnosis | HealthySectionResult,
): result is HealthySectionResult {
  return (result as HealthySectionResult).status === 'healthy';
}
