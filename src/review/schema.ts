import { z } from 'zod';

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
});

export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;
export type ClaimReview = z.infer<typeof ClaimReviewSchema>;
export type ReviewSnapshot = z.infer<typeof ReviewSnapshotSchema>;
