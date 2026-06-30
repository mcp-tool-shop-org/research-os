import { z } from 'zod';
import { ReviewerOptionsSchema } from './reviewer-options-schema.js';

export const FindingCategorySchema = z.enum([
  'unsupported_claim',
  'ungrounded_excerpt',
  'stale_claim',
  'overgeneralized_claim',
  'scope_widening',
  'missing_not_constraint',
  'source_quality_problem',
  'source_cluster_monopoly',
  'unmapped_contradiction',
  'recommendation_exceeds_evidence',
  'hidden_synthesis',
  'definition_drift',
  'temporal_mismatch',
  // Span-first + paged extraction can yield dense, atomized claim sets that
  // are individually grounded but collectively redundant. The reviewer flags
  // these so synthesis-worthiness — not just structural grounding — decides
  // what reaches synthesis.
  'claim_overproduction',
  // Per-claim synthesis-worthiness call: this individual claim is grounded
  // and well-formed but does not earn a synthesis slot (low leverage,
  // restating context, definitional boilerplate, etc.). Distinct from
  // claim_overproduction (section/source-level pressure signal): a section
  // can be over-dense without every claim being individually low-value, and
  // a low-value claim can appear in a perfectly-sized section.
  'valid_but_low_value',
]);

export const FindingSeveritySchema = z.enum(['info', 'warn', 'block']);

export const ReviewerNameSchema = z.enum(['heuristic', 'ollama-intern']);

export const ReviewDecisionSchema = z.enum([
  'accepted_for_synthesis',
  'rejected',
  // Phase 1b-b (v0.8.0): extract-time section-evidence critic decided this
  // claim is not section-evidence. Outside synthesis flow.
  'frame_excluded',
  'needs_scope_repair',
  'needs_source_repair',
  'needs_contradiction_mapping',
  'needs_human_review',
]);

export const ReviewConfidenceSchema = z.enum(['low', 'medium', 'high']);

export const ReviewFindingSchema = z.object({
  finding_id: z.string().regex(/^fnd_[a-f0-9]{12}$/),
  section_id: z.string().regex(/^[0-9]{2}-[a-z0-9-]+$/),
  claim_ids: z.array(z.string().regex(/^clm_[a-f0-9]{12}_(heuristic|ollama_intern)_\d+$/)),
  source_ids: z.array(z.string().regex(/^src_[a-f0-9]{12}$/)),
  category: FindingCategorySchema,
  severity: FindingSeveritySchema,
  summary: z.string().min(1),
  evidence: z.string(),
  required_action: z.string(),
  reviewer: ReviewerNameSchema,
  review_method: z.string().min(1),
  confidence: ReviewConfidenceSchema,
  created_at: z.string(),
});

export const ClaimReviewSchema = z.object({
  claim_id: z.string().regex(/^clm_[a-f0-9]{12}_(heuristic|ollama_intern)_\d+$/),
  decision: ReviewDecisionSchema,
  reason: z.string().min(1),
  finding_ids: z.array(z.string()),
  reviewer: ReviewerNameSchema,
  review_method: z.string().min(1),
  created_at: z.string(),
  // v0.5: optional profile lineage. Additive-optional — pre-v0.5 records
  // without this field parse cleanly. Frozen packs unaffected (Zod .optional()
  // with no .default() leaves absent keys absent on round-trip).
  profile: z.string().optional(),
});

export const ReviewSnapshotSchema = z.object({
  section_id: z.string().regex(/^[0-9]{2}-[a-z0-9-]+$/),
  reviewer: ReviewerNameSchema,
  review_method: z.string(),
  reviewed_at: z.string(),
  candidate_claims: z.number().int().nonnegative(),
  findings: z.array(ReviewFindingSchema),
  claim_reviews: z.array(ClaimReviewSchema),
  decision_counts: z.record(ReviewDecisionSchema, z.number().int().nonnegative()),
  severity_counts: z.record(FindingSeveritySchema, z.number().int().nonnegative()),
  llm_findings_rejected_ungrounded: z.number().int().nonnegative(),
  promoted_to_reviewed: z.boolean(),
  reviewer_options: ReviewerOptionsSchema.optional(),
  // B-C-004: optional profile-lineage breadcrumb. Mirrors ClaimReviewSchema's
  // F-53 additive-optional pattern. Present = operator can cross-check this
  // review against review-active.json + sections/<id>/reviews/<profile>/ by
  // a single name. Absent = legacy snapshot from pre-B-C-004 build (parses
  // cleanly; no migration needed).
  profile: z.string().optional(),
  // B-REVIEW-001: durable receipt of partial reviewer-window failure. A paged
  // LLM reviewer can succeed overall while some windows' calls failed; those
  // windows' claims received NO findings and would silently auto-accept.
  // Present (>0) records how many of windows_total failed so the snapshot is
  // an honest partial-coverage receipt. Both omitted on a clean run — keeps
  // default-path snapshots byte-identical (additive-optional, no .default()).
  windows_failed: z.number().int().nonnegative().optional(),
  windows_total: z.number().int().nonnegative().optional(),
  // B-REVIEW-002: reviewer:error strings for reviewers that failed during a
  // multi-pass run that still completed (partial cascade). Absent when every
  // reviewer succeeded; present so the dropped LLM failures escape the
  // all-failed branch and survive on the persisted snapshot.
  failed_reviewers: z.array(z.string()).optional(),
});

export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;
export type ClaimReview = z.infer<typeof ClaimReviewSchema>;
export type ReviewSnapshot = z.infer<typeof ReviewSnapshotSchema>;
