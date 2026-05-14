// v0.9 Slice 2c — deterministic cross-section answer bundle planner.
//
// Pure function over the classifier's drafterInputs. No LLM calls.
//
// When ≥2 sections are included, this module preselects which section
// paragraphs the answer paragraph MUST cite. The drafter then writes prose
// against that preselected set; it does not pick the support bundle itself.
// This is the same separation-of-concerns the section-prose planner uses
// (claim-to-role assignments are deterministic; drafters write from
// preassigned clusters).
//
// Selection algorithm (locked):
//   1. For each included section, pick the FIRST faithful paragraph in
//      priority order:
//        - role === 'answer' AND verifier_decision === 'faithful'
//        - role === 'evidence' AND verifier_decision === 'faithful'
//   2. Tie-break on paragraph_id lexicographically if a section has multiple
//      candidates at the same priority level.
//   3. If a section has neither answer nor evidence faithful paragraphs,
//      that section does not contribute to the bundle.
//   4. If fewer than 2 sections qualify, emit
//      `insufficient_cross_section_candidates` proseError; the orchestrator
//      writes the failure marker and stops.
//   5. If exactly 1 section is included, this planner is bypassed entirely
//      by the orchestrator — Slice 2's single-section flow runs unchanged.

import type {
  PartialPackInsufficientCrossSectionCandidatesError,
  PartialPackSectionInput,
  RequiredAnswerBundle,
} from './types.js';

interface Candidate {
  section_paragraph_id: string;
  paragraph_id: string;
  // Priority: 0 = answer-role, 1 = evidence-role. Lower wins.
  priority: number;
}

/**
 * Pick the best candidate paragraph from a single section per the priority
 * algorithm. Returns null if no faithful answer or evidence paragraph is
 * available in this section.
 */
function pickCandidateFromSection(section: PartialPackSectionInput): Candidate | null {
  // Filter to faithful paragraphs only (Slice 1's verifier contract).
  const faithful = section.paragraphs.filter((p) => p.verifier_decision === 'faithful');
  if (faithful.length === 0) return null;

  // Bucket by priority then sort lexicographically by paragraph_id within bucket.
  const buckets: Array<{ priority: number; role: string }> = [
    { priority: 0, role: 'answer' },
    { priority: 1, role: 'evidence' },
  ];

  for (const bucket of buckets) {
    const matches = faithful
      .filter((p) => p.role === bucket.role)
      // Sort by the raw section_paragraph_id (which embeds the paragraph id)
      // so we have a deterministic, reproducible tie-break.
      .sort((a, b) => a.section_paragraph_id.localeCompare(b.section_paragraph_id));
    if (matches.length > 0) {
      const winner = matches[0]!;
      // Extract the local paragraph_id ("p1") from the composite section_paragraph_id ("01-x:p1").
      const localPid = winner.section_paragraph_id.split(':')[1] ?? winner.section_paragraph_id;
      return {
        section_paragraph_id: winner.section_paragraph_id,
        paragraph_id: localPid,
        priority: bucket.priority,
      };
    }
  }
  return null;
}

export interface PlanAnswerBundleResult {
  ok: true;
  bundle: RequiredAnswerBundle;
  // Per-section selection trail for observability/debugging.
  selectionTrail: Array<{
    section_id: string;
    selected_paragraph_id: string;
    priority: 'answer' | 'evidence';
  }>;
}

export type PlanAnswerBundleErrorResult = {
  ok: false;
  error: PartialPackInsufficientCrossSectionCandidatesError;
};

/**
 * Deterministically construct the required answer bundle for the partial-pack
 * drafter when ≥2 sections are included. Returns a structured error if fewer
 * than 2 sections qualify.
 *
 * Pre-condition: callers MUST only invoke this when `includedSections.length
 * >= 2`. Single-section input is handled at the orchestrator level — the
 * bundle planner is not called there.
 */
export function planAnswerBundle(
  includedSections: PartialPackSectionInput[],
): PlanAnswerBundleResult | PlanAnswerBundleErrorResult {
  if (includedSections.length < 2) {
    // Defensive — orchestrator should never call us in this case. Surface
    // explicitly rather than constructing a one-section bundle (which would
    // defeat the cross-section contract).
    return {
      ok: false,
      error: {
        code: 'insufficient_cross_section_candidates',
        message: `Cross-section answer bundle requires ≥2 included sections; received ${includedSections.length}.`,
        candidate_pool: includedSections.map((s) => ({
          section_id: s.section_id,
          qualified: false,
          reason: 'fewer than 2 included sections — bundle planner should not have been invoked',
        })),
      },
    };
  }

  const pool: Array<{
    section: PartialPackSectionInput;
    candidate: Candidate | null;
  }> = includedSections.map((s) => ({ section: s, candidate: pickCandidateFromSection(s) }));

  const qualified = pool.filter((p) => p.candidate !== null);

  if (qualified.length < 2) {
    return {
      ok: false,
      error: {
        code: 'insufficient_cross_section_candidates',
        message: `Cross-section answer bundle requires ≥2 sections with at least one faithful answer or evidence paragraph; only ${qualified.length} qualified.`,
        candidate_pool: pool.map((p) => ({
          section_id: p.section.section_id,
          qualified: p.candidate !== null,
          reason:
            p.candidate !== null
              ? `selected ${p.candidate.section_paragraph_id} (priority=${p.candidate.priority === 0 ? 'answer' : 'evidence'})`
              : 'no faithful answer-role or evidence-role paragraph available',
        })),
      },
    };
  }

  // Construct the bundle from one selected paragraph per qualifying section.
  // Ordering: stable on the input section order (which itself reflects
  // research.yaml order — operationally meaningful).
  const requiredParagraphIds: string[] = [];
  const requiredSectionIds: string[] = [];
  const selectionTrail: PlanAnswerBundleResult['selectionTrail'] = [];

  for (const p of pool) {
    if (p.candidate === null) continue;
    requiredParagraphIds.push(p.candidate.section_paragraph_id);
    requiredSectionIds.push(p.section.section_id);
    selectionTrail.push({
      section_id: p.section.section_id,
      selected_paragraph_id: p.candidate.section_paragraph_id,
      priority: p.candidate.priority === 0 ? 'answer' : 'evidence',
    });
  }

  return {
    ok: true,
    bundle: {
      role: 'answer',
      required_section_paragraph_ids: requiredParagraphIds,
      required_section_ids: requiredSectionIds,
    },
    selectionTrail,
  };
}

/**
 * Validator for the drafter's answer paragraph. Enforces the required-bundle
 * contract post-generation. Returns a structured failure reason that the
 * retry path can echo back to the model.
 */
export type AnswerBundleValidationResult =
  | { valid: true }
  | {
      valid: false;
      reason:
        | 'single_section_support_when_multi_included'
        | 'missing_required_support_id'
        | 'extra_support_ids_added';
      detail: string;
    };

export function validateAnswerBundle(args: {
  answerSupportSectionIds: string[];
  answerSupportSectionParagraphIds: string[];
  required: RequiredAnswerBundle | null;
  includedSectionsCount: number;
}): AnswerBundleValidationResult {
  // Single-section case: any single-section support bundle is valid.
  if (args.includedSectionsCount <= 1 || args.required === null) {
    return { valid: true };
  }

  // Multi-section case: enforce the bundle contract.
  const distinctSectionIds = new Set(args.answerSupportSectionIds);
  if (distinctSectionIds.size < 2) {
    return {
      valid: false,
      reason: 'single_section_support_when_multi_included',
      detail: `answer paragraph support_bundle.section_ids has ${distinctSectionIds.size} distinct ID(s); requires ≥ 2 when multiple sections are included.`,
    };
  }

  const observed = new Set(args.answerSupportSectionParagraphIds);
  const required = new Set(args.required.required_section_paragraph_ids);

  // Every required ID must be present.
  const missing: string[] = [];
  for (const r of required) {
    if (!observed.has(r)) missing.push(r);
  }
  if (missing.length > 0) {
    return {
      valid: false,
      reason: 'missing_required_support_id',
      detail: `answer paragraph omits required support id(s): ${missing.join(', ')}`,
    };
  }

  // No extra IDs beyond the required set.
  const extras: string[] = [];
  for (const o of observed) {
    if (!required.has(o)) extras.push(o);
  }
  if (extras.length > 0) {
    return {
      valid: false,
      reason: 'extra_support_ids_added',
      detail: `answer paragraph cites unauthorized support id(s) beyond the required bundle: ${extras.join(', ')}`,
    };
  }

  return { valid: true };
}
