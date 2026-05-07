export interface ArtifactHash {
  path: string;
  sha256: string;
  bytes: number;
}

export interface IntegrityCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface CitationCoverage {
  cited_claim_ids: string[];
  uncited_accepted_claim_ids: string[];
  unknown_citations: string[];
  citations_to_repair: string[];
  citations_to_rejected: string[];
}

export interface FreezeReceiptPayload {
  pack_id: string;
  pack_topic: string;
  frozen_at: string;
  verdict: 'frozen';
  pack_audit_hash: string;
  handoff_hash: string;
  synthesis_hashes: ArtifactHash[];
  canonical_artifact_hashes: ArtifactHash[];
  accepted_claim_ids: string[];
  cited_claim_ids: string[];
  uncited_accepted_claim_ids: string[];
  unresolved_contradictions: Array<{
    contradiction_id: string;
    section_id: string;
    type: string;
    severity: string;
    status: string;
    disclosed_in: string[];
  }>;
  waivers_disclosed: Array<{
    family: string;
    applied_to: string;
    reason: string;
    compensating_controls: string[];
    disclosed_in: string[];
  }>;
  sections: Array<{
    section_id: string;
    status: string;
    accepted_claims: number;
    sources: number;
    contradictions: number;
  }>;
  source_count: number;
  claim_count: number;
  contradiction_count: number;
  review_finding_count: number;
  gate_result_count: number;
  integrity_checks: IntegrityCheck[];
}

export interface FreezeRefusalPayload {
  pack_id: string;
  pack_topic: string;
  checked_at: string;
  verdict: 'refused';
  reasons: string[];
  blocking_reasons: string[];
  missing_artifacts: string[];
  invalid_artifacts: Array<{ path: string; error: string }>;
  next_actions: string[];
  would_freeze: false;
}

export interface FreezeOptions {
  packPath?: string;
}

export interface FreezeSummary {
  packPath: string;
  verdict: 'frozen' | 'refused';
  jsonPath: string;
  markdownPath: string;
  receiptPayload: FreezeReceiptPayload | null;
  refusalPayload: FreezeRefusalPayload | null;
  reasonsCount: number;
  citedClaimCount: number;
  uncitedAcceptedClaimCount: number;
}
