export interface SectionAcceptedSummary {
  section_id: string;
  purpose: string;
  status: string;
  accepted_claim_ids: string[];
  excluded_reason: string | null;
}

export interface ClaimCluster {
  cluster_id: string;
  shared_source_ids: string[];
  member_claim_ids: string[];
  spans_sections: string[];
}

export interface SharedSource {
  source_id: string;
  publisher: string | null;
  source_type: string;
  used_by_claim_ids: string[];
  spans_sections: string[];
}

export interface ScopeOverlap {
  claim_a: string;
  claim_b: string;
  scope_a: string | null;
  scope_b: string | null;
  jaccard: number;
  cross_section: boolean;
  warning: string;
}

export interface CrossSectionContradictionRef {
  contradiction_id: string;
  claim_ids: string[];
  sections: string[];
  type: string;
  severity: string;
  status: string;
}

export interface WaiverDependency {
  scope: 'pack' | 'gate';
  family: string;
  reason: string;
  compensating_controls: string[];
  applied_to: string;
  must_disclose_in: 'decision-brief.md' | 'final-report.md' | 'both';
}

export interface AllowedSynthesisInput {
  claim_id: string;
  section_id: string;
  artifact_path: string;
  asserts: string;
  scope: string | null;
  not: string | null;
  source_ids: string[];
}

export interface ForbiddenInput {
  claim_id: string;
  section_id: string;
  decision: string;
  reason: string;
}

export interface CrossSectionMap {
  pack_id: string;
  pack_topic: string;
  pack_decision: string;
  generated_at: string;
  accepted_claim_ids: string[];
  sections: SectionAcceptedSummary[];
  claim_clusters: ClaimCluster[];
  shared_sources: SharedSource[];
  scope_overlaps: ScopeOverlap[];
  cross_section_contradictions: CrossSectionContradictionRef[];
  waiver_dependencies: WaiverDependency[];
  open_questions: string[];
  allowed_synthesis_inputs: AllowedSynthesisInput[];
  forbidden_inputs: ForbiddenInput[];
}

export interface WorkspaceOptions {
  packPath?: string;
}

export interface WorkspaceSummary {
  packPath: string;
  mode: string;
  refused: boolean;
  refusalReason: string | null;
  filesWritten: string[];
  acceptedClaims: number;
  claimClusters: number;
  scopeOverlaps: number;
  crossSectionContradictions: number;
}
