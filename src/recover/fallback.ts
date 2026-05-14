// Deterministic fallback rendering for the recovery advisor.
//
// Used when the LLM advisor exhausts its retry (verifier rejects both calls).
// Renders a RecoveryAdvice object purely from the action graph + diagnosis,
// with no contrastive_framing (the verifier requires non-empty, and we
// surface a stock fallback string explicitly tagged as fallback so the
// operator knows the AI advice was unavailable).
//
// The fallback advice still satisfies every verifier rule. It is intentionally
// less rich than AI advice — that's the point: the operator gets a usable
// artifact instead of a missing one. The artifact's `advisor_path` field
// will be `deterministic_fallback`, distinguishing it from AI-produced advice
// for downstream consumers.

import { operatorTemptingForbiddenActions } from './action-graph.js';
import { defaultSystemCannotSee } from './prompt.js';
import type {
  LawfulActionGraph,
  RecoveryAdvice,
  SectionDiagnosis,
} from './types.js';

const FALLBACK_FRAMING_PREFIX =
  'The AI recovery advisor was unavailable for this section, so this guidance is rendered deterministically from pack law. ';

function failureSummary(diagnosis: SectionDiagnosis): string {
  const { failure_shape, waiveable, evidence_state, detail } = diagnosis;
  const waiveText = waiveable ? 'waiveable' : 'unwaiveable';
  return `Failure shape: ${failure_shape} (${waiveText}). ${detail}`;
}

export function deterministicFallbackAdvice(args: {
  diagnosis: SectionDiagnosis;
  actionGraph: LawfulActionGraph;
}): RecoveryAdvice {
  const { diagnosis, actionGraph } = args;

  // Top action is the deterministic recommendation; no model reasoning.
  const top = actionGraph.allowed_actions[0];
  if (!top) {
    // No allowed actions — shouldn't happen for diagnosable failures, but
    // guard with a defer_to_human_review as a last resort.
    return {
      section_id: diagnosis.section_id,
      failure_summary: failureSummary(diagnosis),
      recommended_action: {
        action_id: 'defer_to_human_review',
        rank_taken: 1,
        contrastive_framing:
          FALLBACK_FRAMING_PREFIX +
          'No deterministic allowed action exists for this failure shape; escalation is the only safe path.',
        why_smallest_reversible:
          'Human review is the most reversible action when the action graph is empty.',
        command_hint: `# inspect sections/${diagnosis.section_id}/ and decide`,
        expected_outcome: 'Operator decides whether to repair the section, mark out of scope, or accept the failure as preserved evidence.',
      },
      also_consider: [],
      do_not: actionGraph.forbidden_actions.map((f) => ({
        action_id: f.action_id,
        why_not: f.why_forbidden,
      })),
      system_cannot_see: defaultSystemCannotSee(diagnosis),
      confidence: 'needs_human_judgment',
    };
  }

  // Build also_consider from the next 1-2 allowed actions (Hick's Law cap).
  const alsoConsider = actionGraph.allowed_actions
    .slice(1, 3)
    .map((a) => ({
      action_id: a.action_id,
      when_to_prefer: a.why,
    }));

  // Build do_not from ALL forbidden actions (deterministic fallback surfaces
  // everything; AI advice can be more selective).
  const doNot = actionGraph.forbidden_actions.map((f) => ({
    action_id: f.action_id,
    why_not: f.why_forbidden,
  }));

  // Verifier rule 3 check: operator-tempting forbidden actions must be in
  // do_not[]. Since we map ALL forbidden actions, this is satisfied by
  // construction — but assert for clarity in the comment.
  // (No runtime assert needed; the orchestrator runs the verifier against
  // this fallback output as a final correctness check.)

  return {
    section_id: diagnosis.section_id,
    failure_summary: failureSummary(diagnosis),
    recommended_action: {
      action_id: top.action_id,
      rank_taken: top.rank,
      contrastive_framing: FALLBACK_FRAMING_PREFIX + `The deterministic top-ranked action is ${top.action_id}.`,
      why_smallest_reversible: `${top.why} (reversibility: ${top.reversibility})`,
      command_hint: top.command_hint,
      expected_outcome: 'Re-running diagnosis after this action should clear the failure shape or surface a different one.',
    },
    also_consider: alsoConsider,
    do_not: doNot,
    system_cannot_see: defaultSystemCannotSee(diagnosis),
    confidence: 'medium',
  };
}
