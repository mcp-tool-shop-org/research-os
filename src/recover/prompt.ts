// Layer 3 prompt template — the recovery advisor.
//
// Design constraints (research-grounded):
//   - Contrastive framing per Buçinca et al. 2024 (arXiv:2410.04253):
//     the advice must name what the operator might intuitively try AND
//     explain why we're recommending something different. This is the
//     "predicted-foil" pattern shown to improve independent decision-making.
//   - Information-boundary disclosure per Cascade! (arXiv:2509.20099):
//     the advisor surfaces what it cannot see, helping the operator apply
//     context the system lacks.
//   - Hick's Law (2-3 visible options): top action + ≤2 also_consider.
//   - Closed enums for action_id: model cannot invent new actions.
//   - The advisor receives typed FACTS (counts, classifications) — NEVER
//     raw claim text or source body. Auditable + prevents model from
//     inventing claim-specific advice it can't verify.
//   - Retry prompt does NOT include the previous rejected output
//     (Kim 2025, arXiv:2509.16533 sycophancy-under-rebuttal hazard).
//
// Verifier behavior is in `verifier.ts`. The prompt only communicates the
// contract; enforcement is downstream.

import { RECOVERY_ADVICE_OUTPUT_SCHEMA } from './schema.js';
import {
  ADVICE_CONFIDENCE_LEVELS,
  RECOVERY_ACTIONS,
  type AdvisorMCPInput,
} from './types.js';

export const RECOVERY_ADVISOR_PROMPT_VERSION = 'recovery-advisor-v1';

export const RECOVERY_ADVISOR_OUTPUT_SCHEMA = RECOVERY_ADVICE_OUTPUT_SCHEMA;

export const RECOVERY_ADVISOR_HINT =
  'Recovery advisor. Read the failure shape, evidence_state, allowed_actions, and forbidden_actions. ' +
  'Output ONE recommended_action chosen ONLY from allowed_actions. Include contrastive_framing ("you might think X; ' +
  'I recommend Y because…"). Surface forbidden_actions in do_not[]. Cap also_consider at 2. End with confidence: ' +
  '"high" / "medium" / "needs_human_judgment". Do NOT invent action_ids. Do NOT claim the pack is freezable.';

/**
 * Render the recovery advisor prompt body.
 *
 * The prompt is structured as a sequence of typed facts. The model cannot
 * reason from raw claim text — only from the diagnosis + action graph.
 */
export function renderRecoveryAdvisorPrompt(input: AdvisorMCPInput): string {
  const { packTopic, packMode, diagnosis, actionGraph, systemCannotSee, rejectionAddendum } = input;
  const lines: string[] = [];

  lines.push('Pack topic:');
  lines.push(packTopic);
  lines.push('');
  lines.push(`Pack mode: ${packMode}`);
  lines.push(`Pack is NOT freezable. Pack is NOT publishable.`);
  lines.push('');
  lines.push(
    'You are the recovery advisor for a single blocked section. Your job is to help the operator pick the smallest reversible action that unblocks the section. You do NOT execute commands; you advise.',
  );
  lines.push('');
  lines.push('===== SECTION DIAGNOSIS (READ-ONLY FACTS) =====');
  lines.push(`section_id:       ${diagnosis.section_id}`);
  lines.push(`section_purpose:  ${diagnosis.section_purpose}`);
  lines.push(`failure_shape:    ${diagnosis.failure_shape}`);
  lines.push(`stage:            ${diagnosis.stage}`);
  lines.push(`blocking:         ${diagnosis.blocking}`);
  lines.push(`waiveable:        ${diagnosis.waiveable}`);
  lines.push(`detail:           ${diagnosis.detail}`);
  lines.push('');
  lines.push('Evidence state (counts only, no raw text):');
  lines.push(`  extracted_claims:             ${diagnosis.evidence_state.extracted_claims}`);
  lines.push(`  accepted_claims:              ${diagnosis.evidence_state.accepted_claims}`);
  lines.push(`  frame_excluded_claims:        ${diagnosis.evidence_state.frame_excluded_claims}`);
  lines.push(`  needs_repair_claims:          ${diagnosis.evidence_state.needs_repair_claims}`);
  lines.push(`  sources:                      ${diagnosis.evidence_state.sources}`);
  lines.push(`  distinct_publishers:          ${diagnosis.evidence_state.distinct_publishers}`);
  lines.push(`  distinct_primary_publishers:  ${diagnosis.evidence_state.distinct_primary_publishers}`);
  lines.push('');

  lines.push('===== ALLOWED ACTIONS (RANKED — smallest reversible first) =====');
  for (const a of actionGraph.allowed_actions) {
    lines.push(`[rank ${a.rank}] action_id=${a.action_id}  reversibility=${a.reversibility}`);
    lines.push(`  why: ${a.why}`);
    lines.push(`  command_hint: ${a.command_hint}`);
  }
  lines.push('');

  if (actionGraph.forbidden_actions.length > 0) {
    lines.push('===== FORBIDDEN ACTIONS (PACK LAW — do not recommend) =====');
    for (const f of actionGraph.forbidden_actions) {
      lines.push(`action_id=${f.action_id}`);
      lines.push(`  why_forbidden: ${f.why_forbidden}`);
    }
    lines.push('');
  }

  lines.push('===== INFORMATION-BOUNDARY DISCLOSURE =====');
  lines.push('You cannot see the following operator context. Include these (and any others you can name) in system_cannot_see:');
  for (const item of systemCannotSee) {
    lines.push(`  - ${item}`);
  }
  lines.push('');

  if (rejectionAddendum !== null && rejectionAddendum.length > 0) {
    lines.push('===== RETRY ADDENDUM =====');
    lines.push('A previous draft of your advice was rejected by the verifier. Reason:');
    lines.push(`  ${rejectionAddendum}`);
    lines.push('Do NOT repeat that mistake. Pick a recommended_action from allowed_actions above, surface forbidden_actions in do_not, and include non-empty contrastive_framing.');
    lines.push('==========================');
    lines.push('');
  }

  lines.push('===== CONTRACT FOR YOUR OUTPUT =====');
  lines.push('- recommended_action.action_id MUST be one of allowed_actions[].action_id above. NEVER invent new action_ids.');
  lines.push('- recommended_action.contrastive_framing MUST be present and non-empty.');
  lines.push('  Pattern: "You might think the right fix is <X>. It is not, because <reason>. The smallest reversible move is <Y>."');
  lines.push('  This is the predicted-foil pattern — name the action an operator might intuitively try, then explain why your recommendation is better.');
  lines.push('- also_consider: at most 2 alternative actions, each with when_to_prefer. Both action_ids MUST be in allowed_actions.');
  lines.push('- do_not[]: surface forbidden_actions in this block with operator-readable why_not.');
  lines.push('- system_cannot_see: echo the disclosure items above (and add others you can name). Must be non-empty.');
  lines.push(`- confidence: one of [${ADVICE_CONFIDENCE_LEVELS.join(', ')}].`);
  lines.push('- Do NOT claim the pack is freezable, publishable, ready, or v1-ready.');
  lines.push(`- Action_id vocabulary (closed enum): [${RECOVERY_ACTIONS.join(', ')}].`);
  lines.push('');
  lines.push('Return ONE JSON object matching the output schema. No prose outside the JSON.');

  return lines.join('\n');
}

/**
 * Compute the default `system_cannot_see` items for a given diagnosis. The
 * orchestrator can extend this list with pack-specific context. Always
 * non-empty — the verifier requires at least one item.
 */
export function defaultSystemCannotSee(diagnosis: AdvisorMCPInput['diagnosis']): string[] {
  const items: string[] = [];
  items.push('Whether the operator has uncommitted edits to research.yaml or the section directory.');
  items.push('Whether the gate failure was preserved on purpose (as evidence for a different pack arc).');
  items.push("Whether on-topic sources exist that the operator hasn't gathered yet but could.");
  // Stage-specific items.
  switch (diagnosis.failure_shape) {
    case 'accepted_claim_floor':
    case 'high_frame_excluded_rate':
      items.push('Whether the operator has already attempted to contact source authors or rights holders.');
      break;
    case 'min_independent_publishers':
    case 'primary_sources_required':
      items.push('Whether independent / primary publishers exist for this topic but are paywalled, unavailable, or rate-limited.');
      break;
    case 'prose_error_no_answer_cluster':
      items.push("Whether the operator considers the section purpose definitive or open to narrowing.");
      break;
    case 'unrun':
      items.push("Whether the operator intends to run this section or has paused it deliberately.");
      break;
    case 'source_card_classification_gap':
      items.push('Whether the publisher classification is genuinely ambiguous (e.g., subsidiary publishing under a parent name).');
      break;
    case 'reviewer_needs_human_review':
      items.push('Whether the operator has domain expertise on the specific claims escalated to human review.');
      break;
    default:
      break;
  }
  return items;
}
