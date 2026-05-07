export type PackVerdict =
  | 'ready_for_synthesis'
  | 'repair_required'
  | 'human_review_required'
  | 'blocked';

export type HandoffMode =
  | 'repair_required'
  | 'synthesis_ready'
  | 'human_review_required'
  | 'unknown';

export interface OrphanClaimRow {
  claim_id: string;
  section_id: string;
  reason:
    | 'missing_source_card'
    | 'missing_source_hash'
    | 'missing_evidence_excerpt'
    | 'unresolvable_source_id';
  details: string;
  artifact_path: string;
}

export interface StaleSourceRow {
  source_id: string;
  section_id: string;
  publisher: string | null;
  reason: 'too_old' | 'missing_date' | 'unparseable_date';
  details: string;
  artifact_path: string;
  policy: {
    required: boolean;
    max_source_age_months: number | null;
    stale_source_policy: 'warn' | 'fail';
  };
}

export interface WeakSourceRow {
  reason:
    | 'source_cluster_monopoly'
    | 'low_independent_publishers'
    | 'missing_primary_source'
    | 'excessive_type_imbalance'
    | 'failed_fetches_reducing_floor';
  section_id: string;
  details: string;
  evidence_ids: string[];
  artifact_path: string;
}

export interface UnresolvedContradictionRow {
  contradiction_id: string;
  section_id: string;
  type: string;
  severity: string;
  status: string;
  claim_ids: string[];
  artifact_path: string;
}

export interface ScopeWideningRiskRow {
  reason:
    | 'overgeneralization_finding'
    | 'scope_null_in_use'
    | 'missing_not_flagged'
    | 'contextual_to_universal_risk';
  claim_id: string;
  section_id: string;
  details: string;
  artifact_path: string;
}

export interface SourceDiversityGapRow {
  reason:
    | 'section_publisher_monopoly'
    | 'low_section_publisher_count'
    | 'cross_section_publisher_overlap'
    | 'section_has_no_sources';
  section_id: string;
  details: string;
  evidence_ids: string[];
}

export interface SynthesisReadinessRow {
  section_id: string;
  purpose: string;
  status: string;
  has_gate_run: boolean;
  has_review_run: boolean;
  gate_verdict: string | null;
  synthesis_eligible: boolean;
  candidate_claims: number;
  accepted_claims: number;
  repair_claims: number;
  rejected_claims: number;
  blocking_reasons: string[];
  cowork_handoff_mode: HandoffMode;
  workspace_allowed: boolean;
}

export interface ClaimSummary {
  total: number;
  candidate: number;
  accepted_for_synthesis: number;
  rejected: number;
  needs_repair: number;
  no_review: number;
  with_evidence_excerpt: number;
  with_source_hashes: number;
  scope_null: number;
  not_null: number;
  orphans: number;
}

export interface SourceSummary {
  total: number;
  primary: number;
  secondary: number;
  forum: number;
  benchmark: number;
  docs: number;
  unknown: number;
  independent_publishers: number;
  failed_fetches: number;
  sections_with_sources: number;
  sections_without_sources: number;
}

export interface ContradictionSummary {
  total: number;
  unresolved: number;
  blocking: number;
  reconciled: number;
  preserved_deliberately: number;
  rejected: number;
  by_type: Record<string, number>;
  sections_with_clean_ledger: number;
}

export interface ReviewSummary {
  sections_with_review_run: number;
  sections_without_review_run: number;
  decision_counts: Record<string, number>;
  blocking_findings: number;
}

export interface WaiverSummary {
  total: number;
  invalid: number;
  by_family: Record<string, number>;
}

export interface ReadinessSummary {
  total_sections: number;
  ready_sections: number;
  repair_sections: number;
  blocked_sections: number;
  no_gate_sections: number;
  no_review_sections: number;
  cowork_handoff_mode: HandoffMode;
  workspace_allowed: boolean;
}

export interface PackAuditPayload {
  pack_id: string;
  pack_topic: string;
  generated_at: string;
  verdict: PackVerdict;
  synthesis_allowed: boolean;
  section_summaries: SynthesisReadinessRow[];
  claim_summary: ClaimSummary;
  source_summary: SourceSummary;
  contradiction_summary: ContradictionSummary;
  review_summary: ReviewSummary;
  waiver_summary: WaiverSummary;
  readiness_summary: ReadinessSummary;
  audit_files: string[];
  blocking_reasons: string[];
  warnings: string[];
  next_actions: string[];
}

export interface AuditOptions {
  packPath?: string;
}

export interface AuditSummary {
  packPath: string;
  verdict: PackVerdict;
  synthesisAllowed: boolean;
  filesWritten: string[];
  warnings: string[];
  blockingReasons: string[];
  orphans: number;
  staleSources: number;
  weakSources: number;
  unresolvedContradictions: number;
  scopeWideningRisks: number;
  sourceDiversityGaps: number;
}
