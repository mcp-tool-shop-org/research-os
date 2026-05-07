import type { Claim } from '../claims/schema.js';

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
}
