import type { Claim } from '../claims/schema.js';
import type { Contradiction } from '../contradictions/schema.js';
import type { FetchReceipt, SourceCard } from '../sources/schema.js';
import type { ResearchYaml, Section } from '../intake/schema.js';
import type { SectionGateResult } from '../gates/schema.js';

export type FindingCategory =
  | 'unsupported_claim'
  | 'ungrounded_excerpt'
  | 'stale_claim'
  | 'overgeneralized_claim'
  | 'scope_widening'
  | 'missing_not_constraint'
  | 'source_quality_problem'
  | 'source_cluster_monopoly'
  | 'unmapped_contradiction'
  | 'recommendation_exceeds_evidence'
  | 'hidden_synthesis'
  | 'definition_drift'
  | 'temporal_mismatch'
  | 'claim_overproduction'
  | 'valid_but_low_value';

export type FindingSeverity = 'info' | 'warn' | 'block';

export type ReviewerName = 'heuristic' | 'ollama-intern';

export type ReviewDecision =
  | 'accepted_for_synthesis'
  | 'rejected'
  | 'needs_scope_repair'
  | 'needs_source_repair'
  | 'needs_contradiction_mapping'
  | 'needs_human_review';

export interface DraftFinding {
  category: FindingCategory;
  severity: FindingSeverity;
  summary: string;
  evidence: string;
  required_action: string;
  claim_ids: string[];
  source_ids: string[];
  confidence: 'low' | 'medium' | 'high';
}

export type ReviewerResult =
  | { ok: true; drafts: DraftFinding[]; method: string; rejected_ungrounded?: number }
  | { ok: false; error: string };

export interface ReviewerInput {
  research: ResearchYaml;
  section: Section;
  candidateClaims: Claim[];
  sources: SourceCard[];
  receipts: FetchReceipt[];
  contradictions: Contradiction[];
  gateResult: SectionGateResult | null;
  rawTextBySourceId: Map<string, string>;
  briefText: string | null;
}

export interface Reviewer {
  readonly name: ReviewerName;
  available(): Promise<boolean>;
  review(input: ReviewerInput): Promise<ReviewerResult>;
}

export interface RunReviewOptions {
  sectionId: string;
  packPath?: string;
  reviewers?: Reviewer[];
}

export interface RunReviewSummary {
  sectionId: string;
  reviewer: ReviewerName;
  reviewMethod: string;
  candidateClaims: number;
  findingsAdded: number;
  findingsDeduped: number;
  llmFindingsRejected: number;
  decisions: Record<ReviewDecision, number>;
  blockingFindings: number;
  promotedToReviewed: boolean;
}
