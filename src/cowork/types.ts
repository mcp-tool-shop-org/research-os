export type HandoffMode = 'repair_required' | 'synthesis_ready' | 'human_review_required';

export type IndexStatus = 'present' | 'missing';

export interface SectionState {
  section_id: string;
  purpose: string;
  status: string;
  has_gate_run: boolean;
  has_review_run: boolean;
  gate_verdict: string | null;
  synthesis_eligible: boolean;
  accepted_claim_ids: string[];
  repair_claim_ids: string[];
  rejected_claim_ids: string[];
  candidate_claims_total: number;
  unresolved_contradiction_ids: string[];
  blocking_reasons: string[];
  blocking_contradictions_unresolved: number;
}

export interface WaiverEntry {
  scope: 'pack' | 'gate';
  family: string;
  reason: string;
  compensating_controls: string[];
  applied_to: string;
}

export interface GateVerdictEntry {
  section_id: string;
  verdict: string;
  synthesis_eligible: boolean;
}

export interface ReviewDecisionCount {
  section_id: string;
  decision: string;
  count: number;
}

export interface CoworkHandoffPayload {
  pack_id: string;
  pack_topic: string;
  generated_at: string;
  mode: HandoffMode;
  synthesis_allowed: boolean;
  summary: string;
  sections: SectionState[];
  accepted_claim_ids: string[];
  repair_claim_ids: string[];
  blocked_claim_ids: string[];
  unresolved_contradiction_ids: string[];
  waivers: WaiverEntry[];
  gate_verdicts: GateVerdictEntry[];
  review_decisions: ReviewDecisionCount[];
  recommended_next_actions: string[];
  allowed_write_paths: string[];
  forbidden_actions: string[];
  index_status: IndexStatus;
  warnings: string[];
}

export interface HandoffOptions {
  packPath?: string;
}

export interface HandoffSummary {
  packId: string;
  packTopic: string;
  mode: HandoffMode;
  synthesisAllowed: boolean;
  jsonPath: string;
  markdownPath: string;
  warnings: string[];
  acceptedCount: number;
  repairCount: number;
  blockedCount: number;
}
