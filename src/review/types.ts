import type { Claim } from '../claims/schema.js';
import type { ReviewerOptions } from './reviewer-options-schema.js';
import type { Contradiction } from '../contradictions/schema.js';
import type { ContradictionResolution } from '../contradictions/resolution-schema.js';
import type { Excerpt } from '../sources/excerpts/schema.js';
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
  // Phase 1b-b (v0.8.0): the per-claim section-evidence critic decided this
  // claim is not section-evidence (off_topic / background_only / source_chrome).
  // Emitted at REVIEW time with no findings and no review LLM call — the
  // critic already decided at extract time. Outside synthesis flow, same as
  // rejected, but the routing reason is admissibility, not adjudication.
  | 'frame_excluded'
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
  // C2-002: on cascade failure callers want to tell the operator how much
  // work completed before the cascade gave up. Both fields are optional —
  // heuristic reviewer has no concept of windows. ollama-intern populates
  // them so the eventual ReviewerCascadeFailedError hint can read
  // "Completed N/M windows before cascade failure." instead of leaving the
  // operator guessing whether the reviewer hung on window 1 or window 11.
  | {
      ok: false;
      error: string;
      completedWindows?: number;
      totalWindows?: number;
    };

export interface ReviewerInput {
  research: ResearchYaml;
  section: Section;
  candidateClaims: Claim[];
  sources: SourceCard[];
  receipts: FetchReceipt[];
  contradictions: Contradiction[];
  /** Resolution ledger entries — latest-wins per contradiction_id. Optional for backward compat. */
  resolutions?: ContradictionResolution[];
  gateResult: SectionGateResult | null;
  rawTextBySourceId: Map<string, string>;
  // Span-first ledgers, keyed by source_id. Each value is excerpt_id → Excerpt.
  // Reviewers use this to validate evidence_excerpt_ids structurally rather
  // than re-normalising raw text and substring-searching for a copied excerpt
  // (the original anti-hallucination check, now obsolete under span-first).
  excerptsBySourceId: Map<string, Map<string, Excerpt>>;
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
  // When true, only claims with a triage decision of selected_for_review
  // are reviewed. Parked claims remain on the canonical ledger; review
  // simply skips them.
  triagedOnly?: boolean;
  // When true, runs every available reviewer in `reviewers` (or in the
  // default ladder) sequentially and merges their findings instead of
  // picking the first available one. The classic two-pass shape:
  // general LLM reviewer + narrow-critic LLM reviewer + heuristic.
  multiPass?: boolean;
  // Review profile name. Profile artifacts are always written under
  // sections/<id>/reviews/<profile>/. Canonical paths
  // (audits/<id>-review.{json,md}, audits/<id>-findings.jsonl,
  // sections/<id>/claim-reviews.jsonl) are also written when:
  //   profile === 'default'  OR  profile === <currently-active-profile>.
  // This way, A/B reviewer experiments are evidence, not section truth,
  // until explicitly promoted via `research-os review promote`.
  profile?: string;
  // Reviewer sampling options (temperature, seed, etc.) extracted from the
  // active preset. Stamped onto review.json for direct disclosure.
  reviewer_options?: ReviewerOptions;
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
