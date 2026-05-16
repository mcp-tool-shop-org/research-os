// v0.9 Slice 3 — Lawful Recovery Advisor types.
//
// Closed-vocabulary contracts for the 4-layer recovery system:
//
//   Layer 1 (diagnose)      classifies failure shape into FailureShape enum.
//   Layer 2 (action graph)  maps FailureShape → allowed + forbidden RecoveryActionId.
//   Layer 3 (advisor)       writes operator guidance constrained to the action graph.
//   Layer 4 (verifier)      rejects advice that violates the action graph or pack law.
//
// The enums are LOADBEARING. The advisor cannot invent new failure shapes
// or action IDs. New entries require a code change + tests, not LLM judgment.

// ── Failure shape vocabulary (closed enum, 9 values) ────────────────────────
// New shapes require a code change. This is the system's truth about what
// kinds of stuck states a section can be in.
export const FAILURE_SHAPES = [
  'accepted_claim_floor',           // gate-blocked; <minimum accepted claims
  'min_independent_publishers',     // gate-blocked; sufficient claims but pub diversity floor failed
  'primary_sources_required',       // gate-blocked; need primary sources
  'high_frame_excluded_rate',       // many extracted claims got frame_excluded; purpose mismatch
  'prose_error_no_answer_cluster',  // gate passed, but section synthesis emitted no_answer_cluster
  'prose_error_cross_section_missing', // Slice 2c failure (partial-pack-level)
  'unrun',                          // section in research.yaml, no gate/review/claims
  'source_card_classification_gap', // source cards misclassified (e.g. wrong publisher)
  'reviewer_needs_human_review',    // review decisions include needs_human_review
] as const;

export type FailureShape = (typeof FAILURE_SHAPES)[number];

// ── Recovery action vocabulary (closed enum, 8 values) ──────────────────────
// Ranked by reversibility. Reversible actions surface first by default.
// v0.10 Slice 2 (R-001) added `repair_claim_scope` for the case where the
// extractor produced claims with scope=null and the gate is blocked on
// accepted_claim_floor with claims sitting in needs_scope_repair /
// parked_weak_scope. The repair surface is a CLI (`research-os claim
// repair-scope <section>`) backed by an append-only ledger so claim
// mutation is auditable and reversible.
export const RECOVERY_ACTIONS = [
  'add_on_topic_sources',         // reversibility: high
  'apply_source_card_override',   // reversibility: high
  'repair_claim_scope',           // reversibility: high (append-only ledger)
  'rerun_stage',                  // reversibility: high (idempotent re-execution)
  'apply_waiver',                 // reversibility: medium
  'narrow_section_purpose',       // reversibility: medium
  'mark_section_out_of_scope',    // reversibility: medium
  'defer_to_human_review',        // reversibility: high (escalation only)
] as const;

export type RecoveryActionId = (typeof RECOVERY_ACTIONS)[number];

export type Reversibility = 'high' | 'medium' | 'low';

// Stages a section can be at. The diagnosis layer reports the stage where
// the failure surfaced; recovery actions may reference stage names.
export const PIPELINE_STAGES = [
  'gather',
  'extract',
  'review',
  'gate',
  'synthesis',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

// Confidence vocabulary (Rust Applicability-style typed confidence).
export const ADVICE_CONFIDENCE_LEVELS = [
  'high',
  'medium',
  'needs_human_judgment',
] as const;

export type AdviceConfidence = (typeof ADVICE_CONFIDENCE_LEVELS)[number];

// ── Layer 1 output ──────────────────────────────────────────────────────────

export interface EvidenceState {
  extracted_claims: number;
  accepted_claims: number;
  frame_excluded_claims: number;
  needs_repair_claims: number;
  sources: number;
  distinct_publishers: number;
  distinct_primary_publishers: number;
  // R-014 (v0.12 Slice 3): distinct repair-shape counts. The action graph's
  // `accepted_claim_floor` recommendation routes by which shape dominates
  // rather than the OR'd `needs_repair_claims` aggregate. The previous
  // aggregate stays for backward compatibility (frozen recovery artifacts +
  // existing test fixtures); the two distinct fields are optional and
  // populated by `buildEvidenceState` going forward. When absent (pre-R-014
  // artifacts, hand-rolled test fixtures), the heuristic falls back to the
  // legacy aggregate which assumes the v0.3-era "all repair shapes treated
  // as scope" behavior.
  scope_repair_blocked?: number;
  source_repair_blocked?: number;
}

export interface SectionDiagnosis {
  section_id: string;
  section_purpose: string;
  failure_shape: FailureShape;
  blocking: boolean;
  waiveable: boolean;
  stage: PipelineStage;
  evidence_state: EvidenceState;
  detail: string;
}

// Healthy section result — not all sections are stuck. The orchestrator
// short-circuits on healthy sections (no advisor call).
export interface HealthySectionResult {
  section_id: string;
  section_purpose: string;
  status: 'healthy';
}

// ── Layer 2 output ──────────────────────────────────────────────────────────

export interface AllowedAction {
  action_id: RecoveryActionId;
  rank: number;             // 1 = top-ranked (smallest reversible first)
  reversibility: Reversibility;
  command_hint: string;     // e.g. "research-os gather <section> --url <URL>"
  why: string;              // derived from diagnosis, NOT LLM
}

export interface ForbiddenAction {
  action_id: RecoveryActionId;
  why_forbidden: string;    // derived from pack law, NOT LLM
}

export interface LawfulActionGraph {
  section_id: string;
  allowed_actions: AllowedAction[];
  forbidden_actions: ForbiddenAction[];
}

// ── Layer 3 output ──────────────────────────────────────────────────────────

export interface RecoveryRecommendedAction {
  action_id: RecoveryActionId;
  rank_taken: number;
  contrastive_framing: string;    // "You might think the fix is X, but…" (Buçinca 2024)
  why_smallest_reversible: string;
  command_hint: string;
  expected_outcome: string;       // what success looks like
}

export interface RecoveryAlsoConsider {
  action_id: RecoveryActionId;
  when_to_prefer: string;          // condition under which this beats the recommendation
}

export interface RecoveryDoNot {
  action_id: RecoveryActionId;
  why_not: string;                 // verbatim or paraphrased from action graph
}

export interface RecoveryAdvice {
  section_id: string;
  failure_summary: string;
  recommended_action: RecoveryRecommendedAction;
  also_consider: RecoveryAlsoConsider[];    // ≤ 2 (Hick's Law cap)
  do_not: RecoveryDoNot[];
  system_cannot_see: string[];               // Cascade! 2025 information-boundary disclosure
  confidence: AdviceConfidence;
}

// ── Layer 4 output ──────────────────────────────────────────────────────────

// Verifier rejection vocabulary (also closed enum so we can audit which
// rules trigger most often). Mapped to the 7 verifier rules from the
// dispatch.
export const VERIFIER_REJECTION_REASONS = [
  'recommended_action_not_allowed',      // rule 1
  'also_consider_contains_forbidden',     // rule 2
  'do_not_missing_tempting_forbidden',    // rule 3
  'empty_contrastive_framing',            // rule 4
  'empty_system_cannot_see',              // rule 5
  'pack_readiness_claim',                 // rule 6
  'top_action_skipped_without_rationale', // rule 7
] as const;

export type VerifierRejectionReason = (typeof VERIFIER_REJECTION_REASONS)[number];

export type AdviceVerificationResult =
  | { valid: true }
  | { valid: false; reason: VerifierRejectionReason; detail: string };

// ── ProseError shapes for recovery artifact ─────────────────────────────────

// v0.11 Slice 4 (R-010) — structural cause classification for the
// deterministic-fallback path. Read from the orchestrator's existing
// last_rejection_reason string at fallback-construction time so the
// operator-facing markdown can surface "AI advisor timed out" rather than
// burying the cause in JSON. Purely additive on the prose_error shape;
// recovery selection logic is unchanged.
export const FALLBACK_CAUSES = [
  'tier_timeout',     // MCP error contained TIER_TIMEOUT marker
  'mcp_error',        // MCP error other than TIER_TIMEOUT (parse, network, etc.)
  'retry_exhausted',  // Verifier rejected both advisor attempts (no MCP error)
] as const;

export type FallbackCause = (typeof FALLBACK_CAUSES)[number];

// Optional structured timing extracted from TIER_TIMEOUT messages of the
// shape `elapsed=NNNNms budget=NNNNms`. Populated only when the classifier
// can parse both numbers from the rejection string; absent otherwise.
export interface FallbackTiming {
  elapsed_ms: number;
  budget_ms: number;
}

export interface AdvisorVerifierExhaustedError {
  code: 'advisor_verifier_exhausted';
  message: string;
  attempts: number;
  last_rejection_reason: string;
  fallback_cause?: FallbackCause;
  timing_ms?: FallbackTiming;
}

export type RecoveryProseError = AdvisorVerifierExhaustedError;

// ── Per-section recovery result + top-level artifact ────────────────────────

// Indicates the path the advisor took for a section. Useful for observability
// + the close report.
export const ADVISOR_PATHS = [
  'ai_with_verifier_pass',   // advisor produced compliant output on first call
  'ai_with_retry_pass',      // first call rejected; retry produced compliant output
  'deterministic_fallback',  // both calls rejected; advice rendered from action graph
] as const;

export type AdvisorPath = (typeof ADVISOR_PATHS)[number];

export interface SectionRecoveryResult {
  section_id: string;
  section_purpose: string;
  status: 'recovery_advised' | 'healthy';
  diagnosis: SectionDiagnosis | null;       // null on healthy sections
  action_graph: LawfulActionGraph | null;   // null on healthy sections
  advice: RecoveryAdvice | null;            // null on healthy or fallback-with-no-advice
  advisor_path: AdvisorPath | null;         // null on healthy
  prose_error?: RecoveryProseError;
}

export const RECOVERY_ARTIFACT_STATUS = 'recovery_advisor_complete' as const;

export interface RecoveryArtifact {
  status: typeof RECOVERY_ARTIFACT_STATUS;
  pack_id: string;
  pack_topic: string;
  pack_mode: string;
  generated_at: string;
  research_os_version: string;
  // Sections ordered as in research.yaml. Healthy + advised + fallback all
  // appear in this list; the operator sees the full pack at a glance.
  sections: SectionRecoveryResult[];
  // R-014 (v0.12 Slice 3): SHA-256 hash of canonicalized pack inputs that
  // produced this artifact (gate audits + handoff section blockers + claim
  // reviews + source-card classifications). Used by
  // `recover pack --regenerate-action-graph` to detect when the recovery
  // output is stale relative to current pack state. Missing on artifacts
  // produced before R-014; the regenerate path treats absence as
  // "stale, regenerate."
  input_state_hash?: string;
}

// ── Orchestrator input/output ───────────────────────────────────────────────

import type { ProseCallToolClient } from '../synth/prose/types.js';

export interface RecoverPackOptions {
  packPath?: string;
  // Test hook for MCP client injection.
  mcpClient?: ProseCallToolClient;
  // CLI sets this true; tests inject a client.
  spawnMcpClient?: boolean;
  // Model hint forwarded to MCP calls.
  advisorModel?: string;
  // R-014 (v0.12 Slice 3): opt-in regenerate path. When true:
  //   - Compute the current input_state_hash from pack inputs.
  //   - Read the existing recovery/blocked-section-recovery.json (if any).
  //   - If the existing artifact's input_state_hash matches → emit
  //     "no regeneration needed" and exit cleanly (no file mutation,
  //      no ledger entry, no history archive).
  //   - Else → archive the existing recovery files to recovery/history/,
  //     regenerate, append a regeneration-ledger entry.
  // When false / undefined: legacy behavior (overwrites recovery files
  // unconditionally; does not consult existing input_state_hash).
  regenerateActionGraph?: boolean;
}

// R-014 (v0.12 Slice 3): why a regenerate run exited the way it did. Closed
// vocabulary so operator reports + ledger entries are filterable.
export const REGENERATION_REASONS = [
  'state_changed',          // existing input_state_hash differs from current
  'missing_input_hash',     // pre-R-014 artifact without input_state_hash field
  'no_prior_artifact',      // recovery/blocked-section-recovery.json absent
] as const;

export type RegenerationReason = (typeof REGENERATION_REASONS)[number];

export interface RecoverPackSummary {
  packPath: string;
  packMode: string;
  jsonPath: string;
  markdownPath: string;
  totalSections: number;
  advisedSections: number;
  healthySections: number;
  fallbackSections: number;        // sections where the advisor exhausted + fallback rendered
  verifierRejections: number;       // total rejections across all advisor calls
  // R-014 (v0.12 Slice 3): regenerate-path observability. Present only when
  // `regenerateActionGraph: true` was requested. `regenerated: false` means
  // the existing artifact's input_state_hash matched current state and no
  // file mutation happened ("no regeneration needed" path).
  regenerated?: boolean;
  regenerationReason?: RegenerationReason | null;
  inputStateHash?: string;
  previousInputStateHash?: string | null;
  archivedJsonPath?: string | null;
  archivedMarkdownPath?: string | null;
}

// ── Advisor MCP call shape (internal to Layer 3) ────────────────────────────

export interface AdvisorMCPInput {
  packTopic: string;
  packMode: string;
  diagnosis: SectionDiagnosis;
  actionGraph: LawfulActionGraph;
  systemCannotSee: string[];      // computed by orchestrator; the advisor MUST echo these
  rejectionAddendum: string | null;
}

export type AdvisorCallResult =
  | { ok: true; advice: RecoveryAdvice }
  | { ok: false; error: string };

// ── Forbidding rules (the data the action graph layer reads) ────────────────

// A failure-shape forbidding table: pack-law facts about which actions are
// permanently forbidden for which failure shapes. Captured as data, not
// LLM judgment.
export interface FailureShapeForbidding {
  failure_shape: FailureShape;
  forbidden_action: RecoveryActionId;
  why_forbidden: string;
  // When true, the action is forbidden across ALL applications; when false,
  // forbidding is contextual and may not apply in every scenario. Slice 3
  // only uses permanent forbiddings.
  permanent: true;
}
