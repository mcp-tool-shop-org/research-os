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

export type DetectionResult =
  | { ok: true; drafts: PairedDraft[]; method: string }
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
}
