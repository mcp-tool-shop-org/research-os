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
//   5. gate.blocking_reasons[0]-derived shape — R-002 routing (the gate-blocking
//      signal wins over downstream signals; see comment below)
//   6. accepted_claim_floor (legacy failures[].check classification — fallback)
//   7. min_independent_publishers (legacy failures[].check classification)
//   8. primary_sources_required (legacy failures[].check classification)
//   9. source_card_classification_gap (non-gate downstream signal)
//  10. high_frame_excluded_rate (non-gate downstream signal)
//
// R-002 (operator-aloneness DST gate v0.1, 2026-05-15): downstream signals
// like source_card_classification_gap could "win" the classification even
// when the gate was actually blocked on a different reason (e.g., accepted-
// claim-floor). That mis-routed the recovery advisor's recommendation to an
// action that did not address the blocking reason. The fix is to read the
// gate.json's `blocking_reasons[]` (or handoff section's `blocking_reasons[]`)
// FIRST and map the family/check prefix to a failure_shape. Only when no
// blocking reason maps to a known shape do we fall back to the legacy
// failures[].check lookup, then the non-gate downstream signals.
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
  // Diagnose-layer tolerance: malformed JSONL lines are skipped rather than
  // thrown so a degraded claims.jsonl / claim-reviews.jsonl never aborts the
  // recovery engine entirely. The gate audit JSON is the load-bearing signal
  // for failure-shape detection; claims/reviews supply supplementary counts
  // for evidence_state. Best-effort parsing matches the source-card reader.
  if (!existsSync(path)) return [];
  const text = await readFile(path, 'utf8');
  const out: T[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(parse(JSON.parse(line)));
    } catch {
      // Malformed line — skip. Diagnose produces best-effort output.
    }
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

function gateBlockingReasons(gate: Record<string, unknown> | null): string[] {
  if (!gate) return [];
  const raw = (gate as Record<string, unknown>).blocking_reasons;
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is string => typeof r === 'string');
}

/**
 * Map a single blocking_reason string to a failure_shape.
 *
 * Reasons are produced by `gates/run.ts:deriveVerdict()` in the shape
 * `"${family}.${check}: ${detail}"` (see `gates/run.ts:225`). The cowork
 * handoff carries the same strings on each section's `blocking_reasons[]`.
 *
 * This map is intentionally narrow: we only return a shape when the family
 * (and, where the family is multi-check, the check) corresponds to one of
 * the gate-blocking failure shapes in the closed enum. A bare `family`
 * (without a check) or a family-only prefix is accepted too — operators
 * have been observed writing them that way in synthetic / hand-rolled
 * fixtures, and the routing intent is the same.
 *
 * Returns null when the reason doesn't match a known mapping; in that case
 * the diagnose layer falls through to the legacy failures[].check lookup.
 */
function failureShapeFromBlockingReason(reason: string): FailureShape | null {
  // Strip the `: detail` tail (if present) to get the `family.check` head.
  const head = reason.split(':')[0]?.trim() ?? '';
  if (head.length === 0) return null;
  const dotIdx = head.indexOf('.');
  const family = dotIdx === -1 ? head : head.slice(0, dotIdx);
  const check = dotIdx === -1 ? '' : head.slice(dotIdx + 1);

  switch (family) {
    case 'accepted_claim_floor':
      // family-only OR any sub-check on the accepted_claim_floor family.
      // Covers historical `min_accepted_claims` and current
      // `min_accepted_claims_and_sources`.
      return 'accepted_claim_floor';
    case 'source_floor':
      if (check.startsWith('independent_publishers')) return 'min_independent_publishers';
      if (check.startsWith('primary_sources_required')) return 'primary_sources_required';
      return null;
    default:
      return null;
  }
}

function blockingReasonShape(reasons: string[]): FailureShape | null {
  for (const reason of reasons) {
    const shape = failureShapeFromBlockingReason(reason);
    if (shape !== null) return shape;
  }
  return null;
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

  // 5. BLOCKING_REASONS routing (R-002). When the gate is blocked, the
  //    blocking_reasons[] list is the authoritative source for what is
  //    actually blocking synthesis. Map the first reason whose family
  //    corresponds to a known gate-blocking failure_shape — that shape wins
  //    over downstream signals (source_card_classification_gap,
  //    high_frame_excluded_rate). Both the gate.json's blocking_reasons[]
  //    and the cowork handoff section's blocking_reasons[] are consulted;
  //    they're set in lockstep by the gate run + cowork handoff, but legacy
  //    fixtures (and some test fixtures) populate only one or the other,
  //    so we accept either as authoritative.
  const blockingReasonStrings = [
    ...gateBlockingReasons(gate),
    ...(handoffSection?.blocking_reasons ?? []),
  ];
  const blockingShape = blockingReasonShape(blockingReasonStrings);
  if (blockingShape === 'accepted_claim_floor') {
    return makeDiagnosis(
      'accepted_claim_floor',
      true,
      false, // accepted_claim_floor is UNWAIVEABLE — pack law
      'gate',
      `Gate is blocked on accepted_claim_floor: ${evidenceState.accepted_claims} accepted claim(s); minimum is 3 from 2 sources. Waivers cannot create evidence.`,
    );
  }
  if (blockingShape === 'min_independent_publishers') {
    return makeDiagnosis(
      'min_independent_publishers',
      true,
      true, // waiveable with compensating control (source_floor waiver)
      'gate',
      `Gate is blocked on independent_publishers: ${evidenceState.distinct_publishers} distinct publisher(s) across ${evidenceState.sources} source(s).`,
    );
  }
  if (blockingShape === 'primary_sources_required') {
    return makeDiagnosis(
      'primary_sources_required',
      true,
      true, // waiveable with compensating control
      'gate',
      `Gate is blocked on primary_sources_required: ${evidenceState.distinct_primary_publishers} distinct primary publisher(s).`,
    );
  }

  // 6. LEGACY failures[].check classification. Surviving fallback for gate
  //    fixtures whose blocking_reasons[] is empty (e.g., the original Slice 3
  //    test fixtures, which emit failures[] with the older synthetic check
  //    names). We preserve this path so existing fixtures keep classifying
  //    correctly without re-authoring them.
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

  if (failedChecks.has('independent_publishers')) {
    return makeDiagnosis(
      'min_independent_publishers',
      true,
      true, // waiveable with compensating control (source_floor waiver)
      'gate',
      `Gate failed on independent_publishers: ${evidenceState.distinct_publishers} distinct publisher(s) across ${evidenceState.sources} source(s).`,
    );
  }

  if (failedChecks.has('primary_sources_required')) {
    return makeDiagnosis(
      'primary_sources_required',
      true,
      true, // waiveable with compensating control
      'gate',
      `Gate failed on primary_sources_required: ${evidenceState.distinct_primary_publishers} distinct primary publisher(s).`,
    );
  }

  // 9. SOURCE_CARD_CLASSIFICATION_GAP: any card has missing/unknown publisher
  //    or unknown source_type. This often co-occurs with min_independent_publishers
  //    or accepted_claim_floor but we only flag it when the gate didn't already
  //    classify a different failure shape (priority handled above — blocking
  //    reasons routing in step 5 explicitly beats this downstream signal).
  if (classificationGap(cards)) {
    return makeDiagnosis(
      'source_card_classification_gap',
      handoffSection.gate_verdict === 'blocked' || handoffSection.gate_verdict === 'fail',
      false, // misclassification is correctable; waiver is the wrong tool
      'gather',
      'One or more source cards have a missing or unknown publisher / source_type. The gate cannot score diversity correctly.',
    );
  }

  // 10. HIGH_FRAME_EXCLUDED_RATE.
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
