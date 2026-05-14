// Layer 2 — Lawful action graph.
//
// Pure function. No LLM calls.
//
// Maps a SectionDiagnosis to the allowed + forbidden recovery actions per
// pack law. The mapping is data-driven (table below). Forbidden actions are
// PERMANENT for the failure shape — they encode invariants the LLM advisor
// cannot override.
//
// Ranking philosophy:
//   - reversibility ascending: high → medium → (low, unused)
//   - smallest blast radius first (Google SRE generic-mitigations principle)
//   - reversible options surface above destructive ones
//   - waivers are not the first move when there's an evidence-correctness fix
//
// New failure shapes need a row here AND an entry in the test suite.

import type {
  AllowedAction,
  FailureShape,
  ForbiddenAction,
  LawfulActionGraph,
  RecoveryActionId,
  Reversibility,
  SectionDiagnosis,
} from './types.js';

// ── Pack-law forbiddings (closed table) ─────────────────────────────────────
// These are permanent rules: for THIS failure shape, the LLM advisor MUST NOT
// recommend the listed action_id. The why_forbidden text is what the advisor
// must surface in the do_not[] block so the operator sees the reasoning.
const PACK_LAW_FORBIDDINGS: Array<{
  failure_shape: FailureShape;
  forbidden_action: RecoveryActionId;
  why_forbidden: string;
}> = [
  {
    failure_shape: 'accepted_claim_floor',
    forbidden_action: 'apply_waiver',
    why_forbidden:
      'accepted_claim_floor is unwaiveable — waivers cannot create evidence. The section has no accepted claims; the only lawful fixes are adding on-topic sources or narrowing the purpose.',
  },
  {
    failure_shape: 'high_frame_excluded_rate',
    forbidden_action: 'apply_waiver',
    why_forbidden:
      'Purpose-evidence mismatch is a structural failure, not a diversity gap. Waivers cannot make off-topic claims on-topic.',
  },
  {
    failure_shape: 'prose_error_no_answer_cluster',
    forbidden_action: 'rerun_stage',
    why_forbidden:
      'The gate already passed — rerunning gate fixes nothing. The section has accepted claims, but none directly answer the section purpose.',
  },
  {
    failure_shape: 'prose_error_cross_section_missing',
    forbidden_action: 'apply_waiver',
    why_forbidden:
      'Cross-section synthesis failure is not a waiveable shape — there is no pack law to waive. Inspect section prose or repair the support bundle instead.',
  },
  {
    failure_shape: 'source_card_classification_gap',
    forbidden_action: 'apply_waiver',
    why_forbidden:
      'Misclassification is a correctable data error, not a diversity gap. Fix the source-card classification and rerun the gate.',
  },
  {
    failure_shape: 'reviewer_needs_human_review',
    forbidden_action: 'rerun_stage',
    why_forbidden:
      'Rerunning review without operator intervention will produce the same needs_human_review decision. The reviewer is escalating to you on purpose.',
  },
];

// ── Action templates (reversibility, command-hint shape) ────────────────────
const ACTION_REVERSIBILITY: Record<RecoveryActionId, Reversibility> = {
  add_on_topic_sources: 'high',
  apply_source_card_override: 'high',
  rerun_stage: 'high',
  apply_waiver: 'medium',
  narrow_section_purpose: 'medium',
  mark_section_out_of_scope: 'medium',
  defer_to_human_review: 'high',
};

function commandHint(action: RecoveryActionId, sectionId: string, stage?: string): string {
  switch (action) {
    case 'add_on_topic_sources':
      return `research-os gather ${sectionId} --url <URL>`;
    case 'apply_source_card_override':
      return `research-os source-card audit --pack .  (see proposed-publisher-overrides.json)`;
    case 'rerun_stage':
      return stage ? `research-os ${stage} ${sectionId}` : `research-os gate ${sectionId}`;
    case 'apply_waiver':
      return `# edit research.yaml: add a primary_source_waiver.section_waivers entry for ${sectionId}`;
    case 'narrow_section_purpose':
      return `# edit research.yaml: tighten the purpose for ${sectionId} to better match available evidence`;
    case 'mark_section_out_of_scope':
      return `# edit research.yaml: remove or rename section ${sectionId} to acknowledge it is out of scope`;
    case 'defer_to_human_review':
      return `# inspect sections/${sectionId}/claim-reviews.jsonl and decide accept / repair / reject per claim`;
  }
}

// ── Action graph constructor ────────────────────────────────────────────────
//
// For each diagnosis we build a small, ranked allowed_actions list (1–3 items)
// + the forbidden_actions from the pack-law table. Both lists are sorted
// deterministically:
//   - allowed_actions: by rank ascending
//   - forbidden_actions: by action_id alphabetically (stable for diff'ing)

export function buildActionGraph(diagnosis: SectionDiagnosis): LawfulActionGraph {
  const { section_id, failure_shape, stage } = diagnosis;

  // Mapping table (data, not LLM judgment). Each entry returns the allowed
  // actions for THIS failure shape in priority order.
  const allowed: Array<{ action_id: RecoveryActionId; why: string; rerunStage?: string }> = (() => {
    switch (failure_shape) {
      case 'accepted_claim_floor':
        return [
          {
            action_id: 'add_on_topic_sources',
            why: 'Section has zero accepted claims; adding on-topic primary or official sources lets the extractor produce candidate claims that survive review.',
          },
          {
            action_id: 'narrow_section_purpose',
            why: 'If extracted claims are on-topic for the sources but off-topic for the purpose, tightening the purpose can convert the same evidence into accepted claims.',
          },
        ];

      case 'min_independent_publishers':
        return [
          {
            action_id: 'add_on_topic_sources',
            why: 'Add 1-2 sources from publishers not already represented in the section to raise distinct_publishers above the floor.',
          },
          {
            action_id: 'apply_source_card_override',
            why: 'If sources from distinct publishers are mis-classified as the same publisher, correct the classification.',
          },
          {
            action_id: 'apply_waiver',
            why: 'When additional independent publishers are demonstrably unavailable, a source_floor waiver with compensating control is acceptable.',
          },
        ];

      case 'primary_sources_required':
        return [
          {
            action_id: 'add_on_topic_sources',
            why: 'Add at least one primary source (vendor docs, RFCs, paper preprint) to satisfy primary_sources_required.',
          },
          {
            action_id: 'apply_source_card_override',
            why: 'If existing sources are primary but classified as secondary, correct the source-card source_type field.',
          },
          {
            action_id: 'apply_waiver',
            why: 'When primary sources are demonstrably unavailable for the topic, a primary_source_waiver with explicit compensating control is acceptable.',
          },
        ];

      case 'high_frame_excluded_rate':
        return [
          {
            action_id: 'narrow_section_purpose',
            why: 'Most extracted claims were frame_excluded — the section purpose and the available evidence do not match. Narrowing the purpose typically converts frame_excluded claims back into candidates.',
          },
          {
            action_id: 'add_on_topic_sources',
            why: 'Alternatively, replace off-topic sources with on-topic ones aligned to the section purpose.',
          },
        ];

      case 'prose_error_no_answer_cluster':
        return [
          {
            action_id: 'narrow_section_purpose',
            why: 'Gate passed but no accepted claim directly answers the section purpose; tightening the purpose to what the evidence actually supports often resolves this.',
          },
          {
            action_id: 'add_on_topic_sources',
            why: 'Alternatively, add sources whose claims directly answer the current section purpose.',
          },
        ];

      case 'prose_error_cross_section_missing':
        return [
          {
            action_id: 'rerun_stage',
            why: 'Retry partial-pack synthesis after inspecting the section prose. The bundle planner deterministically selects required supports; persistent failure indicates an upstream prose substrate problem.',
            rerunStage: 'synth pack --partial',
          },
          {
            action_id: 'defer_to_human_review',
            why: 'If section-level prose is genuinely poor across multiple included sections, escalate before retrying the pipeline.',
          },
        ];

      case 'unrun':
        return [
          {
            action_id: 'rerun_stage',
            why: 'Run the missing pipeline stages in order: gather → extract → review → gate.',
            rerunStage: 'gather',
          },
          {
            action_id: 'mark_section_out_of_scope',
            why: 'If the section is no longer in scope for this pack, mark it explicitly in research.yaml rather than leaving it unrun.',
          },
        ];

      case 'source_card_classification_gap':
        return [
          {
            action_id: 'apply_source_card_override',
            why: 'Correct the missing/unknown publisher or source_type on the affected source cards.',
          },
          {
            action_id: 'rerun_stage',
            why: 'After fixing source-card classifications, rerun the gate so it can score diversity correctly.',
            rerunStage: 'gate',
          },
        ];

      case 'reviewer_needs_human_review':
        return [
          {
            action_id: 'defer_to_human_review',
            why: 'The reviewer is explicitly escalating: inspect each needs_human_review claim and decide accept / repair / reject.',
          },
        ];
    }
  })();

  const allowedActions: AllowedAction[] = allowed.map((entry, idx) => ({
    action_id: entry.action_id,
    rank: idx + 1,
    reversibility: ACTION_REVERSIBILITY[entry.action_id],
    command_hint: commandHint(entry.action_id, section_id, entry.rerunStage ?? stage),
    why: entry.why,
  }));

  const forbidden: ForbiddenAction[] = PACK_LAW_FORBIDDINGS
    .filter((row) => row.failure_shape === failure_shape)
    .map((row) => ({
      action_id: row.forbidden_action,
      why_forbidden: row.why_forbidden,
    }))
    .sort((a, b) => a.action_id.localeCompare(b.action_id));

  return {
    section_id,
    allowed_actions: allowedActions,
    forbidden_actions: forbidden,
  };
}

/**
 * "Operator-tempting" forbidden actions: ones the operator might intuitively
 * reach for. The advisor's do_not[] block MUST mention at least these so the
 * operator sees explicit warnings. Computed deterministically from the
 * failure shape.
 */
export function operatorTemptingForbiddenActions(
  failure_shape: FailureShape,
): RecoveryActionId[] {
  // For accepted_claim_floor + high_frame_excluded_rate, an operator who
  // reads "gate failed" might reach for a waiver — surface this explicitly.
  // For prose_error_no_answer_cluster, the operator might reach for "rerun
  // the gate" — surface that.
  switch (failure_shape) {
    case 'accepted_claim_floor':
    case 'high_frame_excluded_rate':
    case 'prose_error_cross_section_missing':
    case 'source_card_classification_gap':
      return ['apply_waiver'];
    case 'prose_error_no_answer_cluster':
    case 'reviewer_needs_human_review':
      return ['rerun_stage'];
    default:
      return [];
  }
}
