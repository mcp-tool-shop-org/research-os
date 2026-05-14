// Layer 4 — Advice verifier.
//
// Deterministic. No LLM. Checks the advisor's output against the action graph
// + pack law. Returns the first violation found, or { valid: true }.
//
// The 7 verifier rules (LOCKED, mirror the dispatch):
//   1. recommended_action.action_id MUST be in allowed_actions[].action_id.
//   2. No also_consider[].action_id may be in forbidden_actions[].action_id.
//   3. do_not[] MUST contain at least the operator-tempting forbidden actions
//      (e.g., apply_waiver for an unwaiveable shape — always surfaced).
//   4. recommended_action.contrastive_framing MUST be non-empty.
//   5. system_cannot_see MUST be non-empty.
//   6. No text in any field may claim the pack is "freezable" / "publishable"
//      / "ready" / "v1-ready".
//   7. If recommended_action.action_id !== allowed_actions[0].action_id
//      (top-ranked), then EITHER also_consider must include the top-ranked
//      action OR recommended_action.why_smallest_reversible explicitly
//      justifies skipping it (we accept any non-empty rationale here —
//      pack law is silent on whether the skip is valid, only on whether
//      it's disclosed).
//
// Sycophancy-mitigation note (Kim 2025, arXiv:2509.16533): the verifier is
// strictly stateless. It does NOT see the previous output, the previous
// reasoning, or the model's defense. Each verifier call is fresh.

import { operatorTemptingForbiddenActions } from './action-graph.js';
import type {
  AdviceVerificationResult,
  LawfulActionGraph,
  RecoveryAdvice,
  SectionDiagnosis,
  VerifierRejectionReason,
} from './types.js';

// Match readiness-claim phrases. Conservative: matches any token within a
// 5-word window of "pack is", "this pack", or just-bare "ready/freezable/
// publishable". Case-insensitive.
const READINESS_PHRASES = [
  /pack\s+is\s+(now\s+)?freezable/i,
  /pack\s+is\s+(now\s+)?publishable/i,
  /pack\s+is\s+(now\s+)?ready/i,
  /pack\s+is\s+(now\s+)?v1[\s-]?ready/i,
  /ready\s+to\s+freeze/i,
  /ready\s+to\s+publish/i,
  /v1[\s-]?ready/i,
] as const;

function hasReadinessClaim(text: string): boolean {
  return READINESS_PHRASES.some((re) => re.test(text));
}

function allTextFields(advice: RecoveryAdvice): string[] {
  const fields: string[] = [
    advice.failure_summary,
    advice.recommended_action.contrastive_framing,
    advice.recommended_action.why_smallest_reversible,
    advice.recommended_action.expected_outcome,
    advice.recommended_action.command_hint,
  ];
  for (const a of advice.also_consider) fields.push(a.when_to_prefer);
  for (const d of advice.do_not) fields.push(d.why_not);
  fields.push(...advice.system_cannot_see);
  return fields;
}

function reject(
  reason: VerifierRejectionReason,
  detail: string,
): AdviceVerificationResult {
  return { valid: false, reason, detail };
}

export function verifyRecoveryAdvice(args: {
  advice: RecoveryAdvice;
  actionGraph: LawfulActionGraph;
  diagnosis: SectionDiagnosis;
}): AdviceVerificationResult {
  const { advice, actionGraph, diagnosis } = args;
  const allowedIds = new Set(actionGraph.allowed_actions.map((a) => a.action_id));
  const forbiddenIds = new Set(actionGraph.forbidden_actions.map((f) => f.action_id));

  // Rule 1: recommended_action.action_id must be allowed.
  if (!allowedIds.has(advice.recommended_action.action_id)) {
    return reject(
      'recommended_action_not_allowed',
      `recommended_action.action_id "${advice.recommended_action.action_id}" is not in allowed_actions (${Array.from(allowedIds).join(', ')}).`,
    );
  }

  // Defensive: a recommended action that IS in forbidden_actions also gets
  // caught here (cleaner separate signal).
  if (forbiddenIds.has(advice.recommended_action.action_id)) {
    return reject(
      'recommended_action_not_allowed',
      `recommended_action.action_id "${advice.recommended_action.action_id}" is listed in forbidden_actions — pack law forbids this for failure_shape ${diagnosis.failure_shape}.`,
    );
  }

  // Rule 2: no also_consider entry may be in forbidden_actions.
  for (const a of advice.also_consider) {
    if (forbiddenIds.has(a.action_id)) {
      return reject(
        'also_consider_contains_forbidden',
        `also_consider includes "${a.action_id}", which is in forbidden_actions for failure_shape ${diagnosis.failure_shape}.`,
      );
    }
    // also_consider entries must also be in allowed_actions (we don't accept
    // out-of-vocabulary alternatives even if not explicitly forbidden).
    if (!allowedIds.has(a.action_id)) {
      return reject(
        'recommended_action_not_allowed',
        `also_consider entry "${a.action_id}" is not in allowed_actions.`,
      );
    }
  }

  // Rule 3: do_not[] must surface operator-tempting forbidden actions.
  const tempting = operatorTemptingForbiddenActions(diagnosis.failure_shape);
  const doNotIds = new Set(advice.do_not.map((d) => d.action_id));
  const missingTempting = tempting.filter((id) => forbiddenIds.has(id) && !doNotIds.has(id));
  if (missingTempting.length > 0) {
    return reject(
      'do_not_missing_tempting_forbidden',
      `do_not[] is missing operator-tempting forbidden action(s): ${missingTempting.join(', ')}. These must be surfaced so the operator does not reach for them.`,
    );
  }

  // Rule 4: contrastive_framing must be non-empty (Zod min(1) already catches
  // strict-empty, but we also reject whitespace-only strings here).
  if (advice.recommended_action.contrastive_framing.trim().length === 0) {
    return reject(
      'empty_contrastive_framing',
      'recommended_action.contrastive_framing is empty or whitespace.',
    );
  }

  // Rule 5: system_cannot_see must be non-empty after trimming.
  const nonEmptyDisclosures = advice.system_cannot_see.filter((s) => s.trim().length > 0);
  if (nonEmptyDisclosures.length === 0) {
    return reject(
      'empty_system_cannot_see',
      'system_cannot_see is empty or only whitespace entries.',
    );
  }

  // Rule 6: no readiness claim anywhere.
  for (const field of allTextFields(advice)) {
    if (hasReadinessClaim(field)) {
      return reject(
        'pack_readiness_claim',
        `advice contains a pack-readiness claim: "${field}". The pack is repair_required and never readiness-claimable from a recovery context.`,
      );
    }
  }

  // Rule 7: if recommended_action is not rank 1, either also_consider includes
  // the rank-1 action OR why_smallest_reversible explicitly justifies the skip.
  const topAllowed = actionGraph.allowed_actions.find((a) => a.rank === 1);
  if (topAllowed && advice.recommended_action.action_id !== topAllowed.action_id) {
    const alsoIds = new Set(advice.also_consider.map((a) => a.action_id));
    const skipsTop = !alsoIds.has(topAllowed.action_id);
    const rationale = advice.recommended_action.why_smallest_reversible.trim();
    if (skipsTop && rationale.length === 0) {
      return reject(
        'top_action_skipped_without_rationale',
        `recommended_action is rank ${advice.recommended_action.rank_taken} (action_id ${advice.recommended_action.action_id}); top-ranked action ${topAllowed.action_id} is not in also_consider and why_smallest_reversible is empty.`,
      );
    }
  }

  return { valid: true };
}
