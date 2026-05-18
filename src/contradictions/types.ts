import type { Claim } from '../claims/schema.js';

export type DetectorMode = 'auto' | 'heuristic' | 'ollama-intern';

export type ContradictionType =
  | 'direct_conflict'
  | 'scope_conflict'
  | 'temporal_conflict'
  | 'definition_conflict'
  | 'evidence_conflict'
  | 'overgeneralization_risk';

export type Severity = 'low' | 'medium' | 'high' | 'blocking';

export type ContradictionDetectorName = 'heuristic' | 'ollama-intern';

export type OverlapAssessment =
  | 'fully_overlapping'
  | 'partially_overlapping'
  | 'non_overlapping'
  | 'unknown';

export type ContradictionStatus =
  | 'unresolved'
  | 'reconciled'
  | 'preserved_deliberately'
  | 'rejected';

export interface DraftContradiction {
  type: ContradictionType;
  summary: string;
  scope_analysis: string;
  overlap_assessment: OverlapAssessment;
  severity: Severity;
  confidence: 'low' | 'medium' | 'high';
  evidence: string;
}

// R-021 — auto-mode hang-detection defaults.
//
// User-locked Phase B values (2026-05-17):
//   - 90s per-pair timeout (lowered from prior 120s default in the
//     OllamaInternContradictionDetector constructor; gate-measured warm
//     hermes3:8b pair-classify latency on the v0.4 fixture: min 6.2s,
//     median 8.4s, max 8.8s → 90s default has >= 81s headroom)
//   - 5 consecutive timeouts trigger fall-through to heuristic (gives
//     ~7.5 min of patient wait at the 90s budget; well below the operator
//     pain threshold observed at the v0.4 rerun)
export const DEFAULT_AUTO_MODE_PAIR_TIMEOUT_MS = 90_000;
export const DEFAULT_AUTO_MODE_FALL_THROUGH_AFTER_N = 5;
export const MIN_AUTO_MODE_PAIR_TIMEOUT_MS = 100;
export const MAX_AUTO_MODE_PAIR_TIMEOUT_MS = 600_000;
export const MIN_AUTO_MODE_FALL_THROUGH_AFTER_N = 1;
export const MAX_AUTO_MODE_FALL_THROUGH_AFTER_N = 100;

// R-021 — fall-through trigger info, surfaced in MapSummary and rendered into
// contradictions.md when the LLM detector fell through to heuristic mid-run.
export interface AutoModeFallThroughInfo {
  triggeredAtPairIndex: number; // 1-based pair index at which the Nth consecutive timeout fired
  consecutiveTimeouts: number;  // equal to the configured threshold
  perPairTimeoutMs: number;     // the budget that fired
  reason: 'consecutive_timeouts';
  remainingPairsHandledBy: 'heuristic';
  autoClassifiedPairs: number;       // pairs the LLM successfully classified (drafts or "none")
  heuristicClassifiedPairs: number;  // pairs the heuristic detector ran on after fall-through
}

export type DetectionResult =
  | {
      ok: true;
      drafts: PairedDraft[];
      method: string;
      // R-021 — set when the LLM detector engaged fall-through mid-run. The
      // orchestrator (map.ts) uses unprocessedPairs to run the heuristic on
      // the remaining pair set. Absent on heuristic-only runs and on clean
      // auto-mode runs that did NOT trigger fall-through.
      fallThrough?: {
        triggeredAtPairIndex: number;
        consecutiveTimeouts: number;
        perPairTimeoutMs: number;
        reason: 'consecutive_timeouts';
      };
      unprocessedPairs?: Array<[number, number]>;
    }
  | { ok: false; error: string };

export interface PairedDraft {
  claim_a: Claim;
  claim_b: Claim;
  draft: DraftContradiction;
}

export interface ContradictionDetector {
  readonly name: ContradictionDetectorName;
  available(): Promise<boolean>;
  detect(claims: Claim[]): Promise<DetectionResult>;
}

export interface MapOptions {
  sectionId: string;
  packPath?: string;
  detectors?: ContradictionDetector[];
  // Controls which detector is used. 'auto' (default) preserves existing
  // env-var-driven behavior. 'heuristic' bypasses Ollama entirely.
  // 'ollama-intern' requires LLM — exits visibly if the model is unavailable.
  detectorMode?: DetectorMode;
  // Optional Ollama config (host, model, fetchImpl) injected into the
  // OllamaInternContradictionDetector when detectorMode is 'ollama-intern'
  // or 'auto'. Primarily used in tests to mock the Ollama client.
  ollamaConfig?: { host?: string; model?: string; timeoutMs?: number; fetchImpl?: typeof fetch };
  // When true, only claims with a triage decision of selected_for_review
  // are passed to the detector. Reduces N² pair classification on dense
  // sections from intractable to manageable.
  triagedOnly?: boolean;
  // R-021 — per-pair timeout for LLM classification in auto / ollama-intern
  // modes. Default = DEFAULT_AUTO_MODE_PAIR_TIMEOUT_MS (90s). Overrides
  // ollamaConfig.timeoutMs when both are set (latter is a test-only mock
  // injection; the operator-facing surface is this option).
  autoModePairTimeoutMs?: number;
  // R-021 — after this many consecutive per-pair timeouts/failures in the
  // LLM detector, the orchestrator falls through to the heuristic detector
  // for the remaining pair set. Default = DEFAULT_AUTO_MODE_FALL_THROUGH_AFTER_N (5).
  // No effect when detectorMode is 'heuristic'.
  autoModeFallThroughAfterNTimeouts?: number;
}

export interface MapSummary {
  sectionId: string;
  detector: ContradictionDetectorName;
  detectionMethod: string;
  candidateClaims: number;
  pairsCompared: number;
  contradictionsAdded: number;
  contradictionsDeduped: number;
  contradictionIds: string[];
  detectorError: string | null;
  // Emitted at run-start by the CLI. Encodes which detector ran and why.
  detectorAnnouncement: string;
  // R-021 — populated when the auto-mode LLM detector engaged fall-through.
  // Absent on heuristic-only runs and on clean LLM runs that did not trigger
  // fall-through. Carries the trigger metadata + the per-detector pair counts.
  autoModeFallThrough?: AutoModeFallThroughInfo;
}
