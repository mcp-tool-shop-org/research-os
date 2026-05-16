/**
 * R-012 — Rescue eligibility gate (v0.12 Slice 1).
 *
 * Pure module. Defines the closed FrameRescueStatus enum and the
 * deterministic eligibility gate that protects R-011's defense floor
 * while opening a narrow, witnessed rescue path for high-quality
 * secondary moderator claims.
 *
 * The gate is the LOAD-BEARING component of R-012. Both the LLM rescue
 * critic and the operator rescue surface MUST check eligibility first
 * and refuse if the gate returns passed=false. Enforced in code, NOT
 * by audit trail.
 *
 * Hard invariant (cannot be bypassed by any rescue surface):
 *
 *   No rescue may occur from a source body that has not otherwise
 *   proven topical relevance.
 *
 * The predicate is:
 *
 *   non_excluded_on_topic_claims_from_same_source >= 2
 *
 * "Non-excluded on-topic" means drafts where frame_excluded === false —
 * claims that PASSED R-011's deterministic precheck AND the LLM critic.
 * The count is measured over frame-critic SURVIVORS, NOT over downstream
 * review-accepted claims; final acceptance may not yet exist at the
 * point R-012 runs. Using "non-excluded" rather than "accepted" avoids
 * pipeline-timing brittleness while preserving the topical-relevance
 * proof requirement.
 */

/**
 * Closed enum: every claim with frame_exclusion_reason ===
 * 'source_content_mismatch' is in exactly one rescue_status state.
 *
 * State transitions:
 *
 *   not_rescued ─(LLM accepts)──────────► rescued_by_llm        [TERMINAL]
 *   not_rescued ─(LLM declines / fails)─► not_rescued           [open for operator]
 *   not_rescued ─(operator rescues)─────► rescued_by_operator   [TERMINAL]
 *   not_rescued ─(operator declines)────► operator_declined     [TERMINAL]
 *   any ────────(gate fails)────────────► ineligible_for_rescue [TERMINAL]
 *
 * `ineligible_for_rescue` is set when the eligibility gate fails; neither
 * the LLM rescue critic nor the operator rescue command can fire on an
 * ineligible claim. Reachable at extract time (gate failed when the LLM
 * rescue stage would have run) and at operator-CLI time (state may have
 * changed such that peers became excluded after extraction).
 */
export const FRAME_RESCUE_STATUSES = [
  'not_rescued',
  'rescued_by_llm',
  'rescued_by_operator',
  'operator_declined',
  'ineligible_for_rescue',
] as const;

export type FrameRescueStatus = (typeof FRAME_RESCUE_STATUSES)[number];

/**
 * Default threshold: at least 2 OTHER claims from the same source body
 * must have survived the frame critic for the source-content-mismatch
 * claim to be rescue-eligible. The kickoff fixes this at 2 — the gate
 * is law, not a knob. Exposed as a parameter for test-only overrides;
 * production callers should never pass a custom threshold.
 */
export const DEFAULT_RESCUE_ELIGIBILITY_THRESHOLD = 2;

/**
 * Minimal snapshot of a peer draft for the gate. Only `frame_excluded`
 * enters the gate decision — keeping the input shape narrow lets the
 * gate run on either DraftClaim (extractor side) or persisted Claim
 * (operator-CLI side) without coupling to either type.
 */
export interface PeerSnapshot {
  /** True if this peer was frame-excluded by R-011 or the LLM critic. */
  frame_excluded: boolean;
}

/**
 * Result of the eligibility check. Captures both the boolean verdict
 * AND the audit evidence (peer count, threshold) so it can be persisted
 * on the claim record OR rendered into the operator-facing CLI error
 * message without re-running the gate.
 */
export interface RescueEligibilityResult {
  /** Number of peers where frame_excluded === false. */
  peer_count: number;
  /** Threshold used (echoed for audit). */
  threshold: number;
  /** True iff peer_count >= threshold. */
  passed: boolean;
}

/**
 * Pure eligibility gate. Counts non-excluded peers in the same source's
 * draft batch and returns the verdict + audit evidence.
 *
 * The "target draft" is NOT in `peers` — the caller should remove the
 * target from the peer list before calling. Defensive note: if the
 * target IS accidentally included and is frame_excluded=true (which it
 * will be, since R-012 only runs on source_content_mismatch
 * exclusions), the count is still correct — frame_excluded=true peers
 * are not counted as non-excluded.
 */
export function checkRescueEligibility(args: {
  peers: PeerSnapshot[];
  threshold?: number;
}): RescueEligibilityResult {
  const threshold = args.threshold ?? DEFAULT_RESCUE_ELIGIBILITY_THRESHOLD;
  let peer_count = 0;
  for (const p of args.peers) {
    if (!p.frame_excluded) peer_count += 1;
  }
  return {
    peer_count,
    threshold,
    passed: peer_count >= threshold,
  };
}
